import {QUESTION_POLICY,isLearningTarget,vocabularyBand} from './learning-model.js';
import {passageKeys} from './prepared-plan.js';
import {authoredQuestionValid} from './authored-policy.js';

export function bankCompatible(entry,plan,learner,account=null){
 const q=entry?.question||entry;
 const level=Number(entry?.readerLevel??q?.bankReaderLevel);
 const scaffold=Number(entry?.supportLevel??q?.bankSupportLevel??0);
 if(authoredQuestionValid(q,account))return q.type===plan.type&&q.w.w===plan.w.w&&q.w.d===plan.w.d&&vocabularyBand(q.w)===Number(plan.w.band)&&isLearningTarget(q.w.w,q.w.cat,q.w.band)&&q.taskDemand===plan.taskDemand&&Number.isFinite(level)&&Math.abs(level-Number(learner.difficulty))<=.35&&scaffold>=(plan.supportLevel||0)&&(!plan.needsCard||!!q.learningCard?.example);
 return !!q&&q.type===plan.type&&q.w?.w===plan.w.w&&q.w.d===plan.w.d&&vocabularyBand(q.w)===Number(plan.w.band)&&
  isLearningTarget(q.w.w,q.w.cat,q.w.band)&&q.validation?.policy===QUESTION_POLICY&&
  q.validation?.deterministic===true&&q.validation?.aiVerified===true&&q.validation?.checks?.coherentSituation===true&&q.validation?.checks?.vocabularyFocus===true&&q.validation?.checks?.levelDemandFit===true&&q.taskDemand===plan.taskDemand&&
  (!(plan.type.startsWith('mc_')&&plan.taskDemand==='advanced')||q.validation.checks.semanticContrast===true)&&
  Number.isFinite(level)&&Math.abs(level-Number(learner.difficulty))<=.35&&scaffold>=(plan.supportLevel||0)&&
  (!plan.needsCard||!!q.learningCard?.example);
}
export function hydrateFromBank(payload,learner,entries=[],reserved=[]){
 const ready=new Map(payload.ready||[]);let hits=0;
 for(const [index,plan] of payload.plans.entries()){
  if(ready.has(index))continue;
  const related=[...ready.values(),...reserved].filter(q=>q.w?.w===plan.w.w);
  const used=new Set([...(learner.words?.[plan.w.w]?.usedPassageKeys||[]),
   ...(learner.words?.[plan.w.w]?.problemHistory||[]).flatMap(h=>passageKeys(h.context,h.options||[])),
   ...related.flatMap(q=>passageKeys(q.ctx,(q.opts||[]).map(o=>o.t)))]);
  const entry=entries.find(e=>bankCompatible(e,plan,learner,payload.account)&&!passageKeys((e.question||e).ctx,((e.question||e).opts||[]).map(o=>o.t)).some(k=>used.has(k)));
  if(!entry)continue;
  const candidate=structuredClone(entry.question||entry);
  candidate.w=plan.w;candidate.stage=plan.stage;candidate.needsCard=!!plan.needsCard;candidate.practiceOnly=!!plan.practiceOnly;
  if(!plan.needsCard)candidate.learningCard=null;
  // Reordering retains the independently verified texts and correct marker.
  if(candidate.opts?.length){const correct=candidate.opts.findIndex(o=>o.ok);const shift=(plan.answerSlot-correct+candidate.opts.length)%candidate.opts.length;candidate.opts=candidate.opts.map((_,i)=>candidate.opts[(i-shift+candidate.opts.length)%candidate.opts.length]);}
  ready.set(index,candidate);hits++;
 }
 payload.ready=[...ready].sort(([a],[b])=>a-b);payload.bankHits=(payload.bankHits||0)+hits;
 return hits;
}

export function withReservedHistory(learner,reserved=[]){
 if(!reserved.length)return learner;
 const copy=structuredClone(learner);copy.words=copy.words||{};
 for(const q of reserved){if(!q?.w?.w)continue;const st=copy.words[q.w.w]||(copy.words[q.w.w]={});
  st.usedPassageKeys=[...new Set([...(st.usedPassageKeys||[]),...passageKeys(q.ctx,(q.opts||[]).map(o=>o.t))])];
  st.problemHistory=[...(st.problemHistory||[]),{context:q.ctx,options:(q.opts||[]).map(o=>o.t)}].slice(-12);
 }
 return copy;
}
