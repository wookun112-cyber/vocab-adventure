import {QUESTION_POLICY,isLearningTarget,isRecordedVocabulary,sentenceWritingTask} from './learning-model.js';

export const SENTENCE_USE_REVISION='sentence-use-template-12.16.7';
// The learner supplies the situation and sentence. This fixed instruction
// needs no generated passage; semantic grading still happens after submission.
export function sentenceUseQuestion(item){
 if(item?.type!=='subjective_use'||item.needsCard||!Number.isInteger(item.band)||
  !isLearningTarget(item.word,item.domain,item.band)||typeof item.definition!=='string'||!item.definition.trim())return null;
 const task=sentenceWritingTask(item.word);
 return {id:String(item.id),type:'subjective_use',prompt:task.prompt,context:'',showTarget:true,
  options:[],answerForm:item.word,acceptedAnswers:[],hints:task.hints,feedbackCorrect:'단어의 뜻이 드러나게 쓴 문장을 확인했어요.',
  signature:SENTENCE_USE_REVISION+':'+item.word,learningCard:null,semanticGraderRequired:true,allowNaturalDerivations:[],
  validation:{policy:QUESTION_POLICY,source:'sentence_use_template',sourceRevision:SENTENCE_USE_REVISION,schemaChecked:true,deterministic:true,aiVerified:false}};
}
export function sentenceUseQuestionValid(q,plan=null,historical=false){
 const w=q?.w,v=q?.validation;
 if(!w||!Number.isInteger(w.band)||!(historical?isRecordedVocabulary(w.w,w.cat,w.band):isLearningTarget(w.w,w.cat,w.band))||typeof w.d!=='string'||!w.d.trim())return false;
 const task=sentenceWritingTask(w.w);
 return q.type==='subjective_use'&&!q.needsCard&&q.learningCard==null&&!q.authored&&
  v?.policy===QUESTION_POLICY&&v.source==='sentence_use_template'&&v.sourceRevision===SENTENCE_USE_REVISION&&
  v.schemaChecked===true&&v.deterministic===true&&v.aiVerified===false&&
  q.q===task.prompt&&q.ctx===''&&q.answerForm===w.w&&q.showTarget===true&&q.hideWord===false&&q.open===true&&
  q.signature===SENTENCE_USE_REVISION+':'+w.w&&q.feedbackCorrect==='단어의 뜻이 드러나게 쓴 문장을 확인했어요.'&&
  Array.isArray(q.opts)&&q.opts.length===0&&Array.isArray(q.acceptedAnswers)&&q.acceptedAnswers.length===0&&
  Array.isArray(q.allowNaturalDerivations)&&q.allowNaturalDerivations.length===0&&q.semanticGraderRequired===true&&
  JSON.stringify(q.hints)===JSON.stringify(task.hints)&&
  (!plan||(plan.type==='subjective_use'&&!plan.needsCard&&plan.w?.w===w.w&&plan.w.d===w.d&&plan.w.band===w.band));
}
