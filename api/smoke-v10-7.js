import {buildValidated} from './questions.js';
import {runGrade} from './grade.js';

const TOKEN='v10_7_smoke_M7q4nC2pL8xR6tV3';

export default async function handler(req,res){
  if(req.method!=='GET'||req.query?.token!==TOKEN)return res.status(404).end();
  try{
    const items=[
      {id:'q1',type:'mc_context',word:'영향',definition:'어떤 것이 다른 것에 미치는 작용',band:3,domain:'국어',example:'날씨는 식물의 성장에 영향을 준다.',answerSlot:0,supportLevel:0,successStreak:1,firstLearning:false},
      {id:'q2',type:'mc_usage',word:'관찰',definition:'대상을 자세히 살펴보고 알아봄',band:3,domain:'과학',example:'과학 시간에 식물의 잎을 관찰했다.',answerSlot:1,supportLevel:0,successStreak:2,firstLearning:false},
      {id:'q3',type:'subjective_context',word:'근거',definition:'생각이나 주장을 뒷받침하는 까닭이나 자료',band:3,domain:'국어',example:'주장을 할 때에는 근거를 함께 제시해야 한다.',answerSlot:0,supportLevel:1,successStreak:0,firstLearning:false},
      {id:'q4',type:'subjective_dialogue',word:'변화',definition:'이전과 달라짐',band:3,domain:'생활',example:'계절이 바뀌면서 날씨에도 변화가 생겼다.',answerSlot:0,supportLevel:0,successStreak:3,firstLearning:false}
    ];
    const questions=await buildValidated(items,['학교 급식 메뉴를 조사한 상황|보기A§보기B§보기C§보기D§보기E']);
    const base={
      taskType:'context_answer',targetWord:'원인',definition:'어떤 일이 생기게 만든 까닭',band:3,
      question:'밤새 비가 많이 내렸다. 아침에 운동장 곳곳에 물이 고여 있었다. 물이 고인 ＿＿＿＿은 밤새 내린 많은 비였다.',
      acceptedAnswers:[
        {text:'원인',credit:1,rationale:'목표어'},
        {text:'이유',credit:1,rationale:'이 문맥에서 자연스러운 대체 표현'}
      ],source:'typed'
    };
    const grades=[];
    for(const answer of ['원인','이유','결과'])grades.push({answer,...await runGrade({...base,answer})});
    return res.status(200).json({
      questionCount:questions.length,
      questions:questions.map(q=>({
        id:q.id,type:q.type,prompt:q.prompt,context:q.context,showTarget:q.showTarget,
        options:q.options,acceptedAnswers:q.acceptedAnswers,hints:q.hints,signature:q.signature,validation:q.validation
      })),
      grades
    });
  }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}