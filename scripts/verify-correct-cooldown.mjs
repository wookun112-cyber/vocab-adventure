import assert from 'node:assert/strict';
import {correctCooldownUntil,wordOnCooldown,applyCorrectCooldown,selectDailyTargets,selectLevelReviews,learningDay,dateAfter,CORRECT_COOLDOWN_POLICY} from '../lib/learning-model.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const day=learningDay(),word={w:'의견',d:'어떤 일에 대한 생각',band:2,cat:'국어'};
const learner={difficulty:2,words:{의견:{seen:3,days:[day],nextReviewAt:day}},unfinishedUsage:{의견:{word,day:dateAfter(day,-1),assignedAt:Date.now()-86400000}}};
const before=JSON.stringify(learner);
assert.equal(correctCooldownUntil(learner,'의견'),dateAfter(day,7));
for(let gap=0;gap<7;gap++){
 const at=dateAfter(day,gap);assert.equal(wordOnCooldown(learner,'의견',at),true);
 assert.equal(selectLevelReviews([word],learner,10,at,{includeNotDue:true}).length,0,'extra rounds cannot override the seven-day floor');
 assert.ok(!selectDailyTargets([word],learner,at,{includeNotDue:true}).reviewWords.some(w=>w.w==='의견'),'unfinished carryover cannot override success');
}
assert.equal(wordOnCooldown(learner,'의견',dateAfter(day,7)),false);
assert.equal(selectLevelReviews([word],learner,10,dateAfter(day,7)).length,1);
assert.equal(JSON.stringify(learner),before,'eligibility checks never rewrite old answers');
const fresh={lastExposureAt:day};applyCorrectCooldown(fresh,{credit:1,contextSuccess:true},day);
assert.equal(fresh.lastCorrectAt,day);assert.equal(fresh.nextReviewAt,dateAfter(day,7));
fresh.nextReviewAt=dateAfter(day,30);applyCorrectCooldown(fresh,{credit:1,contextSuccess:true},day);assert.equal(fresh.nextReviewAt,dateAfter(day,30));
for(const bad of [{credit:undefined},{credit:null},{credit:0},{credit:.75},{hintUsed:true},{revealed:true},{copiedExample:true},{gradingPending:true}]){
 const st={};applyCorrectCooldown(st,{credit:1,contextSuccess:true,...bad},day);assert.equal(st.lastCorrectAt,undefined);
}
assert.equal(wordOnCooldown({words:{},learningEvidence:[{word:'의견',date:day,success:true}]},'의견',day),true,'legacy successful evidence is honored');
const packet=makePreparedPlan(learner,{},[],AUTHORED_OWNER,'ayoung');
assert.equal(packet.cooldownPolicy,CORRECT_COOLDOWN_POLICY);assert.ok(packet.snapshot.includes(CORRECT_COOLDOWN_POLICY));
assert.ok(packet.plans.every(p=>p.w.w!=='의견'),'worker plans honor the same exclusion');
console.log('Seven-day cooldown PASS: days 0–6 excluded, day 7 eligible, extra/unfinished overrides blocked, legacy evidence, hint/error/pending isolation, long schedule preserved and worker snapshot compatibility.');
