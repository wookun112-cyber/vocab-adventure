const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const TYPES=['mc_context','mc_usage','subjective_context','subjective_dialogue'];
const DOMAINS=['국어','사회','과학','수학·논리','감정·관계','생활'];

async function verifyUser(auth){
  if(!auth?.startsWith('Bearer '))return false;
  const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:auth}});
  return r.ok;
}
function extractText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const out=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')out.push(c.text);
  return out.join('\n');
}
async function ask(prompt,schema,name,max=9000){
  const model=process.env.OPENAI_MODEL||'gpt-6-luna';
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,reasoning:{effort:'low'},max_output_tokens:max,input:prompt,
      text:{format:{type:'json_schema',name,strict:true,schema}}
    })
  });
  if(!r.ok)throw new Error('OpenAI '+r.status+': '+(await r.text()).slice(0,350));
  return JSON.parse(extractText(await r.json()).trim());
}
const norm=s=>String(s||'').replace(/[\s"'“”‘’.,!?()[\]{}]/g,'').toLowerCase();
const sentenceCount=s=>(String(s||'').match(/[.!?]/g)||[]).length;
const blankCount=s=>(String(s||'').match(/＿＿＿＿/g)||[]).length;
const hasCompare=s=>/(?:두|둘|2개(?:의)?)\s*(?:단어|어휘).{0,30}(?:차이|비교|구별)|(?:차이|비교|구별).{0,30}(?:두|둘|2개(?:의)?)\s*(?:단어|어휘)|[“"][^”"]+[”"]\s*(?:와|과|랑|하고)\s*[“"][^”"]+[”"].{0,30}(?:차이|비교|구별)/.test(String(s||''));
const hasDefinePrompt=s=>/(뜻을\s*(?:설명|써|말)|정의(?:를)?\s*(?:설명|써|말)|무슨 뜻인지 설명)/.test(String(s||''));
function finalConsonant(word){
 const last=String(word||'').normalize('NFC').at(-1)?.charCodeAt(0);
 return last>=0xac00&&last<=0xd7a3?(last-0xac00)%28:null;
}
function expectedParticle(word,particle){
 const end=finalConsonant(word);if(end===null)return particle;
 for(const [has,none] of [['이','가'],['은','는'],['을','를'],['과','와']])if(particle===has||particle===none)return end?has:none;
 if(particle==='으로'||particle==='로')return end&&end!==8?'으로':'로';
 return particle;
}
function blankParticle(context){return String(context||'').match(/＿＿＿＿(으로|로|이|가|은|는|을|를|과|와)(?=\s|[,.!?“”"'():;]|$)/)?.[1]||''}
function normalizeCandidate(q,item){
  q={...q};
  if(['mc_context','subjective_context','subjective_dialogue'].includes(item.type)){
    let c=String(q.context||'');
    c=c.replace(/＿{2,}|_{3,}|□{2,}|○{2,}|\[\s*빈칸\s*\]|\(\s*빈칸\s*\)|<\s*빈칸\s*>/g,'＿＿＿＿');
    if(blankCount(c)===0&&c.includes(item.word))c=c.replace(item.word,'＿＿＿＿');
    const particle=blankParticle(c);
    if(particle)c=c.replace('＿＿＿＿'+particle,'＿＿＿＿'+expectedParticle(item.word,particle));
    q.context=c;
  }
  if(item.type==='mc_usage')q.context=String(q.context||'').replace(/＿{2,}|_{3,}/g,'');
  q.showTarget=item.type==='mc_usage';
  if(item.type.startsWith('mc_')&&Array.isArray(q.options)){
    const opts=q.options.map(x=>({...x}));
    const idx=opts.findIndex(x=>x.correct);
    if(idx>=0&&opts.filter(x=>x.correct).length===1&&idx!==item.answerSlot){
      const [correct]=opts.splice(idx,1);
      opts.splice(item.answerSlot,0,correct);
      q.options=opts;
    }
  }else if(!item.type.startsWith('mc_'))q.options=[];
  return q;
}


function passageKeys(context,options=[]){
 const texts=[context,...options];
 const keys=new Set();
 for(const text of texts){
   const units=[String(text||''),...String(text||'').split(/[.!?。！？\n]+/)];
   for(const unit of units){
     const clean=unit.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
     if(clean.length<12)continue;
     let a=2166136261,b=5381;
     for(let i=0;i<clean.length;i++){a=Math.imul(a^clean.charCodeAt(i),16777619);b=Math.imul(b,33)^clean.charCodeAt(i);}
     keys.add((a>>>0).toString(16)+'-'+(b>>>0).toString(16));
   }
 }
 return [...keys];
}
function deterministic(q,item){
  const issues=[];
  const previous=new Set([...(item.usedPassageKeys||[]),...(item.previousContexts||[]).flatMap(p=>passageKeys(p.context,p.options||[]))]);
  if(passageKeys(q.context,(q.options||[]).map(o=>o.text)).some(k=>previous.has(k)))issues.push('previous_sentence_reused');
  if(q.type!==item.type)issues.push('requested_type_mismatch');
  if(hasCompare(q.prompt))issues.push('comparison_question');
  if(hasDefinePrompt(q.prompt))issues.push('definition_explanation_prompt');
  const hidden=item.type!=='mc_usage';
  if(hidden&&q.showTarget)issues.push('hidden_type_showTarget_true');
  if(item.type==='mc_usage'&&!q.showTarget)issues.push('usage_type_showTarget_false');
  if(hidden&&(String(q.prompt).includes(item.word)||String(q.context).includes(item.word)))issues.push('target_leaked_before_answer');
  if(item.type==='mc_usage'&&blankCount(q.context)!==0)issues.push('usage_question_has_blank');
  if(['mc_context','subjective_context','subjective_dialogue'].includes(item.type)&&blankCount(q.context)!==1)issues.push('blank_count_not_one');
  if(item.type==='subjective_dialogue'&&!/[“”"':：]|\n/.test(q.context))issues.push('dialogue_not_clear');
  if(['mc_context','subjective_context','subjective_dialogue'].includes(item.type)&&sentenceCount(q.context)<2)issues.push('context_too_short');
  if(item.type.startsWith('mc_')){
    if(!Array.isArray(q.options)||q.options.length!==5)issues.push('not_five_choices');
    const correct=(q.options||[]).filter(x=>x.correct);
    if(correct.length!==1)issues.push('not_exactly_one_marked_answer');
    if(new Set((q.options||[]).map(x=>norm(x.text))).size!==5)issues.push('duplicate_choices');
    const idx=(q.options||[]).findIndex(x=>x.correct);
    if(idx!==item.answerSlot)issues.push('wrong_answer_slot');
    if(item.type==='mc_context'){
      const particle=blankParticle(q.context);
      if(particle&&(q.options||[]).some(o=>expectedParticle(o.text,particle)!==particle))issues.push('choice_particle_mismatch');
    }
    if(item.type==='mc_context'&&!correct.some(x=>norm(x.text)===norm(item.word)))issues.push('target_not_correct_choice');
    if(item.type==='mc_usage'&&hasCompare((q.options||[]).map(x=>x.text).join(' ')))issues.push('usage_choices_compare_words');
  }else{
    if((q.options||[]).length)issues.push('subjective_has_choices');
    const full=(q.acceptedAnswers||[]).some(x=>norm(x.text)===norm(item.word)&&Number(x.credit)===1);
    if(!full)issues.push('target_missing_from_accepted_answers');
  }
  if(!Array.isArray(q.hints)||q.hints.length!==2)issues.push('hints_not_two_steps');
  if(!String(q.signature||'').trim())issues.push('missing_signature');
  return issues;
}
function questionSchema(items){
  return {
    type:'object',properties:{questions:{type:'array',minItems:items.length,maxItems:items.length,items:{
      type:'object',properties:{
        id:{type:'string'},
        type:{type:'string',enum:TYPES},
        prompt:{type:'string'},
        context:{type:'string'},
        showTarget:{type:'boolean'},
        partOfSpeech:{type:'string',enum:['명사','동사','형용사','부사','기타']},
        options:{type:'array',minItems:0,maxItems:5,items:{type:'object',properties:{
          text:{type:'string'},correct:{type:'boolean'},reason:{type:'string'}
        },required:['text','correct','reason'],additionalProperties:false}},
        acceptedAnswers:{type:'array',minItems:0,maxItems:6,items:{type:'object',properties:{
          text:{type:'string'},credit:{type:'number',enum:[1,0.5]},rationale:{type:'string'}
        },required:['text','credit','rationale'],additionalProperties:false}},
        hints:{type:'array',minItems:2,maxItems:2,items:{type:'string'}},
        feedbackCorrect:{type:'string'},
        signature:{type:'string'}
      },required:['id','type','prompt','context','showTarget','partOfSpeech','options','acceptedAnswers','hints','feedbackCorrect','signature'],
      additionalProperties:false
    }}},required:['questions'],additionalProperties:false
  };
}
function verifySchema(items){
  return {
    type:'object',properties:{reviews:{type:'array',minItems:items.length,maxItems:items.length,items:{
      type:'object',properties:{
        id:{type:'string'},
        valid:{type:'boolean'},
        sufficientClues:{type:'boolean'},
        oneClearAnswer:{type:'boolean'},
        samePartOfSpeechChoices:{type:'boolean'},
        naturalKorean:{type:'boolean'},
        coherentSituation:{type:'boolean'},
        ageAppropriate:{type:'boolean'},
        noBackgroundBurden:{type:'boolean'},
        noAnswerLeak:{type:'boolean'},
        naturalAlternativesConsidered:{type:'boolean'},
        notTooSimilarToRecent:{type:'boolean'},
        acceptedAnswers:{type:'array',minItems:0,maxItems:7,items:{type:'object',properties:{
          text:{type:'string'},credit:{type:'number',enum:[1,0.5]},rationale:{type:'string'}
        },required:['text','credit','rationale'],additionalProperties:false}},
        issues:{type:'array',items:{type:'string'}}
      },
      required:['id','valid','sufficientClues','oneClearAnswer','samePartOfSpeechChoices','naturalKorean','coherentSituation','ageAppropriate','noBackgroundBurden','noAnswerLeak','naturalAlternativesConsidered','notTooSimilarToRecent','acceptedAnswers','issues'],
      additionalProperties:false
    }}},required:['reviews'],additionalProperties:false
  };
}
function generationPrompt(items,recent,feedback={}){
  return [
    '한국어 어휘 학습 앱용 문제를 만드세요. 목표는 사전 정의 암기가 아니라 문맥에서 뜻을 이해하고 필요한 어휘를 떠올려 사용하는 능력입니다.',
    '',
    '공통 규칙:',
    '- 각 문제는 목표 어휘 하나와 질문 하나만 다룹니다. 두 단어 비교, 두 빈칸, 정의를 서술시키는 문제는 금지합니다.',
    '- 지문은 쉬운 2~4문장으로 쓰고 누가 무엇을 했는지, 왜 그런지, 결과가 무엇인지 중 필요한 단서를 넣습니다.',
    '- 단순히 길게 늘리지 말고 정답 판단에 필요한 의미 있는 단서를 2개 이상 제공합니다.',
    '- 목표 어휘 외 표현은 해당 학습 단계보다 쉽게 씁니다. 어려운 배경지식·복잡한 추론이 핵심이 되면 안 됩니다.',
    '- 가족, 학교, 친구, 동물, 놀이, 자연, 과학, 탐험 등 배경을 다양하게 바꿉니다.',
    '- previousContexts는 같은 어휘의 이전 실제 지문/보기입니다. 기존 문장, 사건, 핵심 행동과 결과를 재사용하지 마세요. 이름·장소·사물만 바꾸는 재작성도 금지합니다. 같은 배치에서 같은 어휘가 반복되면 각각 다른 사건과 문장 구조를 사용하세요.',
    '- 사전 example을 지문으로 복사하지 마세요. 목표어가 그 상황에서 실제로 쓰이는 자연스러운 표현인지 먼저 확인하세요. 목표어가 조사·서술어와 자연스럽게 호응하도록 완성 문장을 읽어 보고 작성하세요.',
    '- 한 장면 안에서 인물, 시간, 행동, 이유, 결과가 일관되게 이어져야 합니다. 이유 없는 행동, 갑자기 등장하는 사건, 앞 문장과 무관한 결론은 금지합니다.',
    '- 정답을 억지로 넣기 위해 같은 설명을 반복하거나 \"이것은 X이다\"라는 정의 문장을 덧붙이지 마세요. 단서가 사건 속에서 드러나는 간결하고 완결된 문장으로 씁니다.',
    '- 대화는 실제 아이들이 말할 법한 짧은 발화로 작성하고, 앞사람의 말에 자연스럽게 응답하세요. 설명문을 따옴표 안에 넣은 가짜 대화는 금지합니다.',
    '- mc_context, subjective_context, subjective_dialogue의 context는 생성 단계 내부용으로 목표 어휘를 정확히 한 번 포함한 완성 문장으로 작성하세요. 서버가 그 한 곳을 빈칸으로 바꿔 학생에게 보여줍니다. 목표 어휘를 두 번 이상 쓰지 마세요.',
    '- mc_usage에서는 목표 어휘를 질문에 보여주고, 보기 5개는 그 어휘가 가장 알맞은 서로 다른 상황으로 만듭니다. 목표 어휘를 보기마다 억지로 반복해서 넣지 마세요.',
    '- 객관식은 정확히 5지선다이며 정답은 지정된 answerSlot 위치에 정확히 하나만 둡니다.',
    '- 빈칸 다음의 조사(이/가, 은/는, 을/를, 과/와, 으로/로)는 목표어의 받침에 맞아야 합니다. mc_context는 보기 5개를 각각 넣어도 조사가 맞아야 하므로, 가능하면 받침에 무관한 ‘에’, ‘의’ 등의 표현을 쓰고, 받침에 따라 달라지는 조사를 쓴다면 보기의 받침 조건을 모두 맞추세요.',
    '- mc_context 보기 5개는 목표어와 같은 품사의 관련 어휘로 만듭니다. 모든 보기가 문법적으로 빈칸에 들어갈 수 있어야 하고 의미 단서로만 정답이 갈려야 합니다.',
    '- mc_usage는 길이와 문장 형태가 비슷한 자연스러운 상황 5개로 만듭니다. 정답 상황 하나만 목표 어휘의 핵심 의미와 정확히 맞고, 나머지는 관련은 있지만 핵심 행동·의도·결과가 달라야 합니다.',
    '- 오답은 관련성은 있으나 핵심 단서와 맞지 않게 만듭니다. 억지 오답·명백한 품사 불일치 금지입니다.',
    '- 주관식 acceptedAnswers에는 목표어 자체를 credit 1로 반드시 넣고, 다른 표현도 문맥상 완전히 자연스러우면 credit 1, 일부만 맞으면 credit 0.5로 넣습니다. 유의어라는 이유만으로 넣지 않습니다.',
    '- supportLevel이 1 이상이면 문장을 더 짧고 쉽게 쓰고, 2~3이면 핵심 단서를 더 분명하게 제시합니다.',
    '- successStreak가 3 이상이면 같은 뜻을 학교 밖, 자연, 탐험, 과학 등 덜 익숙한 새 상황에도 적용하도록 배경을 바꿉니다.',
    '- firstLearning=true인 첫 객관식 문제는 특히 쉬운 상황과 분명한 단서를 사용합니다.',
    '- 힌트 1은 핵심 의미 단서를 가리키고, 힌트 2는 의미 범위를 좁히되 정답을 직접 말하지 않습니다. 객관식에서는 선택지 번호, 선택지의 고유 문구, 정답 문장을 인용하지 마세요.',
    '- feedbackCorrect는 문맥 단서와 어휘 의미를 연결한 1~2문장입니다.',
    '- signature는 최근 문제와 중복을 피하기 위한 짧은 상황 요약입니다.',
    '',
    '유형 정의:',
    'mc_context: 2~4문장 상황에 목표 어휘를 정확히 한 번 자연스럽게 넣으세요. 서버가 그 자리를 빈칸으로 바꾼 뒤 5개 중 고르게 합니다.',
    'mc_usage: 목표 단어를 질문에 제시하고, 그 단어를 쓰기에 가장 알맞은 상황 하나를 5개의 평행한 상황 보기 중 고릅니다. 빈칸은 쓰지 않습니다.',
    'subjective_context: 2~4문장 상황에 목표 어휘를 정확히 한 번 자연스럽게 넣으세요. 서버가 그 자리를 빈칸으로 바꾼 뒤 보기 없이 입력하게 합니다.',
    'subjective_dialogue: 2~4개의 짧은 대화 흐름에 목표 어휘를 정확히 한 번 자연스럽게 넣으세요. 서버가 그 자리를 빈칸으로 바꿉니다.',
    '',
    '최근 문제 서명(비슷한 상황/구조 피하기): '+JSON.stringify(recent||[]),
    '이전 생성 실패 사유가 있으면 반드시 고치기: '+JSON.stringify(feedback||{}),
    '생성 대상 JSON: '+JSON.stringify(items.map(({usedPassageKeys,...item})=>item))
  ].join('\n');
}
async function generate(items,recent,feedback){
  const out=await ask(generationPrompt(items,recent,feedback),questionSchema(items),'validated_vocab_questions',15000);
  return out.questions||[];
}
async function aiVerify(items,questions,recent){
  const prompt=[
    '아래 한국어 어휘 문제를 출제 전 검증하세요. 생성자의 자기평가가 아니라 별도 검수자처럼 엄격히 판단하세요.',
    '검증 항목: 문맥 단서 충분성, 객관식 정답 유일성, mc_context의 5개 단어 보기 품사/형태 일관성, mc_usage의 5개 상황 보기 형식 일관성, 자연스러운 한국어, 학습 단계 적합성, 과도한 배경지식 여부, 힌트·제목의 정답 노출 여부, 주관식의 다른 자연스러운 답 고려 여부, 최근 문제와 과도한 유사성.',
    '객관식의 oneClearAnswer와 samePartOfSpeechChoices는 엄격히 검사하세요. 주관식은 자연스러운 복수 정답을 허용하므로 oneClearAnswer는 필수 조건이 아니며, 대신 naturalAlternativesConsidered를 엄격히 검사하세요.',
    'completedContext와 choiceContexts는 빈칸을 채운 실제 완성 문장입니다. 반드시 이 문장들을 소리 내어 읽듯 검사하세요. 목표어를 넣었을 때 조사·활용·서술어가 틀리면 naturalKorean=false입니다. 객관식은 오답도 문법상 맞아야 하며 문법 오류로 답을 고르게 하면 samePartOfSpeechChoices=false입니다.',
    'coherentSituation은 인물·시간·행동·이유·결과의 앞뒤 연결과 목표어를 넣은 완성 문장의 조사·서술어 호응을 검사합니다. 어색한 번역투, 불필요한 반복, 갑작스러운 결론, 일상적으로 성립하지 않는 상황, 설명문을 옮긴 가짜 대화는 통과시키지 마세요.',
    'notTooSimilarToRecent는 최근 서명뿐 아니라 각 목표의 previousContexts 실제 지문/보기와 후보 배치 내부도 비교합니다. 이름이나 사물만 바꾼 같은 사건·문장 틀은 중복입니다. 질문 안내 문구의 반복은 허용합니다.',
    '주관식에는 보기가 없으므로 samePartOfSpeechChoices는 해당 없음으로 true 처리해도 됩니다.',
    '정답 노출은 학생이 답하기 전에 보는 prompt/context/hints를 검사합니다. options의 정답 보기, acceptedAnswers, feedbackCorrect에 목표어가 있는 것은 정상이며 노출 오류가 아닙니다.',
    '주관식은 검수자가 허용 답안을 독립적으로 확정하여 acceptedAnswers에 반환하세요. 목표어는 반드시 credit 1이고, 빈칸에 문법과 의미가 모두 자연스러운 다른 표현은 credit 1, 핵심 의미가 일부만 맞으면 0.5입니다. 어색한 사전식 유의어는 제외하고 기본형 중심으로 적으세요.',
    '빠진 자연스러운 대체 답안이나 잘못된 허용 답안은 이 검수 단계에서 수정하세요. naturalAlternativesConsidered와 valid는 반환하는 최종 허용 답안 기준입니다. 객관식의 acceptedAnswers는 빈 배열입니다.',
    '허용 답안 목록만 수정할 수 있습니다. 문맥, 보기, 힌트 등 문제 자체의 결함은 수정한 것으로 간주하지 말고 valid=false와 구체적인 issues로 반환하세요.',
    '하나라도 중요한 문제가 있으면 valid=false입니다. 억지로 통과시키지 마세요.',
    '목표/정의/유형: '+JSON.stringify(items.map(({usedPassageKeys,...item})=>item)),
    '최근 서명: '+JSON.stringify(recent||[]),
    '후보 문제: '+JSON.stringify(questions.map(q=>{
      const item=items.find(x=>x.id===q.id);
      return {...q,completedContext:String(q.context||'').replace('＿＿＿＿',item?.word||''),choiceContexts:q.type==='mc_context'?(q.options||[]).map(o=>String(q.context||'').replace('＿＿＿＿',o.text)):[]};
    }))
  ].join('\n');
  const out=await ask(prompt,verifySchema(items),'vocab_question_review',9000);
  return out.reviews||[];
}
export async function buildValidated(items,recent){
  const pending=new Map(items.map(x=>[x.id,x])),accepted=new Map(),feedback={};
  for(let attempt=0;attempt<3&&pending.size;attempt++){
    const batch=[...pending.values()].map(item=>{
      const earlier=[...accepted.values()].filter(q=>items.find(x=>x.id===q.id)?.word===item.word);
      return {...item,previousContexts:[...(item.previousContexts||[]),...earlier.map(q=>({context:q.context,options:(q.options||[]).map(o=>o.text)}))],usedPassageKeys:[...(item.usedPassageKeys||[]),...earlier.flatMap(q=>passageKeys(q.context,(q.options||[]).map(o=>o.text)))]};
    });
    const generated=await generate(batch,recent,feedback);
    const byId=new Map(generated.map(q=>[String(q.id),q]));
    const deterministicIssues={};
    const toVerify=[];
    for(const item of batch){
      let q=byId.get(item.id);
      if(!q){deterministicIssues[item.id]=['missing_generated_question'];continue}
      q=normalizeCandidate(q,item);byId.set(item.id,q);
      const issues=deterministic(q,item);
      if(issues.length)deterministicIssues[item.id]=issues;
      else toVerify.push({item,q});
    }
    const reviews=toVerify.length?await aiVerify(toVerify.map(x=>x.item),toVerify.map(x=>x.q),recent):[];
    const reviewMap=new Map(reviews.map(x=>[String(x.id),x]));
    for(const item of batch){
      const q=byId.get(item.id);
      const rv=reviewMap.get(item.id);
      if(q&&!item.type.startsWith('mc_')&&rv){
        const seen=new Set();
        q.acceptedAnswers=(rv.acceptedAnswers||[]).filter(x=>{
          const key=norm(x.text);if(!key||seen.has(key))return false;seen.add(key);return true;
        }).map(x=>({text:String(x.text).trim(),credit:Number(x.credit),rationale:String(x.rationale||'')}));
      }
      const earlier=[...accepted.values()].filter(prev=>items.find(x=>x.id===prev.id)?.word===item.word);
      const checkedItem={...item,usedPassageKeys:[...(item.usedPassageKeys||[]),...earlier.flatMap(prev=>passageKeys(prev.context,(prev.options||[]).map(o=>o.text)))]};
      const d=[...(deterministicIssues[item.id]||[]),...(q?deterministic(q,checkedItem):[])];
      const aiIssues=rv?rv.issues:[];
      const objective=item.type.startsWith('mc_');
      const pass=q&&!d.length&&rv&&rv.valid&&rv.sufficientClues&&
        (!objective||rv.oneClearAnswer)&&(!objective||rv.samePartOfSpeechChoices)&&
        rv.naturalKorean&&rv.coherentSituation&&rv.ageAppropriate&&rv.noBackgroundBurden&&rv.noAnswerLeak&&
        (objective||rv.naturalAlternativesConsidered)&&rv.notTooSimilarToRecent;
      if(pass){
        q.validation={deterministic:true,aiVerified:true,checks:{
          sufficientClues:rv.sufficientClues,oneClearAnswer:rv.oneClearAnswer,samePartOfSpeechChoices:rv.samePartOfSpeechChoices,
          naturalKorean:rv.naturalKorean,coherentSituation:rv.coherentSituation,ageAppropriate:rv.ageAppropriate,noBackgroundBurden:rv.noBackgroundBurden,
          noAnswerLeak:rv.noAnswerLeak,naturalAlternativesConsidered:rv.naturalAlternativesConsidered,notTooSimilarToRecent:rv.notTooSimilarToRecent
        }};
        accepted.set(item.id,q);pending.delete(item.id);delete feedback[item.id];
      }else{
        feedback[item.id]=[...d,...aiIssues,...(!rv?['verification_missing']:[])];
      }
    }
  }
  if(pending.size){
    const failed=[...pending.keys()].map(id=>({id,issues:feedback[id]||['unknown_validation_failure']}));
    const e=new Error('QUESTION_VALIDATION_FAILED '+JSON.stringify(failed));
    e.failed=failed;throw e;
  }
  return items.map(x=>accepted.get(x.id));
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!(await verifyUser(req.headers.authorization)))return res.status(401).json({error:'Login required'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI not configured'});
  try{
    const raw=Array.isArray(req.body?.items)?req.body.items.slice(0,30):[];
    const recent=Array.isArray(req.body?.recent)?req.body.recent.slice(-40):[];
    const items=raw.map((x,i)=>({
      id:String(x.id??i),type:TYPES.includes(x.type)?x.type:'mc_context',
      word:String(x.word||'').trim(),definition:String(x.definition||'').trim(),
      band:Math.max(1,Math.min(9,Number(x.band)||3)),
      domain:DOMAINS.includes(x.domain)?x.domain:'국어',
      example:String(x.example||'').trim(),
      answerSlot:Math.max(0,Math.min(4,Number(x.answerSlot)||0)),
      supportLevel:Math.max(0,Math.min(3,Number(x.supportLevel)||0)),
      successStreak:Math.max(0,Number(x.successStreak)||0),
      firstLearning:Boolean(x.firstLearning),
      previousContexts:Array.isArray(x.previousContexts)?x.previousContexts.filter(p=>p&&typeof p==='object').slice(-8).map(p=>({context:String(p.context||'').slice(0,1600),options:Array.isArray(p.options)?p.options.slice(0,5).map(o=>String(o).slice(0,500)):[]})):[],
      usedPassageKeys:Array.isArray(x.usedPassageKeys)?x.usedPassageKeys.filter(k=>typeof k==='string').slice(-2000):[]
    })).filter(x=>x.word&&x.definition);
    if(!items.length)return res.status(400).json({error:'No valid items'});
    const questions=[];
    for(let i=0;i<items.length;i+=4){
      const chunk=items.slice(i,i+4);
      const out=await buildValidated(chunk,[...recent,...questions.map(q=>q.signature)]);
      questions.push(...out);
    }
    return res.status(200).json({questions,validated:true,validationMethod:'deterministic+independent_ai_review'});
  }catch(e){
    return res.status(422).json({error:String(e?.message||e).slice(0,1000),failed:e.failed||[]});
  }
}
