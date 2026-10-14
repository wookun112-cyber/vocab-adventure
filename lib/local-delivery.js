import {QUESTION_POLICY,isLearningTarget,isCoveragePlan,REALTIME_LEVEL_POLICY} from './learning-model.js';
import {authoredQuestionValid} from './authored-policy.js';
import {sentenceUseQuestion,sentenceUseQuestionValid} from './sentence-use-template.js';

export const DELIVERY_POLICY='bundled-practice-12.16.8';
const practiceTypes=['subjective_recall','mc_context','mc_usage'];
export function deliveryPassageKeys(context,options=[]){
 const keys=new Set();
 for(const text of [context,...options])for(const unit of [String(text||''),...String(text||'').split(/[.!?。！？\n]+/)]){
  const clean=unit.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();if(clean.length<12)continue;
  let a=2166136261,b=5381;for(let i=0;i<clean.length;i++){a=Math.imul(a^clean.charCodeAt(i),16777619);b=Math.imul(b,33)^clean.charCodeAt(i)}
  keys.add((a>>>0).toString(16)+'-'+(b>>>0).toString(16));
 }
 return [...keys];
}
export function deliveryQuestionValid(q,plan,level,account){
 if(!q||q.w?.w!==plan.w?.w||q.w.d!==plan.w.d||q.w.band!==plan.w.band||q.type!==plan.type||
  !isLearningTarget(q.w.w,q.w.cat,q.w.band)||q.taskDemand!==plan.taskDemand||q.needsCard||q.learningCard)return false;
 if(sentenceUseQuestionValid(q,plan))return true;
 // Immutable authored passages remain valid for their committed target while
 // the learner's level moves. Generated passages retain the reader-level guard.
 if((plan.realtimeLevelPolicy===REALTIME_LEVEL_POLICY||isCoveragePlan(plan))&&authoredQuestionValid(q,account)&&Number(q.bankSupportLevel||0)>=Number(plan.supportLevel||0))return true;
 if(!Number.isFinite(q.bankReaderLevel)||Math.abs(q.bankReaderLevel-Number(level))>.35||Number(q.bankSupportLevel||0)<Number(plan.supportLevel||0))return false;
 if(authoredQuestionValid(q,account))return true;
 const v=q.validation;
 return v?.policy===QUESTION_POLICY&&v.deterministic===true&&v.aiVerified===true&&v.checks?.coherentSituation===true&&v.checks?.vocabularyFocus===true&&v.checks?.levelDemandFit===true&&
  (!q.type.startsWith('mc_')||q.opts?.length===5&&q.opts.filter(o=>o.ok).length===1&&(plan.taskDemand!=='advanced'||v.checks.semanticContrast===true));
}
export function localSentenceQuestion(plan){
 const raw=sentenceUseQuestion({id:plan.id,type:'subjective_use',word:plan.w?.w,definition:plan.w?.d,band:plan.w?.band,domain:plan.w?.cat,needsCard:plan.needsCard});
 if(!raw)return null;
 return {w:plan.w,type:raw.type,stage:'use',taskDemand:plan.taskDemand,needsCard:false,practiceOnly:!!plan.practiceOnly,review:!!plan.review,remedial:!!plan.remedial,
  learningCard:null,answerForm:raw.answerForm,label:'내 문장 만들기',q:raw.prompt,ctx:'',showTarget:true,open:true,hideWord:false,opts:[],acceptedAnswers:[],
  hints:raw.hints,feedbackCorrect:raw.feedbackCorrect,signature:raw.signature,validation:raw.validation,authored:null,semanticGraderRequired:true,allowNaturalDerivations:[]};
}
export function localPracticeQuestion(plan,learner,pool=[],ready=[],account=null){
 if(plan.needsCard||plan.firstLearning)return null;
 if(plan.type==='subjective_use')return localSentenceQuestion(plan);
 const st=learner.words?.[plan.w.w]||{},related=ready.filter(q=>q.w?.w===plan.w.w);
 const history=st.problemHistory||[];
 const used=new Set([...(st.usedPassageKeys||[]),...history.flatMap(h=>deliveryPassageKeys(h.context,h.options||[])),...related.flatMap(q=>deliveryPassageKeys(q.ctx,(q.opts||[]).map(o=>o.t)))]);
 const signatures=new Set([...history.map(h=>h.signature),...related.map(q=>q.signature)].filter(Boolean));
 const normalize=text=>String(text||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
 const contexts=new Set([...history.map(h=>h.context),...related.map(q=>q.ctx)].map(normalize).filter(Boolean));
 const types=[plan.type,...(plan.type!=='subjective_recall'&&plan.allowBankTypeFallback===true?practiceTypes.filter(t=>t!==plan.type):[])];
 for(const type of types){
  const trial={...plan,type};
  const found=pool.find(q=>deliveryQuestionValid(q,trial,learner.difficulty,account)&&!signatures.has(q.signature)&&!contexts.has(normalize(q.ctx))&&!deliveryPassageKeys(q.ctx,(q.opts||[]).map(o=>o.t)).some(k=>used.has(k)));
  if(!found)continue;
  const q=structuredClone(found);q.w=plan.w;q.stage=type==='subjective_recall'?'check':'bridge';q.practiceOnly=!!plan.practiceOnly;q.review=!!plan.review;q.remedial=!!plan.remedial;
  if(q.opts.length){const at=q.opts.findIndex(o=>o.ok),[correct]=q.opts.splice(at,1);q.opts.splice(Math.max(0,Math.min(4,plan.answerSlot||0)),0,correct)}
  if(type!==plan.type)q.bankFallbackFrom=plan.type;
  return q;
 }
 if(plan.type==='subjective_recall'&&plan.review){
  const raw=sentenceUseQuestion({id:plan.id,type:plan.type,review:true,word:plan.w.w,definition:plan.w.d,band:plan.w.band,domain:plan.w.cat,needsCard:false});
  if(raw)return {w:plan.w,type:raw.type,stage:'check',taskDemand:plan.taskDemand,needsCard:false,practiceOnly:!!plan.practiceOnly,review:true,learningCard:null,answerForm:raw.answerForm,label:'뜻 보고 떠올리기',q:raw.prompt,ctx:'',showTarget:false,open:true,hideWord:true,opts:[],acceptedAnswers:raw.acceptedAnswers,hints:raw.hints,feedbackCorrect:raw.feedbackCorrect,signature:raw.signature,validation:raw.validation};
 }
 // Finite bank passages never repeat. Productive use remains available without
 // generation; its instruction contains no example and still needs real grading.
 if(plan.allowBankTypeFallback===true){const q=localSentenceQuestion({...plan,type:'subjective_use'});if(q)q.bankFallbackFrom=plan.type;return q}
 return null;
}

