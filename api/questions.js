const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
import {LEARNING_TYPES,QUESTION_POLICY,isLearningTarget} from '../lib/learning-model.js';
const TYPES=LEARNING_TYPES;
const SHOWN_TYPES=['mc_usage','mc_relation','mc_structure','mc_reading','subjective_use'];
const DOMAINS=['국어','사회','과학','수학·논리','감정·관계','생활'];

// Curated factual anchors. New stories may change the narrative, never the underlying fact.
const KNOWLEDGE_SEEDS=[
 {id:'sejong',topic:'세종의 한글 창제',facts:['세종은 1443년에 훈민정음이라는 새 글자를 만들었다.','훈민정음은 우리말을 적을 수 있는 글자이며, 오늘날 한글이라 부른다.'],source:'국립국어원',url:'https://www.korean.go.kr/hangeul/origin/001.html'},
 {id:'hangeul',topic:'소리를 담은 글자',facts:['한글은 누구나 쉽게 배워 편히 쓰도록 만든 글자이다.','기본 자음 글자는 발음 기관의 모양을 본떠 만들었다.'],source:'국립한글박물관',url:'https://www.hangeul.go.kr/webzine/201804/sub1_1.html'},
 {id:'earth-orbit',topic:'태양 주변을 여행하는 지구',facts:['지구는 태양 주변을 돈다.','지구가 태양 주위를 한 바퀴 도는 데 걸리는 시간은 약 1년이다.'],source:'NASA',url:'https://science.nasa.gov/earth/facts/'},
 {id:'moon',topic:'지구의 위성인 달',facts:['달은 지구 주변을 도는 자연 위성이다.','달은 지구의 유일한 자연 위성이다. 인공위성은 사람이 만들어 우주로 보낸다.'],source:'NASA',url:'https://science.nasa.gov/moon/facts/'},
 {id:'day-night',topic:'낮과 밤이 바뀌는 이유',facts:['지구는 스스로 회전한다.','지구에서 태양 빛을 받는 쪽은 낮이고 반대쪽은 밤이다.'],source:'NASA',url:'https://science.nasa.gov/learn/basics-of-space-flight/chapter2-1/'},
 {id:'seasons',topic:'계절이 바뀌는 이유',facts:['지구의 회전축은 기울어져 있다.','기울어진 지구가 태양 주위를 돌면서 지역별로 햇빛을 받는 각도와 시간이 달라져 계절이 바뀐다.'],source:'NASA',url:'https://science.nasa.gov/earth/facts/'},
 {id:'sunlight',topic:'햇빛의 여행',facts:['태양에서 나온 빛이 지구에 도착하는 데는 약 8분이 걸린다.'],source:'NASA',url:'https://science.nasa.gov/earth/facts/'},
 {id:'moonlight',topic:'달빛의 비밀',facts:['달은 태양처럼 스스로 빛을 만들지 않는다.','달빛은 달 표면에 닿은 태양 빛이 반사되어 보이는 빛이다.'],source:'NASA',url:'https://science.nasa.gov/moon/moonlight/'},
 {id:'water-cycle',topic:'물방울의 여행',facts:['물은 증발하여 수증기가 될 수 있다.','수증기가 작은 물방울로 바뀌는 현상을 응결이라고 한다.','물은 땅과 바다, 공기를 오가며 순환한다.'],source:'USGS',url:'https://www.usgs.gov/water-science-school/water-cycle'},
 {id:'plants',topic:'식물의 햇빛 식당',facts:['식물은 햇빛의 에너지를 이용하여 물과 이산화 탄소로 성장에 필요한 당을 만든다.','이 과정을 광합성이라고 한다.'],source:'미국 국립공원관리청',url:'https://www.nps.gov/teachers/classrooms/matter-in-motion.htm'}
];
function passageProfile(item){
 const measured=Math.max(1,Math.min(9,Number(item.readerLevel)||Number(item.band)||2));
 const level=Math.max(1,measured-Math.min(3,Number(item.supportLevel)||0)*.4);
 const tier=level<=2.5?0:level<=4.5?1:level<=6.5?2:3;
 return {vocabularyLevel:measured,scaffoldedLevel:Math.round(level*10)/10,
  sentences:['2~3개의 짧은 문장','3~4문장','3~4문장','3~5문장'][tier],
  lengthGuide:['약 80~160자','약 130~260자','약 180~360자','약 230~460자'][tier],
  maxCharacters:[220,340,450,560][tier],
  sentenceGuide:['문장마다 한 가지 정보, 쉬운 낱말과 직접적인 단서','한 가지 원인과 결과, 낯선 용어는 바로 풀어 쓰기','두 정보를 연결하되 글 안에 판단 근거 제시','자료와 관점을 연결하되 여러 개의 생소한 개념을 한꺼번에 넣지 않기'][tier],
  unfamiliarTerms:tier===0?1:2};
}
function knowledgeSeed(item){
 if(item.domain==='수학·논리'||/재판|소송|상속|계약|기압골|사동|피동|소인수|합동|공식/.test(item.word||''))return null;
 const text=String(item.contextSeed||'')+'|'+String(item.word||'');
 const direct=/세종|훈민정음|한글|업적|창제/.test(text)?'sejong':/위성|달빛|달의/.test(text)?'moon':/태양|공전|지구/.test(text)?'earth-orbit':/식물|광합성/.test(text)?'plants':/증발|응결|순환/.test(text)?'water-cycle':null;
 if(direct)return KNOWLEDGE_SEEDS.find(x=>x.id===direct);
 let hash=2166136261;for(const ch of String(item.id)+'|'+text+'|'+(item.previousContexts||[]).length)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
 return KNOWLEDGE_SEEDS[(hash>>>0)%KNOWLEDGE_SEEDS.length];
}
function passageTargets(items){return items.map(item=>({...item,readingDesign:passageProfile(item),knowledgeSeed:knowledgeSeed(item)}))}

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
async function ask(prompt,schema,name,max=9000,effort='low'){
  const model=process.env.OPENAI_MODEL||'gpt-6-luna';
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(60000),body:JSON.stringify({
      model,reasoning:{effort},max_output_tokens:max,input:prompt,
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
 for(const [has,none] of [['이','가'],['은','는'],['을','를'],['과','와'],['이라고','라고'],['이라는','라는'],['이라','라']])if(particle===has||particle===none)return end?has:none;
 if(particle==='으로'||particle==='로')return end&&end!==8?'으로':'로';
 return particle;
}
function completeContext(context,word){
 return String(context||'').replace(/＿＿＿＿\((이라고|이라는|이라|이|은|을|과|으로)\/(라고|라는|라|가|는|를|와|로)\)/g,(_,particle)=>word+expectedParticle(word,particle)).replace('＿＿＿＿',word);
}
function blankParticle(context){return String(context||'').match(/＿＿＿＿(이라고|이라는|이라|라고|라는|라|으로|로|이|가|은|는|을|를|과|와)(?=\s|[,.!?“”"'():;]|$)/)?.[1]||''}
function normalizeCandidate(q,item){
  q={...q,answerForm:String(q.answerForm||item.word).trim()};
  if(['mc_context','subjective_context','subjective_dialogue'].includes(item.type)){
    let c=String(q.context||'').replace(/\\n/g,'\n');
    c=c.replace(/＿{2,}|_{3,}|□{2,}|○{2,}|\[\s*빈칸\s*\]|\(\s*빈칸\s*\)|<\s*빈칸\s*>/g,'＿＿＿＿');
    if(blankCount(c)===0&&c.includes(q.answerForm))c=c.replace(q.answerForm,'＿＿＿＿');
    if(q.type!=='mc_context')c=c.replace(/＿＿＿＿(이|가|은|는|을|를|과|와|으로|로)\((이|가|은|는|을|를|과|와|으로|로)\)/g,(_,p)=>'＿＿＿＿'+expectedParticle(q.answerForm,p));
    const particle=blankParticle(c);
    if(particle)c=c.replace('＿＿＿＿'+particle,'＿＿＿＿'+expectedParticle(q.answerForm,particle));
    q.context=c;
  }
  if(SHOWN_TYPES.includes(item.type))q.context=String(q.context||'').replace(/＿{2,}|_{3,}/g,'');
  q.showTarget=SHOWN_TYPES.includes(item.type);
  if(item.type.startsWith('mc_')&&Array.isArray(q.options)){
    const opts=q.options.map(x=>({...x}));
    const idx=opts.findIndex(x=>x.correct);
    if(idx>=0&&opts.filter(x=>x.correct).length===1&&idx!==item.answerSlot){
      const [correct]=opts.splice(idx,1);
      opts.splice(item.answerSlot,0,correct);
      q.options=opts;
    }
  }else if(!item.type.startsWith('mc_'))q.options=[];
  if(item.type==='mc_context'){
    const particle=blankParticle(q.context);
    if(particle&&(q.options||[]).some(o=>expectedParticle(o.text,particle)!==particle)){
      const pairs={이:'이/가',가:'이/가',은:'은/는',는:'은/는',을:'을/를',를:'을/를',과:'과/와',와:'과/와',으로:'으로/로',로:'으로/로',이라고:'이라고/라고',라고:'이라고/라고',이라는:'이라는/라는',라는:'이라는/라는',이라:'이라/라',라:'이라/라'};
      q.context=q.context.replace('＿＿＿＿'+particle,'＿＿＿＿('+pairs[particle]+')');
    }
  }
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
  if(!isLearningTarget(item.word,item.domain,item.band))issues.push('specialist_or_context_only_target');
  const text=String(q.prompt||'')+' '+String(q.context||'');
  const mathematical=/\d+\s*:\s*\d+|[√∑∫]|\b(?:sin|cos|tan|log)\b|\d+\s*[×÷=]\s*\d+/.test(text);
  if(mathematical&&/(?:이라고|라고)\s*(?:하지|하죠|부르)|명칭|이름|무엇이라고/.test(text))issues.push('mathematical_name_quiz');
  const reading=passageProfile(item);if(String(q.context||'').length>reading.maxCharacters)issues.push('passage_too_long_for_reader');
  if(item.type==='mc_usage'&&(q.options||[]).some(o=>String(o.text||'').length>reading.maxCharacters/2))issues.push('choice_too_long_for_reader');
  const previous=new Set([...(item.usedPassageKeys||[]),...(item.previousContexts||[]).flatMap(p=>passageKeys(p.context,p.options||[]))]);
  if(passageKeys(q.context,(q.options||[]).map(o=>o.text)).some(k=>previous.has(k)))issues.push('previous_sentence_reused');
  if(q.type!==item.type)issues.push('requested_type_mismatch');
  if(!['mc_relation','mc_structure'].includes(item.type)&&hasCompare(q.prompt))issues.push('comparison_question');
  if(hasDefinePrompt(q.prompt))issues.push('definition_explanation_prompt');
  const hidden=!SHOWN_TYPES.includes(item.type);
  if(hidden&&/(?:＿＿＿＿|____).*?(?:의\s*관점|라는\s*개념|에\s*대해\s*(?:생각|이야기|논의))/.test(q.context||''))issues.push('ambiguous_label_blank');
  if(hidden&&q.showTarget)issues.push('hidden_type_showTarget_true');
  if(SHOWN_TYPES.includes(item.type)&&!q.showTarget)issues.push('usage_type_showTarget_false');
  if(hidden&&(String(q.prompt).includes(item.word)||String(q.context).includes(item.word)||String(q.prompt).includes(q.answerForm||item.word)||String(q.context).includes(q.answerForm||item.word)))issues.push('target_leaked_before_answer');
  if(SHOWN_TYPES.includes(item.type)&&blankCount(q.context)!==0)issues.push('usage_question_has_blank');
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
    if(item.type==='mc_context'&&!correct.some(x=>norm(x.text)===norm(q.answerForm||item.word)))issues.push('target_not_correct_choice');
    if(item.type==='mc_usage'&&hasCompare((q.options||[]).map(x=>x.text).join(' ')))issues.push('usage_choices_compare_words');
    if(item.type==='mc_usage'&&(q.options||[]).some(o=>[item.word,q.answerForm].filter(Boolean).some(w=>norm(o.text).includes(norm(w)))))issues.push('usage_choice_repeats_target');
  }else{
    if((q.options||[]).length)issues.push('subjective_has_choices');
    const full=(q.acceptedAnswers||[]).some(x=>norm(x.text)===norm(q.answerForm||item.word)&&Number(x.credit)===1);
    if(item.type==='subjective_use'&&(q.acceptedAnswers||[]).length)issues.push('sentence_use_has_fixed_answers');
    if(item.type!=='subjective_use'&&!full)issues.push('target_missing_from_accepted_answers');
  }
  if(!Array.isArray(q.hints)||q.hints.length!==2)issues.push('hints_not_two_steps');
  if(item.needsCard&&(!q.learningCard?.definition?.trim()||!q.learningCard?.example?.trim()||!q.learningCard?.nonExample?.trim()))issues.push('missing_learning_card');
  if(!String(q.answerForm||item.word).trim())issues.push('missing_answer_form');
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
        answerForm:{type:'string'},
        learningCard:{type:'object',properties:{definition:{type:'string'},example:{type:'string'},nonExample:{type:'string'},structureNote:{type:'string'}},required:['definition','example','nonExample','structureNote'],additionalProperties:false},
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
      },required:['id','type','prompt','context','showTarget','answerForm','learningCard','partOfSpeech','options','acceptedAnswers','hints','feedbackCorrect','signature'],
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
        ageAppropriate:{type:'boolean'},factualAccuracy:{type:'boolean'},readerLevelFit:{type:'boolean'},levelDemandFit:{type:'boolean'},
        noBackgroundBurden:{type:'boolean'},vocabularyFocus:{type:'boolean'},
        noAnswerLeak:{type:'boolean'},
        naturalAlternativesConsidered:{type:'boolean'},
        notTooSimilarToRecent:{type:'boolean'},learningCardAccurate:{type:'boolean'},
        acceptedAnswers:{type:'array',minItems:0,maxItems:7,items:{type:'object',properties:{
          text:{type:'string'},credit:{type:'number',enum:[1,0.5]},rationale:{type:'string'}
        },required:['text','credit','rationale'],additionalProperties:false}},
        issues:{type:'array',items:{type:'string'}}
      },
      required:['id','valid','sufficientClues','oneClearAnswer','samePartOfSpeechChoices','naturalKorean','coherentSituation','ageAppropriate','factualAccuracy','readerLevelFit','levelDemandFit','noBackgroundBurden','vocabularyFocus','noAnswerLeak','naturalAlternativesConsidered','notTooSimilarToRecent','learningCardAccurate','acceptedAnswers','issues'],
      additionalProperties:false
    }}},required:['reviews'],additionalProperties:false
  };
}
function generationPrompt(items,recent,feedback={}){
  return [
    '한국어 어휘 학습 앱용 문제를 만드세요. 목표는 사전 정의 암기가 아니라 문맥에서 뜻을 이해하고 필요한 어휘를 떠올려 사용하는 능력입니다.',
    '',
    '공통 규칙:',
    '- 검사하는 능력은 목표 어휘의 의미, 문맥에 맞는 선택, 자연스러운 쓰임입니다. 수학 계산, 공식 적용, 전문 개념이나 사실의 명칭 회상, 역사 인물·연도·과학 상식 맞히기는 금지합니다. 대화 빈칸으로 포장해도 같은 금지 규칙을 적용합니다.',
    '- 지문의 지식은 어휘를 사용할 배경이지 정답 자체가 아닙니다. 필요한 사실은 글 안에 먼저 제공하고, 그 사실을 바탕으로 인물의 행동·원인·결과·관점에서 목표어가 필요한 문장을 만드세요. 목표어를 빼고 보았을 때도 수학/과학/역사 퀴즈로 남는 문제는 다시 설계하세요.',
    '- 일반 수량 어휘 배·비율·차이·평균은 생활 속 변화나 느낌을 표현하는 문맥으로 출제할 수 있습니다. 수학 공식이나 계산 관계의 이름을 묻지 마세요. 기본 교과 어휘도 사전 정의를 준 뒤 그 이름만 채우게 하지 말고, 관찰·행동·결과에서 그 어휘의 역할과 쓰임을 이해하도록 설계하세요.',
    '- taskDemand=advanced는 글 길이보다 어휘 의미의 세밀한 구별과 쓰임 판단을 어렵게 하세요. 가까운 상황들이 모두 그럴듯하지만 목적·조건·의도·결과 중 목표어의 핵심 차이로 정답 하나를 가를 수 있게 하세요. 단어 하나를 단순한 정의와 연결하거나 엉뚱한 보기 네 개로 답을 드러내면 안 됩니다. 전문지식이나 트릭으로 어렵게 하지 마세요.',
    '- advanced의 subjective_use는 목표어를 사용해 인물의 판단·이유·조건 또는 행동의 결과가 드러나는 문장 하나를 만들게 합니다. 목표어 뜻을 다시 쓰거나 제시 문장을 베끼게 하지 마세요. 상황 단서는 짧고 질문은 하나입니다. foundation-review는 소수의 낮은 단계 기억 확인이고 initial-practice는 새 뜻을 배운 직후의 연습입니다.',
    '- advanced 빈칸에서 열심히·좋다·문제·생각 같은 넓고 쉬운 표현만으로 목표어의 핵심 의미 차이를 쓰지 않고도 충분히 해결되면 문항을 다시 설계하세요. 자연스러운 유의어를 일부러 오답으로 처리하거나 허용 답안을 좁혀 어렵게 하지 마세요. 같은 의미를 온전히 담은 자연스러운 답은 계속 인정합니다.',
    '- 난이도는 어휘의 추상성, 문맥 단서의 직접성, 가까운 의미의 구별, 문장과 관점의 복잡성으로 조절합니다. 더 높은 수준이라고 전문 용어·숫자·공식을 늘리지 마세요. 단서를 숨겨 맞힐 수 없게 만드는 방식도 금지합니다.',
    '- 각 문제는 목표 어휘 하나와 질문 하나만 다룹니다. 두 빈칸과 사전 정의를 외워 서술시키는 문제는 금지합니다. 의미 연결 문제도 목표는 한 단어이며 비교 단어 각각에 별도 답을 요구하지 않습니다.',
    '- 지문은 학년이 아니라 readingDesign의 현재 어휘력 수준에 맞춥니다. 문장 수·길이·문장 구조의 안내를 따르고 maxCharacters를 넘기지 마세요. subjective_use는 1~2문장, 대화는 2~4발화, mc_usage는 각 보기를 짧게 쓰는 유형 규칙이 우선합니다.',
    '- 지문은 재미있고 유익한 작은 발견 이야기로 씁니다. knowledgeSeed는 선택 가능한 소재이지 필수가 아닙니다. 목표어의 의미와 자연스러운 쓰임을 확인하는 데 도움이 될 때만 사용하세요. 연결이 없거나 null이면 생활·관계·판단·관찰 상황을 쓰세요. 수학 풀이·문법 분류를 출제하지 마세요.',
    '- 세종의 한글 창제, 지구의 태양 주변 공전, 지구의 자연 위성인 달처럼 사실을 배우는 지문을 우선합니다. 목표어와 어울리지 않는다면 유익한 생활 장면을 선택하세요. 정보만 나열하거나 목표어를 억지로 끼워 넣지 마세요.',
    '- 핵심 역사·과학 사실은 knowledgeSeed에 제공된 사실을 바탕으로 쓰세요. 실제 인물의 말·업적·날짜·실험 결과를 지어내지 마세요. 가상의 아이가 탐구하는 장면은 가능하지만 실제 인물에게 가상의 말을 붙이지 마세요. 지구의 공전과 자전, 자연 위성과 인공위성을 혼동하지 마세요. 계절 변화의 주원인을 태양까지의 거리라고 쓰지 마세요.',
    '- 목표어 외 낯선 개념은 readingDesign.unfamiliarTerms 이내로 제한하고 같은 문장에서 쉬운 말로 풉니다. 처음 들어 보는 역사·과학 지식이라도 지문 자체만 읽으면 답할 수 있게 필요한 정보를 모두 넣으세요. 역사 연도나 과학 상식을 외워야만 맞히는 문제는 금지합니다.',
    '- 같은 어휘를 복습할 때는 다른 소재·질문·사건 전개로 새 지문을 씁니다. 과학 사실이 같아도 같은 설명 문장을 복사하거나 인물 이름만 바꾸면 안 됩니다.',
    '- 단순히 길게 늘리지 말고 정답 판단에 필요한 의미 있는 단서를 2개 이상 제공합니다.',
    '- 목표 어휘 외 표현은 해당 학습 단계보다 쉽게 씁니다. 어려운 배경지식·복잡한 추론이 핵심이 되면 안 됩니다.',
    '- 가족, 학교, 친구, 동물, 놀이, 자연, 과학, 탐험 등 배경을 다양하게 바꿉니다.',
    '- 격식 있는 어휘는 그 의미가 자연스러운 실제 상황을 고르세요. 증여를 색종이를 친구에게 주는 장면에 억지로 쓰지 마세요. 새 단어의 자기 문장 활동에서는 최초 상황 선택과 다른 목적·문제·결과를 제시하세요. 단어의 핵심 뜻은 유지하되 가게 문 열기/물건 고르기와 같은 사건을 반복하지 마세요.',
    '- contextSeed는 배경 후보입니다. 어휘의 자연스러운 쓰임이 소재의 화려함보다 우선입니다. 목표어의 실제 의미와 맞지 않으면 의미를 억지로 확장하지 말고, 이전 지문과 겹치지 않는 다른 생활 장면으로 조정하세요. 같은 목표어의 다른 문제와 사건이 겹치지 않도록 하세요. 배경 문구를 복사하지 마세요.',
    '- previousContexts는 같은 어휘의 이전 실제 지문/보기입니다. 기존 문장, 사건, 핵심 행동과 결과를 재사용하지 마세요. 이름·장소·사물만 바꾸는 재작성도 금지합니다. 같은 배치에서 같은 어휘가 반복되면 각각 다른 사건과 문장 구조를 사용하세요.',
    '- 중복 때문에 다시 만드는 문제는 실패 지문의 배경뿐 아니라 인물의 목적·행동·질문 방향과 문장 구조를 새로 설계하세요. 이전 실패 피드백이 유형 규칙과 충돌하면 이 규칙과 실제 type을 따르세요.',
    '- 사전 example을 지문으로 복사하지 마세요. 목표어가 그 상황에서 실제로 쓰이는 자연스러운 표현인지 먼저 확인하세요. 목표어가 조사·서술어와 자연스럽게 호응하도록 완성 문장을 읽어 보고 작성하세요.',
    '- 한 장면 안에서 인물, 시간, 행동, 이유, 결과가 일관되게 이어져야 합니다. 이유 없는 행동, 갑자기 등장하는 사건, 앞 문장과 무관한 결론은 금지합니다.',
    '- 정답을 억지로 넣기 위해 같은 설명을 반복하거나 \"이것은 X이다\"라는 정의 문장을 덧붙이지 마세요. 단서가 사건 속에서 드러나는 간결하고 완결된 문장으로 씁니다.',
    '- 대화는 실제 아이들이 말할 법한 짧은 발화로 작성하고, 앞사람의 말에 자연스럽게 응답하세요. 설명문을 따옴표 안에 넣은 가짜 대화는 금지합니다.',
    '- mc_context, subjective_context, subjective_dialogue의 context는 생성 단계 내부용으로 answerForm을 정확히 한 번 포함한 완성 문장으로 작성하세요. 서버가 그 한 곳을 빈칸으로 바꿔 학생에게 보여줍니다. answerForm을 두 번 이상 쓰지 마세요.',
    '- answerForm에는 빈칸에 실제로 들어가는 자연스러운 형태를 쓰세요. 명사는 목표어 자체, 동사·형용사는 맑은, 맑았다처럼 목표어의 전체 활용형을 허용합니다. context에는 answerForm을 정확히 한 번 넣고 서버가 전체를 빈칸으로 바꿉니다. 어간 일부만 지우지 마세요. 기본형을 강제하려고 관찰표나 인용문으로 우회하지 마세요. 객관식 단어 보기의 활용과 품사도 동일하게 맞추세요.',
    '- mc_usage에서는 목표 어휘를 질문에 보여주고, 보기 5개는 그 어휘가 가장 알맞은 서로 다른 상황으로 만듭니다. 보기에는 목표어와 answerForm을 쓰지 마세요. 목표어 이름이 들어간 보기를 찾는 방식으로 답할 수 없어야 합니다. 이름 대신 구체적인 행동·의도·결과를 묘사하세요.',
    '- 객관식은 정확히 5지선다이며 정답은 지정된 answerSlot 위치에 정확히 하나만 둡니다.',
    '- 빈칸 다음의 조사(이/가, 은/는, 을/를, 과/와, 으로/로)는 목표어의 받침에 맞아야 합니다. mc_context는 보기 5개를 각각 넣어도 조사가 맞아야 하므로, 가능하면 받침에 무관한 ‘에’, ‘의’ 등의 표현을 쓰고, 받침에 따라 달라지는 조사를 쓴다면 보기의 받침 조건을 모두 맞추세요. 보기에 받침이 섞이면 빈칸 다음에 ‘(이/가)’, ‘(을/를)’처럼 두 조사를 병기할 수 있습니다.',
    '- mc_context 보기 5개는 목표어와 같은 품사의 관련 어휘로 만듭니다. 모든 보기가 문법적으로 빈칸에 들어갈 수 있어야 하고 의미 단서로만 정답이 갈려야 합니다.',
    '- mc_usage는 길이와 문장 형태가 비슷한 자연스러운 상황 5개로 만듭니다. 정답 상황 하나만 목표 어휘의 핵심 의미와 정확히 맞고, 나머지는 관련은 있지만 핵심 행동·의도·결과가 달라야 합니다.',
    '- 오답은 관련성은 있으나 핵심 단서와 맞지 않게 만듭니다. 억지 오답·명백한 품사 불일치 금지입니다.',
    '- 빈칸 주관식 acceptedAnswers에는 빈칸에 실제로 들어가는 answerForm을 credit 1로 넣습니다. 목표어 기본형이 빈칸에 문법적으로 맞지 않으면 넣지 마세요. 다른 표현도 문맥상 완전히 자연스러우면 credit 1, 일부만 맞으면 credit 0.5로 넣습니다. 유의어라는 이유만으로 넣지 않습니다.',
    '- supportLevel이 1 이상이면 문장을 더 짧고 쉽게 쓰고, 2~3이면 핵심 단서를 더 분명하게 제시합니다.',
    '- successStreak가 3 이상이면 같은 뜻을 학교 밖, 자연, 탐험, 과학 등 덜 익숙한 새 상황에도 적용하도록 배경을 바꿉니다.',
    '- firstLearning=true인 첫 객관식 문제는 특히 쉬운 상황과 분명한 단서를 사용합니다.',
    '- 힌트 1은 핵심 의미 단서를 가리키고, 힌트 2는 의미 범위를 좁히되 정답을 직접 말하지 않습니다. 객관식에서는 선택지 번호, 선택지의 고유 문구, 정답 문장을 인용하지 마세요.',
    '- feedbackCorrect는 문맥 단서와 어휘 의미를 연결한 1~2문장입니다.',
    '- signature는 최근 문제와 중복을 피하기 위한 짧은 상황 요약입니다.',
    '',
    '학습 자료:',
    '- needsCard=true인 문제에는 learningCard를 작성하세요: 아이 눈높이의 짧은 definition, 목표어의 자연스러운 예문 example, 그 단어로 부르기 어려운 상황과 이유를 담은 nonExample. structureNote는 제공된 검토된 structureNote가 있는 경우에만 사용하세요. 단어를 억지로 한자나 형태소로 나누지 마세요. needsCard=false이면 네 필드 모두 빈 문자열입니다. 학습 카드는 별도 익히기 화면에서만 나오며 문제 지문과는 다른 사건을 사용합니다.',
    '- mc_structure는 제공된 structureNote의 정확한 의미만 다룹니다. 분해가 부적합한 단어는 요청되지 않습니다.',
    '- 새 단어는 단어를 보여주는 상황 선택과 문장 사용으로 연습합니다. 이 활동은 장기 기억 검사라고 표현하지 마세요. learningCard의 뜻은 전문 용어 없이 한 문장, 예문은 익숙한 구체적 사건 하나로 쓰고, 카드와 이후 연습은 다른 상황이어야 합니다.',
    '- 숨긴 빈칸은 실제 행동·의도·결과를 말하는 자연스러운 자리에 둡니다. ‘빈칸의 관점에서’, ‘빈칸이라는 개념’, ‘빈칸에 대해 논의했다’처럼 여러 추상 명사가 들어가는 꼬리표 문장은 금지합니다. 표적어를 넣기 위한 협동조합·조합원 등 불필요한 배경 용어를 줄이세요.',
    '유형 정의:',
    'mc_context: 2~4문장 상황에 answerForm을 정확히 한 번 자연스럽게 넣으세요. 서버가 그 자리를 빈칸으로 바꾼 뒤 5개 중 고르게 합니다.',
    'mc_usage: 목표 단어를 질문에 제시하고, 그 단어를 쓰기에 가장 알맞은 상황 하나를 5개의 평행한 상황 보기 중 고릅니다. 빈칸은 쓰지 않습니다.',
    'subjective_context: 2~4문장 상황에 answerForm을 정확히 한 번 자연스럽게 넣으세요. 서버가 그 자리를 빈칸으로 바꾼 뒤 보기 없이 입력하게 합니다.',
    'mc_relation: 목표어를 보여주고 이 말과 의미상 잘 연결되는 상황, 상위 범주, 반대 상황, 자연스러운 결합 중 한 가지를 5개의 보기에서 고르게 합니다. 질문 하나이며 정답은 하나입니다.',
    'mc_structure: 목표어와 structureNote의 구성 단서를 제시하고 구성 요소가 전체 뜻에 어떻게 기여하는지 하나의 질문으로 묻습니다. 보기 5개, 정답 하나입니다.',
    'mc_reading: 목표어를 보여주고 처음 보는 자연스러운 짧은 글 3~4문장을 읽게 합니다. 글에서 목표어의 뜻이나 쓰임을 이해했는지 하나의 질문과 5개 보기로 확인합니다. 빈칸은 없습니다.',
    'subjective_use: 목표어를 보여주고 실제로 있을 법한 상황 단서를 간단히 준 뒤 이 어휘를 사용한 자신의 문장 하나를 쓰도록 요청합니다. 정답 문장이나 복사할 예문은 지문에 제시하지 않습니다. context는 빈칸 없이 1~2문장, options와 acceptedAnswers는 빈 배열입니다. 힌트는 생각할 상황과 말할 목적을 제안하되 완성 문장을 주지 않습니다.',
    'subjective_dialogue: 2~4개의 짧은 대화 흐름에 answerForm을 정확히 한 번 자연스럽게 넣으세요. 서버가 그 자리를 빈칸으로 바꿉니다.',
    '',
    '최근 문제 서명(비슷한 상황/구조 피하기): '+JSON.stringify(recent||[]),
    '이전 생성 실패 사유가 있으면 반드시 고치기: '+JSON.stringify(feedback||{}),
    '생성 대상 JSON: '+JSON.stringify(passageTargets(items).map(({usedPassageKeys,...item})=>item))
  ].join('\n');
}
async function generate(items,recent,feedback){
  const out=await ask(generationPrompt(items,recent,feedback),questionSchema(items),'validated_vocab_questions',15000,Object.keys(feedback||{}).length?'medium':'low');
  return out.questions||[];
}
async function aiVerify(items,questions,recent){
  const prompt=[
    '아래 한국어 어휘 문제를 출제 전 검증하세요. 생성자의 자기평가가 아니라 별도 검수자처럼 엄격히 판단하세요.',
    'vocabularyFocus는 반드시 별도로 판정하세요. 정답의 근거가 목표 어휘의 의미와 상황 속 쓰임이어야 true입니다. 공식·계산·전문 수학 관계의 명칭·문법 분류·과학 현상의 명칭·역사 인물/연도/사실을 기억해야 정답이면 false이고 valid=false입니다. 정보를 글 안에 제공했더라도 그 정보의 전문 명칭을 맞히는 문제이면 false입니다. 대화나 빈칸 형식이라고 예외가 아닙니다. 단서를 충분히 제시한 일반 어휘의 자연스러운 쓰임을 묻는 것은 허용합니다.',
    '수량과 관계 있다는 이유만으로 일반 어휘를 배제하지 마세요. 배, 비율, 차이, 평균 등을 일상의 변화·비교·감정 표현에 알맞게 쓰는 문항은 어휘 학습입니다. 예를 들어 기쁨이 두 배가 된다는 자연스러운 쓰임은 등비중항 같은 전문 명칭 퀴즈에 해당하지 않습니다. 세포, 전지 같은 기본 교과 어휘도 생활·관찰 맥락에서 역할과 의미를 이해해야 하는 문항은 허용하되, 정의를 준 뒤 개념 이름만 묻는 문항은 반려하세요.',
    '유형 규칙표: subjective_context와 subjective_dialogue는 목표어를 숨긴 빈칸 하나를 채우는 과제입니다. 빈칸이 있다는 이유로 반려하지 마세요. subjective_use만 목표어를 보여주고 자신의 완성 문장 하나를 만드는 과제입니다. 이 세 유형을 혼동하지 마세요.',
    'factualAccuracy는 실제 사실의 정확성을 검사합니다. knowledgeSeed는 선택용 소재입니다. 지문이 다른 분야를 다뤄도 실제 내용이 정확하면 true이며, seed와 주제가 다르거나 null이라는 이유만으로 반려하지 마세요. 인물의 허구 업적·실제 인물에게 붙인 가짜 발언·잘못된 날짜·공전과 자전의 혼동·태양까지의 거리로 계절을 설명하는 오류는 탈락입니다. 생활 장면도 객관적인 사실을 잘못 말하면 false입니다.',
    'levelDemandFit는 읽기 길이와 별개로 taskDemand의 의미 판단 수준을 검사합니다. advanced인데 넓고 쉬운 낱말만으로 핵심 의미를 구별하지 않고 빈칸이 해결되거나, 객관식 오답들이 엉뚱해 하나만 눈에 띄거나, subjective_use가 단순 예문 복사이면 false와 valid=false입니다. 자연스러운 대체 답을 삭제해서 난이도를 높이지 말고 문항을 재설계하게 하세요. foundation-review와 initial-practice는 기본 기억/첫 뜻 연습을 허용하며 더 높은 난이도의 숙달 검사라고 해석하지 않습니다. standard는 읽기 수준에 맞는 기본 의미와 쓰임을 검사합니다.',
    'readerLevelFit는 학년이나 목표어 band가 아니라 readingDesign의 어휘력 수준·문장 구조로 검사합니다. lengthGuide는 권장 길이이며 최소 글자 수가 아닙니다. 짧아도 완결된 상황과 충분한 단서가 있으면 통과하고 maxCharacters 초과는 탈락입니다. 목표어 외 용어가 너무 어렵거나 많고 쉬운 설명이 없으면 false입니다. 지문 안의 정보만으로 풀 수 있어야 하며 사전 역사·과학 지식을 요구하면 noBackgroundBurden=false입니다. subjective_use와 대화 및 mc_usage는 해당 유형의 짧은 형식이 우선합니다.',
    '검증 항목: 문맥 단서 충분성, 객관식 정답 유일성, mc_context의 5개 단어 보기 품사/형태 일관성, mc_usage의 5개 상황 보기 형식 일관성, 자연스러운 한국어, 학습 단계 적합성, 과도한 배경지식 여부, 힌트·제목의 정답 노출 여부, 주관식의 다른 자연스러운 답 고려 여부, 최근 문제와 과도한 유사성.',
    '객관식의 oneClearAnswer와 samePartOfSpeechChoices는 엄격히 검사하세요. 주관식은 자연스러운 복수 정답을 허용하므로 oneClearAnswer는 필수 조건이 아니며, 대신 naturalAlternativesConsidered를 엄격히 검사하세요.',
    'completedContext는 목표 정답을 넣은 실제 완성 문장입니다. 이 문장은 문법과 의미가 모두 자연스러워야 합니다. 목표어를 넣었을 때 조사·활용·서술어가 틀리면 naturalKorean=false입니다.',
    'subjective_use의 sufficientClues는 문장을 만들 수 있는 구체적인 상황 단서와 목표어/과제가 있는지로 검사합니다. 이미 목표어를 보여주는 사용 과제이므로 숨겨진 단어를 추론할 두 단서나 고정 정답은 필요하지 않습니다.',
    'subjective_use의 naturalAlternativesConsidered는 다양한 적절한 문장을 허용하는 과제인지로 검사하고, 적절한 열린 과제이면 true입니다. 완성 문장 정답을 만들지 말고 acceptedAnswers는 빈 배열을 유지하세요.',
    'mc_relation, mc_structure, mc_reading은 목표어를 보여주는 객관식입니다. 보기의 동일 품사는 해당 없음으로 true, 정답 유일성과 상황/의미의 타당성을 검사하세요. subjective_use는 목표어를 보여주고 문장 하나를 만드는 과제입니다. 빈칸이나 고정 정답이 필요하지 않고 acceptedAnswers는 빈 배열입니다. 목표어 표시 자체는 답안 노출이 아닙니다. 모든 유형의 answerForm은 목표어와 동일한 어휘의 자연스러운 활용형인지 검사하세요.',
    'learningCardAccurate는 needsCard=true일 때 쉬운 뜻, 예문, 비예와 이유가 실제 어휘 의미에 맞는지, 예문이 문제 문장과 겹치지 않는지, structureNote가 제공된 검토 문구와 맞는지 검사합니다. needsCard=false는 해당 없음으로 true입니다. 틀린 학습 자료가 있으면 valid=false입니다.',
    'mc_usage의 completedContext는 정답 상황 보기입니다. 이 유형은 빈칸이나 목표어를 삽입하는 문장이 없는 것이 정상입니다. 정답 상황 보기의 자연스러움과 목표어의 의미에 맞는 행동을 검사하세요.',
    'choiceContexts의 오답은 형식 문법(품사, 조사, 활용, 문장 구조)만 검사하세요. 오답을 넣어 내용이 틀리거나 뜻이 어색해지고, 어휘의 통상적 의미 결합·연어가 맞지 않는 것은 문맥 어휘 문제의 의도한 오답이므로 허용합니다. 이를 문법 오류나 자연성 오류로 오판하여 valid=false로 하지 마세요. 예: 정답이 ‘영향’인 ‘미치는 빈칸’에 같은 품사의 ‘원인’이 들어가 의미 결합이 틀리는 것은 오답으로 정상입니다. 품사가 다르거나 조사가 틀리는 경우만 samePartOfSpeechChoices=false입니다.',
    'coherentSituation은 인물·시간·행동·이유·결과의 앞뒤 연결과 목표어를 넣은 완성 문장의 조사·서술어 호응을 검사합니다. 어색한 번역투, 불필요한 반복, 갑작스러운 결론, 일상적으로 성립하지 않는 상황, 설명문을 옮긴 가짜 대화는 통과시키지 마세요.',
    '문법 판정은 실제 조사·활용·의미 결합의 오류를 근거로 하세요. 다른 표현을 더 선호한다는 이유만으로 자연스러운 문장을 오류 처리하지 마세요. 명사에 하다를 붙인 정상 표현인 문제 풀이를 하다, 문제 풀이를 하니 답을 찾았다, 문제 풀이를 보다는 그 결합 자체가 문법 오류가 아닙니다. 그 문장의 실제 맥락에 맞는지를 별도로 판단하세요.',
    '중복은 문장과 구체적인 사건 재사용을 판정합니다. 어휘의 뜻에 반드시 필요한 공통 행동이나 역할만 반복되는 것은 중복이 아닙니다. 예: 가게 주인이 계속 가게 운영을 맡는다는 역할, 고개를 젓다의 좌우 움직임은 뜻의 핵심이므로 유지해야 합니다. 문 열고 물건 고르는 동일한 사건을 반복하면 반려하되, 손님의 분실물을 돌려주거나 환불 요청을 해결하는 다른 목적과 사건은 허용합니다. 증여와 상속은 생전 무상 양도와 사후 재산 승계라는 서로 다른 개념입니다. 단지 가족과 재산이 나온다는 이유로 둘을 중복 처리하지 마세요. 실제 문장·사건·전개를 비교하세요.',
    '중복은 목표어별 previousContexts의 실제 문장과 구체적인 사건 전개를 우선 대조하세요. 최근 서명과 과목·배경·문제 유형만 같은 것은 중복 근거가 아닙니다. 서로 다른 수학 대화나 과학 실험이라는 이유만으로 notTooSimilarToRecent=false로 하지 마세요. 문장 재사용 또는 인물의 행동·문제 상황·전개가 실제로 지나치게 같은 경우는 계속 탈락시키세요.',
    '목표어의 핵심 의미는 복습에서도 같아야 하지만 사건·목적·관점·문장 구조는 바꾸세요. 기존 문장을 그대로 복사하거나 이름·숫자만 교체하면 탈락입니다. 수학·과학·문법의 명칭 퀴즈는 다른 장면으로 바꾸어도 vocabularyFocus=false입니다.',
    'notTooSimilarToRecent는 최근 서명뿐 아니라 각 목표의 previousContexts 실제 지문/보기와 후보 배치 내부도 비교합니다. 이름이나 사물만 바꾼 같은 사건·문장 틀은 중복입니다. 질문 안내 문구의 반복은 허용합니다.',
    '숨긴 빈칸이 관점/개념의 이름을 요구하거나 여러 추상 명사가 두루 들어갈 수 있는 일반 꼬리표이면 sufficientClues=false입니다. 목표 의미가 구체적 행동·의도·결과와 연결되어야 합니다. 새 단어의 mc_usage는 뜻 이해 연습이며 단어를 보여주는 것이 정상입니다.',
    '주관식에는 보기가 없으므로 samePartOfSpeechChoices는 해당 없음으로 true 처리해도 됩니다.',
    '정답 노출은 학생이 답하기 전에 보는 prompt/context/hints를 검사합니다. mc_context의 단어 보기, acceptedAnswers, feedbackCorrect에 목표어가 있는 것은 정상입니다. mc_usage는 질문에 목표어가 보이지만 상황 보기에는 목표어를 반복하지 않습니다. 목표어 이름이나 활용형이 정답 보기에만 나타나 문자 일치로 고를 수 있으면 noAnswerLeak=false, vocabularyFocus=false입니다.',
    '힌트의 뜻 풀이가 사전 정의와 비슷하다는 이유만으로 noAnswerLeak=false로 하지 마세요. 목표어 철자나 정답 번호/고유 보기 문구를 직접 제시하는 것만 힌트 노출 오류입니다. 힌트 사용은 이후 독립 회상으로 채점되지 않습니다.',
    '힌트는 학습자가 요청한 뒤에만 나타나는 단계적 도움입니다. 현재 상황의 의미 단서를 가리키거나 의미 범위를 좁히는 것은 허용합니다. 목표어 자체, 정답 번호, 정답 보기의 고유 문구를 그대로 알려주는 경우는 노출입니다. 피드백과 허용 답안은 답변 이후 정보이므로 노출 판단에서 반드시 제외하세요.',
    '빈칸 주관식은 검수자가 허용 답안을 독립적으로 확정하여 acceptedAnswers에 반환하세요. 빈칸에 자연스럽게 들어가는 answerForm은 credit 1입니다. 문맥에 맞지 않는 목표어 기본형은 제외하세요. 빈칸에 문법과 의미가 모두 자연스러운 다른 표현은 credit 1, 핵심 의미가 일부만 맞으면 0.5입니다. 어색한 사전식 유의어는 제외하고 문맥의 자연스러운 활용형을 유지하세요.',
    '빠진 자연스러운 대체 답안이나 잘못된 허용 답안은 이 검수 단계에서 수정하세요. naturalAlternativesConsidered와 valid는 반환하는 최종 허용 답안 기준입니다. 객관식의 acceptedAnswers는 빈 배열입니다.',
    '주관식에서 다른 자연스러운 표현이 가능하다는 사실만으로 valid=false로 하지 마세요. 그 표현을 최종 acceptedAnswers에 포함했다면 그 문제는 해결된 것입니다. 상황과 정답 문장 자체의 자연스러움은 계속 엄격히 검사하세요.',
    '허용 답안 목록만 수정할 수 있습니다. 문맥, 보기, 힌트 등 문제 자체의 결함은 수정한 것으로 간주하지 말고 valid=false와 구체적인 issues로 반환하세요.',
    '중요한 실제 결함은 valid=false입니다. 다만 주관식 대체 답안을 검수자가 추가해 해결했으면 그 사유로 valid=false를 유지하지 마세요. 힌트가 뜻 단서를 준다는 이유만으로 noAnswerLeak=false로 하지 마세요. 제출 전 issues와 각 boolean이 같은 판단인지 확인하세요. issues에서 true여야 한다고 설명한 항목에 false를 반환하지 마세요.',
    '목표/정의/유형: '+JSON.stringify(passageTargets(items).map(({usedPassageKeys,...item})=>item)),
    '최근 서명: '+JSON.stringify(recent||[]),
    '후보 문제: '+JSON.stringify(questions.map(q=>{
      const item=items.find(x=>x.id===q.id);
      return {...q,completedContext:SHOWN_TYPES.includes(q.type)?(q.options||[]).find(o=>o.correct)?.text||'':completeContext(q.context,q.answerForm||item?.word||''),choiceContexts:q.type==='mc_context'?(q.options||[]).map(o=>completeContext(q.context,o.text)):[]};
    }))
  ].join('\n');
  const out=await ask(prompt,verifySchema(items),'vocab_question_review',9000,'medium');
  return out.reviews||[];
}
export async function buildValidated(items,recent,{maxAttempts=3,partial=false,initialFeedback={}}={}){
  const pending=new Map(items.map(x=>[x.id,x])),accepted=new Map(),lastCandidates=new Map(),feedback={...initialFeedback};
  for(let attempt=0;attempt<maxAttempts&&pending.size;attempt++){
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
      q=normalizeCandidate(q,item);byId.set(item.id,q);lastCandidates.set(item.id,q);
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
        rv.naturalKorean&&rv.coherentSituation&&rv.ageAppropriate&&rv.factualAccuracy&&rv.readerLevelFit&&(!item.taskDemand||rv.levelDemandFit)&&rv.noBackgroundBurden&&rv.vocabularyFocus&&rv.noAnswerLeak&&
        (objective||rv.naturalAlternativesConsidered)&&rv.notTooSimilarToRecent&&(!item.needsCard||rv.learningCardAccurate);
      if(pass){
        q.validation={policy:QUESTION_POLICY,deterministic:true,aiVerified:true,checks:{
          sufficientClues:rv.sufficientClues,oneClearAnswer:rv.oneClearAnswer,samePartOfSpeechChoices:rv.samePartOfSpeechChoices,
          naturalKorean:rv.naturalKorean,coherentSituation:rv.coherentSituation,ageAppropriate:rv.ageAppropriate,factualAccuracy:rv.factualAccuracy,readerLevelFit:rv.readerLevelFit,levelDemandFit:!item.taskDemand||rv.levelDemandFit===true,noBackgroundBurden:rv.noBackgroundBurden,vocabularyFocus:rv.vocabularyFocus,
          noAnswerLeak:rv.noAnswerLeak,naturalAlternativesConsidered:rv.naturalAlternativesConsidered,notTooSimilarToRecent:rv.notTooSimilarToRecent,learningCardAccurate:rv.learningCardAccurate
        }};
        accepted.set(item.id,q);pending.delete(item.id);delete feedback[item.id];
      }else{
        const requiredChecks=['valid','sufficientClues','naturalKorean','coherentSituation','ageAppropriate','factualAccuracy','readerLevelFit','levelDemandFit','noBackgroundBurden','vocabularyFocus','noAnswerLeak','notTooSimilarToRecent',...(objective?['oneClearAnswer','samePartOfSpeechChoices']:['naturalAlternativesConsidered']),...(item.needsCard?['learningCardAccurate']:[])];
        feedback[item.id]=[...new Set([...d,...aiIssues,...(!rv?['verification_missing']:requiredChecks.filter(key=>!rv[key]).map(key=>'review_failed:'+key))])];
      }
    }
  }
  if(pending.size){
    const failed=[...pending.keys()].map(id=>({id,issues:feedback[id]||['unknown_validation_failure'],...(partial?{context:lastCandidates.get(id)?.context||'',prompt:lastCandidates.get(id)?.prompt||''}:{})}));
    if(partial){const out=items.filter(x=>accepted.has(x.id)).map(x=>accepted.get(x.id));out.failed=failed;return out}
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
      band:Math.max(1,Math.min(9,Number(x.band)||3)),readerLevel:Math.max(1,Math.min(9,Number(x.readerLevel)||Number(x.band)||2)),
      domain:DOMAINS.includes(x.domain)?x.domain:'국어',
      example:String(x.example||'').trim(),
      contextSeed:String(x.contextSeed||'').slice(0,180),
      answerSlot:Math.max(0,Math.min(4,Number(x.answerSlot)||0)),
      supportLevel:Math.max(0,Math.min(3,Number(x.supportLevel)||0)),
      successStreak:Math.max(0,Number(x.successStreak)||0),
      firstLearning:Boolean(x.firstLearning),needsCard:Boolean(x.needsCard),structureNote:String(x.structureNote||'').slice(0,300),stage:String(x.stage||'').slice(0,30),taskDemand:['foundation-review','initial-practice','advanced','standard'].includes(x.taskDemand)?x.taskDemand:'standard',
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
