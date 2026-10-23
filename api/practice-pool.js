import {offlineAuthoredEntry as authoredEntry} from '../lib/server/offline-bank-runtime.js';
import {authoredCurriculum} from './authored-bank.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {OFFLINE_ROWS} from '../lib/server/offline-bank-runtime.js';
import {authoredQuestionValid} from '../lib/authored-policy.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {DELIVERY_POLICY,localSentenceQuestion} from '../lib/local-delivery.js';

// A failed sentence must always have a reviewed multiple-choice bridge available.
// Novel variants are preferred; exhausting history must never remove that bridge.
export function approvedRemediation(plan,learner,account){
 if(!['mc_context','mc_usage'].includes(plan.type)||!plan.review||plan.firstLearning||plan.needsCard)return null;
 const row=[...authoredCurriculum(AUTHORED_OWNER),...OFFLINE_ROWS].find(r=>r.word===plan.w.w&&r.definition===plan.w.d&&r.band===plan.w.band);
 if(!row)return null;
 const clean={...learner,words:{...learner.words,[plan.w.w]:{}}};
 const entry=authoredEntry({...plan,supportLevel:3},clean,account,[]);
 return entry&&authoredQuestionValid(entry.question,account)?{...entry.question,repeatedRemediation:true}:null;
}
// Carry fresh alternatives with the lesson; no paid generation after an error.
export function bundlePractice(payload,learner,account,entries=[],reserved=[]){
 const pool=[],base=(payload.ready||[]).map(([,q])=>q),seen=new Set();
 for(const p of payload.plans){
  if(seen.has(p.w.w))continue;seen.add(p.w.w);
  const common={...p,firstLearning:false,needsCard:false,review:true,practiceOnly:true,taskDemand:p.taskDemand==='initial-practice'?'standard':p.taskDemand};
  for(const type of ['mc_context','mc_usage','subjective_recall'])for(let slot=0;slot<3;slot++){
   const plan={...common,id:'pool:'+p.w.w+':'+type+':'+slot,type,stage:type==='subjective_recall'?'check':'bridge'};
   const held=[...reserved,...base,...pool];
   const authored=authoredEntry({...plan,supportLevel:3},learner,account,held);
   const trial={account,plans:[plan],ready:[]};
   if(!hydrateFromBank(trial,learner,[...(authored?[authored]:[]),...entries],held))break;
   pool.push(trial.ready[0][1]);
  }
  if(!pool.some(q=>q.w.w===p.w.w&&q.type.startsWith('mc_'))){
   const fallback=approvedRemediation({...common,type:'mc_usage',stage:'bridge'},learner,account)
    ||approvedRemediation({...common,type:'mc_context',stage:'bridge'},learner,account);
   if(fallback)pool.push(fallback);
  }
  const own=localSentenceQuestion({...common,type:'subjective_use'});if(own)pool.push(own);
 }
 payload.practicePool=pool;payload.deliveryPolicy=DELIVERY_POLICY;
 return payload;
}
export default function handler(req,res){return res.status(404).json({error:'Not found'})}
