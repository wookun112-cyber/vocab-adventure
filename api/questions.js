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
const hasCompare=s=>/(차이|비교|구별|둘 중|두 단어|와\s*“?.+”?\s*(?:의)?\s*차이)/.test(String(s||''));
const hasDefinePrompt=s=>/(뜻을\s*(?:설명|써|말)|정의(?:를)?\s*(?:설명|써|말)|무슨 뜻인지 설명)/.test(String(s||''));

function deterministic(q,item){
  const issues=[];
  if(q.type!==item.type)issues.push('requested_type_mismatch');
  if(hasCompare(q.prompt)||hasCompare(q.context))issues.push('comparison_question');
  if(hasDefinePrompt(q.prompt))issues.push('definition_explanation_prompt');
  const hidden=item.type!=='mc_usage';
  if(hidden&&(String(q.prompt).includes(item.word)||String(q.context).includes(item.word)))issues.push('target_leaked_before_answer');
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
    if(item.type==='mc_context'&&!correct.some(x=>norm(x.text)===norm(item.word)))issues.push('target_not_correct_choice');
    if(item.type==='mc_usage'&&(q.options||[]).some(x=>!String(x.text).includes(item.word)))issues.push('usage_choice_missing_target_word');
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
        ageAppropriate:{type:'boolean'},
        noBackgroundBurden:{type:'boolean'},
        noAnswerLeak:{type:'boolean'},
        naturalAlternativesConsidered:{type:'boolean'},
        notTooSimilarToRecent:{type:'boolean'},
        issues:{type:'array',items:{type:'string'}}
      },
      required:['id','valid','sufficientClues','oneClearAnswer','samePartOfSpeechChoices','naturalKorean','ageAppropriate','noBackgroundBurden','noAnswerLeak','naturalAlternativesConsidered','notTooSimilarToRecent','issues'],
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
    '- mc_context, subjective_context, subjective_dialogue에서는 목표 어휘를 제목·안내·지문에 절대 노출하지 않습니다.',
    '- mc_usage에서는 목표 어휘를 질문에 보여줘도 되며, 보기 5개 모두 목표 어휘를 실제 문장 안에 사용합니다.',
    '- 객관식은 정확히 5지선다이며 정답은 지정된 answerSlot 위치에 정확히 하나만 둡니다.',
    '- mc_context 보기 5개는 목표어와 같은 품사의 관련 어휘로 만듭니다. 모든 보기가 문법적으로 빈칸에 들어갈 수 있어야 하고 의미 단서로만 정답이 갈려야 합니다.',
    '- mc_usage는 보기 5문장 모두 문법적으로 자연스러워 보이게 하되, 의미와 쓰임이 정확한 것은 하나만 만듭니다.',
    '- 오답은 관련성은 있으나 핵심 단서와 맞지 않게 만듭니다. 억지 오답·명백한 품사 불일치 금지입니다.',
    '- 주관식 acceptedAnswers에는 목표어 자체를 credit 1로 반드시 넣고, 다른 표현도 문맥상 완전히 자연스러우면 credit 1, 일부만 맞으면 credit 0.5로 넣습니다. 유의어라는 이유만으로 넣지 않습니다.',
    '- 힌트 1은 지문의 핵심 단서를 가리키고, 힌트 2는 의미 범위를 좁히되 정답을 직접 말하지 않습니다.',
    '- feedbackCorrect는 문맥 단서와 어휘 의미를 연결한 1~2문장입니다.',
    '- signature는 최근 문제와 중복을 피하기 위한 짧은 상황 요약입니다.',
    '',
    '유형 정의:',
    'mc_context: 2~4문장 상황의 빈칸에 맞는 단어를 5개 중 고릅니다.',
    'mc_usage: 목표 단어가 자연스럽게 사용된 문장/상황 하나를 5개 중 고릅니다. 빈칸은 쓰지 않습니다.',
    'subjective_context: 2~4문장 상황의 한 빈칸에 보기 없이 단어를 직접 입력합니다.',
    'subjective_dialogue: 2~4개의 짧은 대화 흐름을 읽고 한 빈칸에 단어를 직접 입력합니다.',
    '',
    '최근 문제 서명(비슷한 상황/구조 피하기): '+JSON.stringify(recent||[]),
    '이전 생성 실패 사유가 있으면 반드시 고치기: '+JSON.stringify(feedback||{}),
    '생성 대상 JSON: '+JSON.stringify(items)
  ].join('\n');
}
async function generate(items,recent,feedback){
  const out=await ask(generationPrompt(items,recent,feedback),questionSchema(items),'validated_vocab_questions');
  return out.questions||[];
}
async function aiVerify(items,questions,recent){
  const prompt=[
    '아래 한국어 어휘 문제를 출제 전 검증하세요. 생성자의 자기평가가 아니라 별도 검수자처럼 엄격히 판단하세요.',
    '검증 항목: 문맥 단서 충분성, 객관식 정답 유일성, 5개 보기 품사/형태 일관성, 자연스러운 한국어, 학습 단계 적합성, 과도한 배경지식 여부, 정답 노출 여부, 주관식의 다른 자연스러운 답 고려 여부, 최근 문제와 과도한 유사성.',
    '하나라도 중요한 문제가 있으면 valid=false입니다. 억지로 통과시키지 마세요.',
    '목표/정의/유형: '+JSON.stringify(items),
    '최근 서명: '+JSON.stringify(recent||[]),
    '후보 문제: '+JSON.stringify(questions)
  ].join('\n');
  const out=await ask(prompt,verifySchema(items),'vocab_question_review',6500);
  return out.reviews||[];
}
async function buildValidated(items,recent){
  const pending=new Map(items.map(x=>[x.id,x])),accepted=new Map(),feedback={};
  for(let attempt=0;attempt<3&&pending.size;attempt++){
    const batch=[...pending.values()];
    const generated=await generate(batch,recent,feedback);
    const byId=new Map(generated.map(q=>[String(q.id),q]));
    const deterministicIssues={};
    const toVerify=[];
    for(const item of batch){
      const q=byId.get(item.id);
      if(!q){deterministicIssues[item.id]=['missing_generated_question'];continue}
      const issues=deterministic(q,item);
      if(issues.length)deterministicIssues[item.id]=issues;
      else toVerify.push({item,q});
    }
    const reviews=toVerify.length?await aiVerify(toVerify.map(x=>x.item),toVerify.map(x=>x.q),recent):[];
    const reviewMap=new Map(reviews.map(x=>[String(x.id),x]));
    for(const item of batch){
      const q=byId.get(item.id);
      const d=deterministicIssues[item.id]||[];
      const rv=reviewMap.get(item.id);
      const aiIssues=rv?rv.issues:[];
      const pass=q&&!d.length&&rv&&rv.valid&&rv.sufficientClues&&rv.oneClearAnswer&&rv.samePartOfSpeechChoices&&rv.naturalKorean&&rv.ageAppropriate&&rv.noBackgroundBurden&&rv.noAnswerLeak&&rv.naturalAlternativesConsidered&&rv.notTooSimilarToRecent;
      if(pass){
        q.validation={deterministic:true,aiVerified:true,checks:{
          sufficientClues:rv.sufficientClues,oneClearAnswer:rv.oneClearAnswer,samePartOfSpeechChoices:rv.samePartOfSpeechChoices,
          naturalKorean:rv.naturalKorean,ageAppropriate:rv.ageAppropriate,noBackgroundBurden:rv.noBackgroundBurden,
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
      firstLearning:Boolean(x.firstLearning)
    })).filter(x=>x.word&&x.definition);
    if(!items.length)return res.status(400).json({error:'No valid items'});
    const questions=[];
    for(let i=0;i<items.length;i+=10){
      const chunk=items.slice(i,i+10);
      const out=await buildValidated(chunk,[...recent,...questions.map(q=>q.signature)]);
      questions.push(...out);
    }
    return res.status(200).json({questions,validated:true,validationMethod:'deterministic+independent_ai_review'});
  }catch(e){
    return res.status(422).json({error:String(e?.message||e).slice(0,1000),failed:e.failed||[]});
  }
}