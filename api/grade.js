import {waitUntil} from '@vercel/functions';
import {createGradeDelivery} from '../lib/server/grade-delivery.js';
import {requireGradingAccount,authorizeGradeTask} from '../lib/server/grade-access.js';
import {copiedUsageExample} from '../lib/learning-model.js';
const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';

function extractText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const parts=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')parts.push(c.text);
  return parts.join('\n');
}
export async function verifyUser(auth){
  if(!auth?.startsWith('Bearer '))return false;
  const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:auth},signal:AbortSignal.timeout(5000)});
  if(!r.ok)return null;
  return r.json();
}
export async function runGrade(payload){
  const {
    question,answer,source='typed',targetWord='',definition='',band=3,
    gradingContext='',taskType='general',taskDemand='standard',readerLevel=band,acceptedAnswers=[],allowNaturalDerivations=[]
  }=payload||{};
  if(!question||typeof answer!=='string')throw new Error('Bad request');

  const sentenceMode=taskType==='sentence_use';
  const recallMode=taskType==='definition_recall';
  const contextMode=taskType==='context_answer'||sentenceMode||recallMode;
  const prompt=sentenceMode?`당신은 초등학생의 한국어 어휘 사용 문장에 짧고 구체적인 피드백을 줍니다.
목표 어휘: ${targetWord}
기준 뜻: ${definition}
상황과 과제: ${question}
현재 어휘력 수준: ${readerLevel}
학생은 예문이나 지정 상황 없이 자신의 문장을 만듭니다. 실제로 요구하지 않은 이유·조건·결과·인물 역할을 숨은 채점 조건으로 추가하지 마세요. 단어 뜻의 핵심 조건과 자연스러운 사용을 판단하되 평범한 문장도 의미가 정확하면 정답입니다.
허용할 자연스러운 파생형(문장 의미가 알맞을 때만): ${JSON.stringify(allowNaturalDerivations)}
학생 문장: ${answer}
입력 방식: ${source}
규칙: 목표어 또는 같은 어휘의 자연스러운 활용형을 포함하고, 문장 전체가 실제 상황에서 해당 뜻으로 적절하게 쓰였으면 score 1입니다. 단어만 쓴 답, 뜻만 복사한 답, 목표어 없이 다른 표현만 쓴 답은 완전 정답이 아닙니다. 뜻을 일부 반영했으나 사용이 불완전하면 0.5, 뜻과 쓰임이 틀리거나 단어만 썼으면 0입니다. 의미가 분명한 사소한 오타/띄어쓰기는 허용합니다. 목표어를 화면에 보여준 활동이므로 targetRecall은 항상 false입니다. contextSuccess는 score 1일 때만 true입니다. 의견의 도덕성이나 문체 취향은 평가하지 않습니다. feedback은 단어가 왜 맞게/부족하게 쓰였는지와 개선 단서 하나를 1~2문장으로 주세요. voice는 명백한 인식 오류만 보정하며 발음은 평가하지 않습니다. JSON으로 normalizedAnswer,result(○|△|×),score(0|0.5|1),contextSuccess,targetRecall,feedback,correctionApplied,correctionNote를 반환하세요.`:recallMode?`당신은 한국어 어휘의 뜻 회상 답을 확인합니다.
목표 어휘: ${targetWord}
기준 뜻: ${definition}
뜻 설명과 질문: ${question}
검토된 답안: ${JSON.stringify(acceptedAnswers)}
학생 답: ${answer}
입력 방식: ${source}
설명에 제시한 핵심 뜻 전체를 만족하는 목표어 또는 자연스러운 동의어는 score 1입니다. 관련된 넓은 말이 핵심 의미 일부만 담으면 0.5, 핵심 의미를 담지 못하면 0입니다. 문장 빈칸에 넣어 보는 채점은 하지 않습니다. 예를 들어 바닷물이 해안 쪽으로 들어와 수위가 높아지는 현상의 답 밀물에 바닷물은 완전 정답이 아닙니다. 사소한 오타·띄어쓰기는 의미가 명확하면 허용합니다. 다른 자연스러운 동의어를 숨겨 둔 목표어와 다르다는 이유로 깎지 마세요. targetRecall은 목표 어휘 자체 또는 사소한 오타·자연스러운 활용형을 회상했을 때만 true입니다. 동의어 정답은 contextSuccess=true,targetRecall=false입니다. source가 voice이면 명백한 인식 오류만 보정하고 발음은 평가하지 않습니다. feedback에는 핵심 뜻이 맞는지 또는 어떤 의미가 빠졌는지 짧게 설명합니다. JSON으로 normalizedAnswer,result(○|△|×),score(0|0.5|1),contextSuccess,targetRecall,feedback,correctionApplied,correctionNote를 반환하세요.`:contextMode?`당신은 한국어 어휘 문맥 문제를 채점합니다.
목표 어휘: ${targetWord}
기준 뜻: ${definition}
권장 학습 단계: ${band}
문제와 지문:
${question}
미리 검토된 허용 답안 후보(절대적인 목록은 아님): ${JSON.stringify(acceptedAnswers)}
학생 답: ${answer}
입력 방식: ${source}

채점 원칙:
1. 목표는 문맥 이해와 적절한 어휘 사용입니다. 학생이 목표 어휘와 다른 표현을 썼더라도 그 문맥에서 뜻과 쓰임이 완전히 자연스러우면 정답(score 1)입니다.
2. 단순히 유의어라는 이유만으로 정답이나 반점을 주지 마세요. 실제 문장에 넣었을 때 문법과 의미가 모두 맞아야 합니다.
3. 의미가 일부만 맞거나 핵심 단서 하나만 반영하면 부분정답(score 0.5)입니다.
4. 관련어이지만 핵심 의미가 다르거나 문맥에 어색하면 오답(score 0)입니다.
5. 띄어쓰기, 조사, 활용형 차이는 허용합니다. 의미가 명확한 사소한 오타는 이해와 별도로 보정하고 정답으로 인정할 수 있습니다.
6. targetRecall은 학생이 목표 어휘 자체 또는 명백한 활용형/사소한 오타 형태를 직접 떠올린 경우에만 true입니다. 다른 완전한 대체 표현이면 contextSuccess=true,targetRecall=false입니다.
7. contextSuccess는 score 1이면 true, score 0.5이면 부분 이해로 false, score 0이면 false입니다.
8. source가 voice이면 명백한 STT 오인식만 보정합니다. 발음은 평가하지 않습니다.
9. feedback은 문맥의 핵심 단서와 학생 답이 왜 맞거나 부족한지 1~2문장으로 설명합니다.
반드시 JSON만 출력:
{"normalizedAnswer":"...","result":"○|△|×","score":0.0,"contextSuccess":false,"targetRecall":false,"feedback":"...","correctionApplied":false,"correctionNote":"..."}`:`당신은 한국어 어휘 학습 답안을 채점합니다.
목표 단어: ${targetWord}
기준 뜻: ${definition}
권장 학습 단계: ${band}
문제: ${question}
내부 채점 참고: ${gradingContext}
학생 답: ${answer}
입력 방식: ${source}

규칙:
- 문맥 이해와 실제 사용을 우선합니다.
- source가 voice이면 명백한 STT 오인식만 보정합니다. 발음은 평가하지 않습니다.
- feedback은 짧고 명확하게 씁니다.
반드시 JSON만 출력:
{"normalizedAnswer":"...","result":"◎|○|△|?|×","score":0.0,"contextSuccess":false,"targetRecall":false,"feedback":"...","correctionApplied":false,"correctionNote":"..."}`;

  const usageRubric=sentenceMode?`
[어휘 사용 판정 — 글쓰기 교정과 분리]
먼저 학생 원문의 의미를 평가하고 usageAssessment를 작성하세요. 더 좋은 예문과 비교하여 감점하지 마세요.
- meaning: correct(해당 뜻으로 알맞게 사용), unclear(뜻 일부만 드러나거나 판단할 맥락 부족), incorrect(뜻을 반대로 쓰거나 명백한 오용).
- target: present(목표어·자연스러운 활용형·허용 파생형 포함, 뜻이 명확한 경미한 오타 포함), missing(목표어가 없음).
- expression: complete(하나의 생각이 전달됨), incomplete(단어 나열 또는 서술이 끊겨 생각을 전달하지 못함). 사소한 조사·띄어쓰기·맞춤법 오류만으로 incomplete로 판단하지 마세요.
- issue: none, form_only(뜻은 맞고 표현만 다듬을 수 있음), meaning_error, insufficient_meaning.
중요: 정의를 문장 안에서 풀어 설명하거나 이유·효능·원리·구체적 사례를 덧붙일 의무는 없습니다. 자연스러운 일반 문장도 정답입니다.
예: ‘엄마가 나에게 항생제를 먹으라고 했다’는 항생제의 효능 설명이 없어도 correct/present/complete이며 score 1입니다. 세균이라는 말을 추가하라고 감점하지 마세요.
예: ‘학교 도서관에서 사전을 빌렸다’는 사전의 정의를 설명하지 않아도 score 1입니다.
예: ‘이곳에서 저곳에 거리는 일정하다’는 조사 ‘에/의’를 다듬을 수 있지만 의미와 용법이 맞으므로 correct/present/complete, issue=form_only, score 1입니다.
예: ‘비가 와서 우산을 펼쳤다’는 ‘펼치다’를 자연스럽게 활용했으므로 score 1입니다.
반례: ‘항생제로 바이러스를 없앴다’처럼 목표 뜻을 명백히 오해한 문장은 incorrect입니다. ‘항생제’, ‘바탕 객관적’ 같은 단어 나열은 incomplete입니다. 목표어 없이 뜻만 쓴 답은 target=missing입니다.
meaning=correct, target=present, expression=complete이면 반드시 score 1, result=○, contextSuccess=true입니다. form_only 교정은 correctionNote에만 적고 feedback에서도 정답임을 분명히 하세요. unclear 또는 incomplete는 0.5, incorrect 또는 missing은 0입니다.
`:'';
  const feedbackPrompt=prompt+usageRubric+`\n채점 뒤 보여주는 표현 예: exampleAnswer는 sentence_use에서만 작성하고 다른 과제는 빈 문자열로 반환합니다. 문장 사용이 정확하면 학생 문장을 그대로 쓰되 명백한 오타만 바로잡으세요. 부족한 문장이면 목표 어휘의 뜻과 쓰임이 드러나도록 자연스럽게 다듬은 짧은 문장 하나를 주세요. 단어만 쓴 답은 현재 어휘력 수준에 맞는 평범한 생활 문장 하나로 예를 들어 주세요. 새로운 역사·과학 사실이나 숨은 조건은 추가하지 마세요. 이 예문은 학생 답을 채점한 뒤에 보여줄 참고 자료이며, 학생의 normalizedAnswer·score·contextSuccess를 예문에 맞춰 바꾸지 마세요.`;
  const scoreSchema=contextMode
    ?{type:'number',enum:[0,0.5,1]}
    :{type:'number',minimum:0,maximum:1};
  const schema={
    type:'object',
    properties:{
      normalizedAnswer:{type:'string'},
      result:{type:'string',enum:contextMode?['○','△','×']:['◎','○','△','?','×']},
      score:scoreSchema,
      contextSuccess:{type:'boolean'},
      targetRecall:{type:'boolean'},
      feedback:{type:'string'},
      exampleAnswer:{type:'string'},
      correctionApplied:{type:'boolean'},
      correctionNote:{type:'string'}
    },
    required:['normalizedAnswer','result','score','contextSuccess','targetRecall','feedback','exampleAnswer','correctionApplied','correctionNote'],
    additionalProperties:false
  };
  if(sentenceMode){
    schema.properties.usageAssessment={type:'object',properties:{meaning:{type:'string',enum:['correct','unclear','incorrect']},target:{type:'string',enum:['present','missing']},expression:{type:'string',enum:['complete','incomplete']},issue:{type:'string',enum:['none','form_only','meaning_error','insufficient_meaning']}},required:['meaning','target','expression','issue'],additionalProperties:false};
    schema.required.push('usageAssessment');
  }
  const model=process.env.OPENAI_MODEL||'gpt-6-luna';
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(22000),
    body:JSON.stringify({
      model,reasoning:{effort:'low'},max_output_tokens:650,input:feedbackPrompt,
      text:{format:{type:'json_schema',name:'vocab_grade',strict:true,schema}}
    })
  });
  if(!r.ok)throw new Error('OpenAI '+r.status+': '+(await r.text()).slice(0,220));
  const response=await r.json();
  // Aggregate token counts only: never log children's answers or lesson contents.
  if(response?.usage)console.info(JSON.stringify({
    event:'vocab_grade_usage',model,taskType,
    inputTokens:Number(response.usage.input_tokens)||0,
    cachedInputTokens:Number(response.usage.input_tokens_details?.cached_tokens)||0,
    outputTokens:Number(response.usage.output_tokens)||0
  }));
  const graded=JSON.parse(extractText(response).trim());
  if(![0,.5,1].includes(graded.score))throw new Error('Invalid grade response');
  if(sentenceMode&&graded.usageAssessment){
    const a=graded.usageAssessment;
    if(!['correct','unclear','incorrect'].includes(a.meaning)||!['present','missing'].includes(a.target)||!['complete','incomplete'].includes(a.expression))throw Error('Invalid usage assessment');
    const previousScore=graded.score;
    graded.score=a.target==='missing'||a.meaning==='incorrect'?0:a.meaning==='correct'&&a.expression==='complete'?1:.5;
    graded.result=graded.score===1?'○':graded.score===.5?'△':'×';
    if(graded.score===1&&previousScore!==1)graded.feedback='목표 어휘를 문장에 알맞게 사용했어요.';
  }else if(sentenceMode&&payload.gradingPolicy==='meaning-first-20261018')throw Error('Missing usage assessment');
  graded.copiedExample=sentenceMode&&copiedUsageExample(answer,payload.previousExamples||[]);
  if(sentenceMode){
    const compact=s=>String(s).normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
    if(compact(answer)===compact(targetWord)){graded.score=0;graded.result='×';graded.feedback='단어만 쓰기보다, 이 단어를 넣어 무슨 일이 있었는지 한 문장으로 써 보세요.'}
    graded.targetRecall=false;graded.contextSuccess=graded.score===1;
  }
  if(recallMode)graded.contextSuccess=graded.score===1;
  graded.exampleAnswer=sentenceMode&&typeof graded.exampleAnswer==='string'?graded.exampleAnswer.trim().slice(0,400):'';
  return {...graded,model};
}
function gradeForRequest(result,payload){
  // Previous lesson examples affect copied-answer credit, not semantic grading.
  // Re-evaluate this flag for the current submission, including cache hits.
  if(payload.taskType!=='sentence_use')return result;
  return {...result,copiedExample:copiedUsageExample(payload.answer,payload.previousExamples||[])};
}
export async function gradeRPC(auth,name,args,timeout=2500){
 const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(timeout)});
 if(!r.ok){let problem={};try{problem=await r.json()}catch{};const code=String(problem.message||'');throw Error(/GRADE_(DAILY|RATE|CONCURRENCY)_LIMIT/.test(code)?code:'Grade storage unavailable');}return r.json();
}
let reliableDelivery=null;
export default async function handler(req,res){
 res.setHeader?.('Cache-Control','private, no-store');
 if(!reliableDelivery)reliableDelivery=createGradeDelivery({verifyUser,runGrade,gradeRPC,gradeForRequest,authorizeAccount:requireGradingAccount,authorizeTask:authorizeGradeTask,keepAlive:waitUntil});
 const started=Date.now();let code=200;
 const response={status(n){code=n;res.status(n);return this},json(value){console.info(JSON.stringify({event:'vocab_grade_delivery',status:code,code:value.code||null,cached:value.cached===true,cachePending:value.cachePending===true,elapsedMs:Date.now()-started}));return res.json(value);}};
 return reliableDelivery(req,response);
}
