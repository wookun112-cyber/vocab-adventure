import {QUESTION_POLICY,isLearningTarget,isRecordedVocabulary,sentenceWritingTask} from './learning-model.js';

export const SENTENCE_USE_REVISION='sentence-use-template-12.16.7';
// The learner supplies the situation and sentence. This fixed instruction
// needs no generated passage; semantic grading still happens after submission.
export const RECALL_REVISION='retention-recall-12.16.24';
export function recallQuestion(item){
 if(item?.type!=='subjective_recall'||!item.review||item.needsCard||!Number.isInteger(item.band)||!isLearningTarget(item.word,item.domain,item.band)||!item.definition?.trim())return null;
 const clue=item.definition.split(item.word).join('이 말');
 return {id:String(item.id),type:'subjective_recall',prompt:'뜻을 보고 해당하는 어휘를 직접 떠올려 쓰세요.\n'+clue,context:'',showTarget:false,options:[],answerForm:item.word,
 acceptedAnswers:[{text:item.word,credit:1,targetRecall:true,rationale:'목표 어휘 회상'}],hints:['뜻에서 가장 중요한 특징을 찾아보세요.'],feedbackCorrect:'정답은 “'+item.word+'”입니다.',
 signature:RECALL_REVISION+':'+item.word,learningCard:null,validation:{policy:QUESTION_POLICY,source:'fixed_recall_template',sourceRevision:RECALL_REVISION,schemaChecked:true,deterministic:true,aiVerified:false}};
}
export function sentenceUseQuestion(item){
 if(item?.type==='subjective_recall')return recallQuestion(item);
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
 if(v?.source==='fixed_recall_template'){
  const raw=recallQuestion({id:'',type:q.type,review:true,word:w.w,definition:w.d,band:w.band,domain:w.cat,needsCard:q.needsCard});
  return !!raw&&!q.authored&&!q.learningCard&&q.open===true&&q.showTarget===false&&q.hideWord===true&&q.ctx===''&&q.q===raw.prompt&&q.answerForm===w.w&&q.signature===raw.signature&&q.feedbackCorrect===raw.feedbackCorrect&&JSON.stringify(q.opts)===JSON.stringify([])&&q.acceptedAnswers?.length===1&&q.acceptedAnswers[0].text===w.w&&q.acceptedAnswers[0].credit===1&&q.acceptedAnswers[0].targetRecall===true&&JSON.stringify(q.hints)===JSON.stringify(raw.hints)&&Object.entries(raw.validation).every(([key,value])=>v[key]===value)&&(!plan||(plan.type==='subjective_recall'&&plan.review===true&&!plan.needsCard&&plan.w.w===w.w&&plan.w.d===w.d&&plan.w.band===w.band));
 }
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

