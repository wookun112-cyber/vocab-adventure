import assert from 'node:assert/strict';
import {correctCooldownUntil,wordOnCooldown,applyCorrectCooldown,learningDay,dateAfter,SENTENCE_CYCLE_POLICY} from '../lib/learning-model.js';
import {buildDailyPlan,nextUsagePlan,usageCompleted} from '../lib/daily-practice.js';
const day=learningDay(),word={w:'의견',d:'어떤 일에 대한 생각',band:2,cat:'국어'};
const learner={difficulty:2,words:{의견:{seen:3,days:[day]}}};
assert.equal(correctCooldownUntil(learner,'의견'),null,'recognition alone never starts sentence cooldown');
const plan=buildDailyPlan([word],[],()=>({}),2,{sentenceCycle:true})[0];
assert.equal(plan.type,'subjective_use');assert.equal(plan.needsCard,false);
const results=[];let current=plan;
for(const [type,credit,next] of [['subjective_use',0,'mc_usage'],['mc_usage',0,'mc_usage'],['mc_usage',1,'subjective_use'],['subjective_use',1,null]]){
 assert.equal(current.type,type);results.push({word:word.w,type,credit,contextSuccess:!!credit});current=nextUsagePlan(plan,results,results.length);assert.equal(current?.type||null,next);
}
assert.ok(usageCompleted(results).has(word.w));
const st={};let n=0;
const grade=(at,credit,extra={})=>applyCorrectCooldown(st,{type:'subjective_use',credit,contextSuccess:!!credit,gradingJobId:String(++n),...extra},at);
grade(day,1);assert.equal(st.sentenceReviewDue,dateAfter(day,7));
assert.equal(wordOnCooldown({words:{의견:st}},'의견',dateAfter(day,6)),true);
assert.equal(wordOnCooldown({words:{의견:st}},'의견',dateAfter(day,7)),false);
grade(dateAfter(day,7),1);assert.equal(st.sentenceReviewDue,dateAfter(day,37));
grade(dateAfter(day,37),0);assert.equal(st.sentenceReviewStage,'learning');assert.equal(st.sentenceReviewDue,null);
applyCorrectCooldown(st,{type:'mc_usage',credit:1,contextSuccess:true},dateAfter(day,37));assert.equal(st.sentenceReviewDue,null);
grade(dateAfter(day,37),1);assert.equal(st.sentenceReviewDue,dateAfter(day,44));
const frozen=JSON.stringify(st);applyCorrectCooldown(st,{type:'subjective_use',credit:1,contextSuccess:true,gradingJobId:String(n)},dateAfter(day,37));assert.equal(JSON.stringify(st),frozen);
grade(day,0);assert.equal(JSON.stringify(st),frozen,'old results never regress newer cycle');
for(const flags of [{hintUsed:true},{revealed:true},{copiedExample:true}]){const s={};applyCorrectCooldown(s,{type:'subjective_use',credit:1,contextSuccess:true,...flags},day);assert.equal(s.sentenceReviewDue,null)}
assert.equal(correctCooldownUntil({words:{},learningEvidence:[{word:'의견',kind:'use',date:day,success:true}]},'의견'),dateAfter(day,7));
assert.ok(plan.sentenceCyclePolicy===SENTENCE_CYCLE_POLICY);
console.log('Sentence cycle PASS: sentence-first, wrong→MC, MC success→sentence, sentence-only completion, 7→30 days, lapse→relearn→7, hints, legacy evidence, stale and duplicate results.');
