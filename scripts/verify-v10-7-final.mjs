import {buildValidated} from '../api/questions.js';
import {runGrade} from '../api/grade.js';

const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const TOKEN='v107-final-verify-Q8m4R2x7';

async function store(result){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/tmp_store_v107_verify',{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({p_token:TOKEN,p_result:result})
  });
  if(!r.ok)throw new Error('store failed '+r.status+' '+await r.text());
}
const norm=s=>String(s||'').replace(/[\s"'“”‘’.,!?()[\]{}]/g,'');
const blanks=s=>(String(s||'').match(/＿＿＿＿/g)||[]).length;

try{
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY missing');
  const items=[
    {id:'1',type:'mc_context',word:'영향',definition:'어떤 것이 다른 것에 미치는 작용',band:3,domain:'국어',example:'날씨는 식물의 성장에 영향을 준다.',answerSlot:0,supportLevel:0,successStreak:1,firstLearning:false},
    {id:'2',type:'mc_usage',word:'관찰',definition:'대상을 자세히 살펴보고 알아봄',band:3,domain:'과학',example:'과학 시간에 식물의 잎을 관찰했다.',answerSlot:1,supportLevel:0,successStreak:2,firstLearning:false},
    {id:'3',type:'subjective_context',word:'근거',definition:'생각이나 주장을 뒷받침하는 까닭이나 자료',band:3,domain:'국어',example:'주장을 할 때에는 근거를 함께 제시해야 한다.',answerSlot:0,supportLevel:1,successStreak:0,firstLearning:false},
    {id:'4',type:'subjective_dialogue',word:'변화',definition:'이전과 달라짐',band:3,domain:'생활',example:'계절이 바뀌면서 날씨에도 변화가 생겼다.',answerSlot:0,supportLevel:0,successStreak:3,firstLearning:false}
  ];
  const questions=await buildValidated(items,['가족이 장보기 계획을 세운 상황']);
  const checks=questions.map((q,i)=>{
    const item=items[i];
    const objective=item.type.startsWith('mc_');
    return {
      id:q.id,
      type:q.type,
      valid:Boolean(q.validation?.deterministic&&q.validation?.aiVerified),
      fiveChoices:objective?(q.options?.length===5):true,
      oneCorrect:objective?(q.options?.filter(x=>x.correct).length===1):true,
      oneBlank:['mc_context','subjective_context','subjective_dialogue'].includes(item.type)?blanks(q.context)===1:true,
      targetHidden:item.type==='mc_usage'?q.showTarget===true:(!q.showTarget&&!String(q.context).includes(item.word)&&!String(q.prompt).includes(item.word)),
      targetAccepted:objective?true:(q.acceptedAnswers||[]).some(x=>norm(x.text)===norm(item.word)&&Number(x.credit)===1),
      hints:q.hints?.length===2
    };
  });
  if(checks.some(c=>Object.entries(c).some(([k,v])=>!['id','type'].includes(k)&&v!==true)))throw new Error('question checks failed '+JSON.stringify(checks));

  const base={
    taskType:'context_answer',
    targetWord:'원인',
    definition:'어떤 일이 생기게 만든 까닭',
    band:3,
    question:'밤새 비가 많이 내렸다. 아침에 운동장 곳곳에 물이 고여 있었다. 물이 고인 ＿＿＿＿은 밤새 내린 많은 비였다.',
    acceptedAnswers:[
      {text:'원인',credit:1,rationale:'목표어'},
      {text:'이유',credit:1,rationale:'이 문맥에서 자연스러운 대체 표현'}
    ],
    source:'typed'
  };
  const grades=[];
  for(const answer of ['원인','이유','결과']){
    const g=await runGrade({...base,answer});
    grades.push({answer,result:g.result,score:g.score,contextSuccess:g.contextSuccess,targetRecall:g.targetRecall,feedback:g.feedback});
  }
  const target=grades.find(x=>x.answer==='원인');
  const alt=grades.find(x=>x.answer==='이유');
  const wrong=grades.find(x=>x.answer==='결과');
  if(!(target?.score===1&&target?.contextSuccess===true&&target?.targetRecall===true))throw new Error('target grading failed '+JSON.stringify(target));
  if(!(alt?.score===1&&alt?.contextSuccess===true&&alt?.targetRecall===false))throw new Error('alternative grading failed '+JSON.stringify(alt));
  if(!(wrong?.score===0&&wrong?.contextSuccess===false))throw new Error('wrong grading failed '+JSON.stringify(wrong));

  await store({
    ok:true,
    checks,
    samples:questions.map(q=>({
      id:q.id,type:q.type,prompt:q.prompt,context:q.context,showTarget:q.showTarget,
      options:(q.options||[]).map(x=>({text:x.text,correct:x.correct})),
      acceptedAnswers:q.acceptedAnswers,hints:q.hints,feedbackCorrect:q.feedbackCorrect,
      signature:q.signature,validation:q.validation
    })),
    grades
  });
  console.log('V10.7 FINAL VERIFY PASSED');
}catch(e){
  await store({ok:false,error:String(e?.stack||e)});
  throw e;
}