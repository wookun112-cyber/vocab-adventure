import assert from 'node:assert/strict';
import {makePreparedPlan,learnerSnapshot,passageKeys} from '../lib/prepared-plan.js';
import {prepare} from '../api/prepare-worker.js';
const learner={difficulty:2,levelTestCompleted:false,words:{},recentProblems:[]};
const before=JSON.stringify(learner);
const curriculum=Array.from({length:30},(_,i)=>({word:'어휘'+i,definition:'상황의 뜻을 나타내는 말',band:2,domain:'국어',example:''}));
const job={id:'test',lease:'lease',account:'family',profile:'inseong',learner,curriculum,catalog:{}};
const plan=makePreparedPlan(learner,{},curriculum,'family','inseong');
assert.equal(plan.plans.length,20);
assert.equal(plan.plans.filter(p=>p.type.startsWith('mc_')).length,10);
assert.equal(new Set(plan.plans.map(p=>p.type)).size,4);
assert.equal(plan.snapshot,learnerSnapshot(learner));
assert.equal(JSON.stringify(learner),before);
for(const word of plan.newWords){
 const seeds=plan.plans.filter(p=>p.w.w===word).map(p=>p.contextSeed);
 assert.equal(new Set(seeds).size,seeds.length);
}
const guestLearner={...learner,difficulty:7.4};
const guestCurriculum=curriculum.map(w=>({...w,band:7}));
const guestPlan=makePreparedPlan(guestLearner,{},guestCurriculum,'family','guest');
assert.equal(guestPlan.profile,'guest');
assert.equal(guestPlan.difficulty,7.4);
assert.equal(guestPlan.snapshot,learnerSnapshot(guestLearner));
assert.equal(guestPlan.plans.length,20);
assert.ok(guestPlan.plans.some(p=>p.w.band===7));
let inFlight=0,maxFlight=0,calls=0;
const answer=item=>({id:item.id,type:item.type,prompt:'빈칸을 채우세요.',context:'탐험'+item.id+'의 기록을 다시 살펴본 뒤 탐험'+item.id+'의 ＿＿＿＿를 찾았어요.',options:[],acceptedAnswers:[],hints:[],feedbackCorrect:'좋아요.',signature:'새로운 상황'+item.id,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}});
const generate=async items=>{
 inFlight++;maxFlight=Math.max(maxFlight,inFlight);calls++;
 await new Promise(r=>setTimeout(r,0));inFlight--;
 return items.map(answer);
};
const checkpoints=[];
const store=async(name,args)=>{assert.equal(name,'save_preparation');checkpoints.push(structuredClone(args));return true};
const ready=await prepare(job,'key',generate,store);
assert.equal(ready.ready.length,20);
assert.equal(maxFlight,3);
assert.equal(calls,5);
assert.equal(JSON.stringify(learner),before);
assert.equal(checkpoints.at(-1).p_payload.ready.length,20);
assert.ok(checkpoints.every(c=>!c.p_failed));
// Ready output resumes without any AI call; partial output generates only missing indices.
calls=0;
await prepare({...job,payload:ready},'key',generate,store);
assert.equal(calls,0);
const partial={...ready,ready:ready.ready.slice(0,8)};
const resumed=await prepare({...job,payload:partial},'key',generate,store);
assert.equal(resumed.ready.length,20);
assert.equal(calls,3);
// A single rejected question does not discard the three validated peers.
await assert.rejects(prepare(job,'key',async items=>items.filter(i=>i.id!=='2').map(answer),store),/Incomplete validated preparation/);
const almostReady=checkpoints.at(-1).p_payload;
assert.equal(almostReady.ready.length,19);
let retriedIds=[];
const completed=await prepare({...job,payload:almostReady},'key',async items=>{retriedIds=items.map(i=>i.id);return items.map(answer)},store);
assert.deepEqual(retriedIds,['2']);
assert.equal(completed.ready.length,20);
// One failed group leaves good peer groups durable and marks the job retryable.
let failed=false;
const failOnce=async items=>{if(!failed){failed=true;throw Error('Temporary AI failure')}return generate(items)};
await assert.rejects(prepare(job,'key',failOnce,store),/Temporary AI failure/);
const failedSave=checkpoints.at(-1);
assert.equal(failedSave.p_failed,true);
assert.ok(failedSave.p_payload.ready.length>0&&failedSave.p_payload.ready.length<20);
// A stale lease cannot overwrite a newer lesson.
let staleCalls=0;
await assert.rejects(prepare(job,'key',async()=>{staleCalls++;return []},async()=>false),/superseded/);
assert.equal(staleCalls,0);
// Parallel responses are checked against other completed groups before publication.
const repeated=async items=>items.map(item=>({...answer(item),context:'오늘 도서관에서 같은 자료를 살펴보고 생각을 뒷받침하는 ＿＿＿＿를 찾았어요.'}));
await assert.rejects(prepare(job,'key',repeated,store),/Repeated sentence/);
const withheld=checkpoints.at(-1).p_payload;
for(const word of withheld.newWords){
 const seen=new Set();
 for(const [,q] of withheld.ready.filter(([,q])=>q.w.w===word)){
  for(const key of passageKeys(q.ctx,q.opts.map(o=>o.t))){assert.ok(!seen.has(key));seen.add(key)}
 }
}
console.log('Server preparation verified: personalized 20-question plans, 50:50 mix, three parallel groups, durable checkpoints, resume without regeneration, bounded duplicate rejection, stale-lease protection, unchanged records.');

// Recovery preserves original plans and accepted peers even after an answer
// changes the learner snapshot. It must not create an unrelated new lesson.
const interruptedLearner={...learner,difficulty:3.2,activeLesson:{id:'paused-lesson'},words:{'근거':{seen:1,correct:1,wrong:0,streak:1}}};
const interrupted={...ready,resumeId:'paused-lesson',ready:ready.ready.slice(0,8),snapshot:'before-answer'};
const frozenPlans=JSON.stringify(interrupted.plans),firstEight=JSON.stringify(interrupted.ready);
let recoveryIds=[];
const repaired=await prepare({...job,learner:interruptedLearner,payload:interrupted},'key',async items=>{recoveryIds.push(...items.map(i=>i.id));return items.map(answer)},store);
assert.equal(JSON.stringify(repaired.plans),frozenPlans);
assert.equal(JSON.stringify(repaired.ready.slice(0,8)),firstEight);
assert.equal(repaired.ready.length,20);
assert.equal(recoveryIds.length,12);assert.ok(recoveryIds.every(id=>Number(id)>=8));
assert.equal(repaired.snapshot,learnerSnapshot(interruptedLearner));
console.log('Recovery worker verified: original plans and eight accepted questions retained across changed progress; only twelve missing IDs generated.');
