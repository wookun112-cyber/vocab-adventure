import {createHash} from 'node:crypto';
import {isLearningTarget,calibratedWord,inTargetBand,isCoveragePlan} from '../learning-model.js';
import {offlineAuthoredEntry as authoredEntry} from './offline-bank-runtime.js';
import {OFFLINE_BANK_REVISION} from './offline-bank-supplement.js';
import {hydrateFromBank} from '../question-bank.js';
import {sentenceUseQuestion} from '../sentence-use-template.js';
import {generationItems,browserQuestion} from '../prepared-plan.js';

export const BANK_COST_POLICY='offline-authoring-bank-only-12.16.27';
// No environment flag or HTTP body can enable a paid provider on this path.
export async function templateOnlyQuestions(items){
 const result=[],missing=[];
 for(const item of items){const q=sentenceUseQuestion(item);if(q)result.push(q);else missing.push({id:item.id,issues:['offline_bank_supply_required']})}
 result.failed=missing;return result;
}
export function supplyRequest(plan,reason='no_compatible_reviewed_question'){
 const spec={word:plan.w.w,definition:plan.w.d,band:Number(plan.w.band),type:plan.type,taskDemand:plan.taskDemand||'standard',needsCard:!!plan.needsCard};
 const key=createHash('sha256').update(JSON.stringify([BANK_COST_POLICY,...Object.values(spec),Number(plan.supportLevel)||0])).digest('hex');
 return {key,...spec,reason};
}
export function deduplicateSupplyRequests(requests){
 return [...new Map(requests.map(r=>[r.key,r])).values()].slice(0,30);
}
export function storedQuestion(plan,job,ready=[]){
 const held=[...(job.reserved||[]),...ready];
 const authored=authoredEntry(plan,job.learner,job.account,held);
 const packet={account:job.account,plans:[plan],ready:[]};
 hydrateFromBank(packet,job.learner,[...(authored?[authored]:[]),...(job.bank||[])],held);
 if(packet.ready.length)return packet.ready[0][1];
 const raw=sentenceUseQuestion(generationItems([plan],job.learner,ready.map((q,i)=>[i,q]))[0]);
 return raw?browserQuestion(raw,plan):null;
}
// Re-select ONLY a not-yet-started ordinary NEW target, at the same vocabulary
// band and with the SAME task/card requirements. Due reviews, lower-stage
// coverage targets, answered questions and interrupted lessons never move.
export function preflightNewTargets(payload,job,curriculum){
 const ready=new Map(payload.ready||[]);
 // Fill a genuinely missing exact task with an already registered supplement.
 // Never overwrite an existing ready question, answer or submitted draft.
 for(const [index,plan] of payload.plans.entries()){
  if(ready.has(index))continue;
  const entry=authoredEntry(plan,job.learner,job.account,[...(job.reserved||[]),...ready.values()]);
  if(entry?.question?.authored?.revision===OFFLINE_BANK_REVISION)ready.set(index,entry.question);
 }
 payload.ready=[...ready].sort(([a],[b])=>a-b);
 if(payload.resumeId)return {replacements:0,requests:[]};
 const held=new Set(payload.plans.map(p=>p.w.w));
 const candidates=[...new Map(curriculum.map(row=>[row.word,row])).values()].map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,example:row.example||'',source:'fixed'})).filter(w=>isLearningTarget(w.w,w.cat,w.band)).sort((a,b)=>a.band-b.band||a.w.localeCompare(b.w,'ko'));
 const requests=[];let replacements=0;
 for(const [index,plan] of payload.plans.entries()){
  if(ready.has(index)||plan.review||isCoveragePlan(plan)||!plan.firstLearning)continue;
  const state=job.learner.words?.[plan.w.w]||{};
  if(state.seen||state.introducedAt||storedQuestion(plan,job,[...ready.values()]))continue;
  requests.push(supplyRequest(plan,'new_target_preflight_miss'));
  for(const w of candidates){
   const st=job.learner.words?.[w.w]||{};
   if(w.band!==plan.w.band||held.has(w.w)||st.seen||st.introducedAt||!inTargetBand(w,job.learner.difficulty))continue;
   const trial={...plan,w};
   if(!storedQuestion(trial,job,[...ready.values()]))continue;
   const old=plan.w.w;
   payload.plans[index]=trial;
   payload.baseWords=payload.baseWords.map(item=>item.w===old?w:item);
   payload.newWords=payload.newWords.map(word=>word===old?w.w:word);
   held.delete(old);held.add(w.w);replacements++;break;
  }
 }
 return {replacements,requests};
}
