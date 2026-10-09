import {authoredEntry} from './authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {DELIVERY_POLICY,localSentenceQuestion} from '../lib/local-delivery.js';

// Carry every fresh alternative with the lesson, rather than fetching after an
// incorrect answer. The immutable bank stays on the server.
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
  const own=localSentenceQuestion({...common,type:'subjective_use'});if(own)pool.push(own);
 }
 payload.practicePool=pool;payload.deliveryPolicy=DELIVERY_POLICY;
 return payload;
}
export default function handler(req,res){return res.status(404).json({error:'Not found'})}
