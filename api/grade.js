const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';

function extractText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  const parts=[];
  for(const item of data?.output||[])for(const c of item?.content||[])if(typeof c?.text==='string')parts.push(c.text);
  return parts.join('\n');
}
async function verifyUser(auth){
  if(!auth?.startsWith('Bearer '))return false;
  const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:auth}});
  return r.ok;
}
export async function runGrade(payload){
  const {
    question,answer,source='typed',targetWord='',definition='',band=3,
    gradingContext='',taskType='general',taskDemand='standard',readerLevel=band,acceptedAnswers=[]
  }=payload||{};
  if(!question||typeof answer!=='string')throw new Error('Bad request');

  const sentenceMode=taskType==='sentence_use';
  const contextMode=taskType==='context_answer'||sentenceMode;
  const prompt=sentenceMode?`당신은 초등학생의 한국어 어휘 사용 문장에 짧고 구체적인 피드백을 줍니다.
목표 어휘: ${targetWord}
기준 뜻: ${definition}
상황과 과제: ${question}
현재 어휘력 수준: ${readerLevel}
${taskDemand==='advanced'?'이번 과제는 심화 활용입니다. 목표어를 자연스럽게 썼는지와, 과제에서 요구한 판단·이유·조건·결과 중 해당 요소를 문장에 담았는지 함께 확인하세요. 단어만 끼워 넣은 일반 문장으로 요청한 상황이나 의미 관계를 보여 주지 못했다면 0.5 이하이며, 문체의 화려함이나 길이로 점수를 주지 마세요.':''}
학생 문장: ${answer}
입력 방식: ${source}
규칙: 목표어 또는 같은 어휘의 자연스러운 활용형을 포함하고, 문장 전체가 실제 상황에서 해당 뜻으로 적절하게 쓰였으면 score 1입니다. 단어만 쓴 답, 뜻만 복사한 답, 목표어 없이 다른 표현만 쓴 답은 완전 정답이 아닙니다. 뜻을 일부 반영했으나 사용이 불완전하면 0.5, 뜻과 쓰임이 틀리거나 단어만 썼으면 0입니다. 의미가 분명한 사소한 오타/띄어쓰기는 허용합니다. 목표어를 화면에 보여준 활동이므로 targetRecall은 항상 false입니다. contextSuccess는 score 1일 때만 true입니다. 의견의 도덕성이나 문체 취향은 평가하지 않습니다. feedback은 단어가 왜 맞게/부족하게 쓰였는지와 개선 단서 하나를 1~2문장으로 주세요. voice는 명백한 인식 오류만 보정하며 발음은 평가하지 않습니다. JSON으로 normalizedAnswer,result(○|△|×),score(0|0.5|1),contextSuccess,targetRecall,feedback,correctionApplied,correctionNote를 반환하세요.`:contextMode?`당신은 한국어 어휘 문맥 문제를 채점합니다.
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
6. targetRecall은 학생이 목표 어휘 자체 또는 명백한 활용형/사소한 오타 형태를 직접 떠올린 경우에만 true입니다. 다른 완전한 대체 표현이면 contextSuccess=true, targetRecall=false입니다.
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
      correctionApplied:{type:'boolean'},
      correctionNote:{type:'string'}
    },
    required:['normalizedAnswer','result','score','contextSuccess','targetRecall','feedback','correctionApplied','correctionNote'],
    additionalProperties:false
  };
  const model=process.env.OPENAI_MODEL||'gpt-6-luna';
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      model,reasoning:{effort:'low'},max_output_tokens:500,input:prompt,
      text:{format:{type:'json_schema',name:'vocab_grade',strict:true,schema}}
    })
  });
  if(!r.ok)throw new Error('OpenAI '+r.status+': '+(await r.text()).slice(0,220));
  const graded=JSON.parse(extractText(await r.json()).trim());
  if(sentenceMode){graded.targetRecall=false;graded.contextSuccess=graded.score===1}
  return {...graded,model};
}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!(await verifyUser(req.headers.authorization)))return res.status(401).json({error:'Login required'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI not configured'});
  try{return res.status(200).json(await runGrade(req.body||{}))}
  catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
