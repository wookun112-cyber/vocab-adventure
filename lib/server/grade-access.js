import {AUTHORED_OWNER} from '../authored-policy.js';
export function requireGradingAccount(user){
 if(user?.id!==AUTHORED_OWNER)throw Object.assign(Error('이 계정은 가족 학습 채점을 사용할 수 없어요.'),{status:403,code:'grading_account_not_allowed'});
}
export async function authorizeGradeTask(auth,p,rpc){
 if(!['sentence_use','definition_recall','context_answer'].includes(p.taskType)||
    !['typed','voice'].includes(p.source)||typeof p.targetWord!=='string'||p.targetWord.length>80||
    typeof p.definition!=='string'||p.definition.length>1500||
    JSON.stringify(p.acceptedAnswers||[]).length>5000||JSON.stringify(p.allowNaturalDerivations||[]).length>1500||
    JSON.stringify(p.previousExamples||[]).length>15000||p.gradingContext)
  throw Object.assign(Error('등록된 학습 과제만 채점할 수 있어요.'),{status:400,code:'invalid_grade_task'});
 const assigned=await rpc(auth,'get_vocab_grade_assignment',{p_request:{targetWord:p.targetWord,definition:p.definition,question:p.question,taskType:p.taskType,acceptedAnswers:p.acceptedAnswers||[],allowNaturalDerivations:p.allowNaturalDerivations||[]}},5000);
 if(assigned!==true)throw Object.assign(Error('학습 과제의 서버 저장을 먼저 확인하고 있어요. 답안은 보관됩니다.'),{status:409,code:'grading_assignment_pending'});
}
