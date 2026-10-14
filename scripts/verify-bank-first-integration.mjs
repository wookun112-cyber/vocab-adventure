import assert from 'node:assert/strict';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
import {bankCompatible} from '../lib/question-bank.js';
import {calibratedWord,reviewFloor} from '../lib/learning-model.js';
import {prepare} from '../api/prepare-worker.js';

// Use an actual committed MC bank entry, not a fabricated/AI-verified mock.
// The requested relation type is intentionally absent for this word; the
// replacement must be a validated MC usage item for the SAME target.
let fixture;
for(const row of authoredCurriculum(AUTHORED_OWNER)){
 const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,source:'fixed'});
 if(w.band<2||w.band>8)continue;
 const learner={difficulty:w.band,levelTestCompleted:true,words:{[w.w]:{seen:2,correct:1,wrong:1,streak:1,introducedAt:'2026-09-01'}}};
 const plan={id:'0',w,type:'mc_relation',review:true,firstLearning:false,needsCard:false,
  stage:'bridge',taskDemand:w.band<reviewFloor(w.band)?'foundation-review':w.band>4.5?'advanced':'standard',answerSlot:2,supportLevel:0};
 const candidate=authoredEntry({...plan,type:'mc_usage'},learner,AUTHORED_OWNER,[]);
 if(candidate&&bankCompatible(candidate,{...plan,type:'mc_usage'},learner,AUTHORED_OWNER)
    &&!authoredEntry(plan,learner,AUTHORED_OWNER,[])){fixture={row,learner,plan};break;}
}
assert.ok(fixture,'A real bank MC-usage-only target is required for the integration fixture');

const {row,learner,plan}=fixture;
const packet=makePreparedPlan(learner,{},[row],AUTHORED_OWNER,'guest',{reviewOnly:true});
packet.plans=[plan];packet.ready=[];packet.baseWords=[plan.w];packet.newWords=[];
packet.baseCount=1;packet.target=1;packet.budget.target=1;packet.budget.waitingForReviews=false;
const before=JSON.stringify(learner),originalFetch=globalThis.fetch;
let network=0,generation=0;
globalThis.fetch=async()=>{network++;throw Error('Unexpected network request')};
let output;
try{
 output=await prepare({id:'integration-fixture',kind:'reserve',slot:1,account:AUTHORED_OWNER,profile:'guest',
   lease:'local',learner,curriculum:[row],catalog:{},payload:packet},'test',
  async()=>{generation++;throw Error('No generated question allowed')},
  async(name,args)=>{assert.equal(name,'save_reserve_preparation');return true;});
}finally{globalThis.fetch=originalFetch}
assert.equal(generation,0,'no generation needed after finding archived alternative');
assert.equal(network,0,'no network requests for offline preparation');
assert.equal(output.plans.length,1);
assert.equal(output.plans[0].w.w,row.word);
assert.equal(output.plans[0].type,'mc_usage');
assert.equal(output.ready.length,1);
assert.equal(output.ready[0][1].type,'mc_usage');
assert.equal(output.ready[0][1].w.w,row.word);
assert.ok(output.ready[0][1].validation?.source==='authored_bank');
assert.equal(JSON.stringify(learner),before,'existing learner records remain untouched');
console.log('Real authored-bank preparation integration passed: MC fallback, zero generated/network calls, unchanged learner records.');
