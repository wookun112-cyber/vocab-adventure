import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REVIEW_POLICY,selectLevelReviews,confirmedReviewWeakness,reviewFloor,targetBandRange,updateLearningLevels,calibratedWord,isLearningTarget} from '../lib/learning-model.js';
import {DAILY_POLICY,applyPendingReviewPolicy,buildDailyPlan,usageLessonComplete} from '../lib/daily-practice.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
import {prepare,reviewSupply} from '../api/prepare-worker.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const word=(w,band)=>({w,band,d:'문맥에서 배우는 독립 어휘',cat:'국어'}),near=Array.from({length:6},(_,i)=>word('심화어'+i,7)),low=Array.from({length:30},(_,i)=>word('기초어'+i,1)),future=word('상위어',9);
const learner={difficulty:7.4,words:Object.fromEntries([...near,...low,future].map(w=>[w.w,{seen:3,wrong:w.band===1?4:0,streak:0,nextReviewAt:'2026-01-01'}]))};
const original=JSON.stringify(learner),selected=selectLevelReviews([...low,...near,future],learner,20,undefined,{available:new Set(low.map(w=>w.w))});
assert.equal(selected.filter(w=>w.band===7).length,6);assert.equal(selected.filter(w=>w.band===1).length,1);assert.ok(!selected.includes(future));assert.equal(JSON.stringify(learner),original);
assert.equal(selectLevelReviews(low,{...learner,words:Object.fromEntries(low.map(w=>[w.w,{seen:1,wrong:0,streak:0}]))},20).length,0);
assert.equal(selectLevelReviews(low,learner,20).length,0,'near zero never backfills easy words');
assert.equal(confirmedReviewWeakness({wrong:8,streak:0},{activeLesson:{results:[{word:'기초어0',type:'subjective_use',credit:1,contextSuccess:true}]}},'기초어0'),false);
assert.equal(confirmedReviewWeakness({assisted:1,streak:0},{},'기초어0'),true);
assert.equal(confirmedReviewWeakness({wrong:0,streak:0},{},'기초어0'),false);
for(const difficulty of [1.7,1.8]){const w=low.slice(0,20).map((x,i)=>({...x,band:i%2?2:1}));assert.equal(selectLevelReviews(w,{difficulty,words:Object.fromEntries(w.map(x=>[x.w,{seen:1,wrong:0}]))},20).length,20)}
const daily=buildDailyPlan([],selected,w=>learner.words[w],7.4);assert.ok(daily.filter(p=>p.w.band===1).every(p=>p.taskDemand==='foundation-review'));assert.ok(daily.filter(p=>p.w.band===7).every(p=>p.taskDemand==='advanced'));
const plans=Array.from({length:89},(_,i)=>{const w=i%5===0?near[i%6]:low[i%19];return {id:String(i),w,type:'subjective_use',review:true,taskDemand:'advanced'}}),ready=plans.map((p,i)=>[i,{w:p.w,type:p.type,q:'자신의 문장을 만드세요.',ctx:'',open:true,opts:[]}]);
for(const index of [0,1,19,64]){
 const saved={version:1,mode:'daily',completionPolicy:DAILY_POLICY,plans,ready,target:89,baseCount:25,baseWords:[...near,...low.slice(0,19)],newWords:[],nextIndex:index,results:Array.from({length:index},(_,i)=>({word:plans[i].w.w,credit:0,type:plans[i].type})),pendingAnswer:'입력하던 문장을 계속 씁니다.'};
 const before=JSON.stringify(saved),next=applyPendingReviewPolicy(saved,learner),map=new Map(next.ready);
 assert.equal(JSON.stringify(saved),before);assert.equal(next.nextIndex,index);assert.equal(next.pendingAnswer,saved.pendingAnswer);assert.deepEqual(next.results,saved.results);assert.deepEqual(next.plans.slice(0,index+1),saved.plans.slice(0,index+1));assert.deepEqual(map.get(index),ready[index][1]);
 assert.equal(next.baseCount,25-next.deferredReview.items.filter(p=>p.originalIndex<25).length); // IDs in suffix are renumbered; verify exact kept base below.
 assert.ok(next.baseCount<=25);assert.equal(map.size,next.plans.length);
 next.plans.forEach((p,i)=>{assert.equal(p.w.w,map.get(i).w.w);assert.equal(p.type,map.get(i).type);if(i>index)assert.equal(p.id,String(i))});
 if(plans[index].w.band===1){assert.ok(!next.baseWords.some(w=>w.w===plans[index].w.w));assert.ok(!next.plans.slice(index+1).some(p=>p.w.w===plans[index].w.w));assert.equal(next.deferredReview.carriedCurrent.oneTime,true)}
 assert.deepEqual(next.deferredReview.originalBaseWords,saved.baseWords);assert.equal(next.plans.length+next.deferredReview.items.length,saved.plans.length);assert.equal(applyPendingReviewPolicy(next,learner),next);
 const incomplete={...saved,ready:saved.ready.filter(([i])=>i!==Math.min(24,index+1))};assert.equal(applyPendingReviewPolicy(incomplete,learner),incomplete,'recover old indexes before trimming');
}
const authored=authoredCurriculum(AUTHORED_OWNER),simple=authored.filter(w=>w.band===1).slice(0,22),high=authored.filter(w=>calibratedWord({w:w.word,band:w.band}).band===7&&isLearningTarget(w.word,w.domain,w.band)).slice(0,6);
const beginner={difficulty:1.8,words:Object.fromEntries(simple.map(w=>[w.word,{seen:1,wrong:0,streak:0}]))};
const novice=await prepare({id:'low',account:AUTHORED_OWNER,profile:'test',learner:beginner,curriculum:[],catalog:{},kind:'reserve',slot:1},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(novice.plans.length,20);assert.equal(novice.ready.length,20);
const advanced={difficulty:7.4,words:Object.fromEntries([...simple,...high].map(w=>[w.word,{seen:1,wrong:w.band===1?2:0,streak:0}]))};
const packet=await prepare({id:'short',account:AUTHORED_OWNER,profile:'test',learner:advanced,curriculum:[],catalog:{},kind:'reserve',slot:1},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(packet.plans.length,7);assert.equal(packet.ready.length,7);assert.equal(packet.budget.reviewShortfall,13);assert.equal(packet.reserveSlot,1);assert.equal(packet.plans.filter(p=>p.w.band<7).length,1);
const empty={difficulty:7.4,words:Object.fromEntries(simple.map(w=>[w.word,{seen:1,wrong:9,streak:0}]))};
const newOnly=await prepare({id:'new',account:AUTHORED_OWNER,profile:'test',learner:empty,curriculum:[],catalog:{}},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(newOnly.newWords.length,5);assert.equal(newOnly.plans.length,5);assert.equal(newOnly.ready.length,5);assert.ok(newOnly.plans.every(p=>!p.review&&p.w.band>=7));
const zero=await prepare({id:'waiting',account:AUTHORED_OWNER,profile:'test',learner:empty,curriculum:[],catalog:{},kind:'reserve',slot:1},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(zero.plans.length,0);assert.equal(zero.budget.waitingForReviews,true);
const lowResult=updateLearningLevels({difficulty:7.4},low.map(w=>({word:w.w,band:1,credit:1,type:'subjective_use',taskDemand:'advanced',bankReaderLevel:7.4})));assert.equal(lowResult.samples,0);assert.equal(lowResult.change,0);
const sql=fs.readFileSync(new URL('../database/review-window-runtime.sql',import.meta.url),'utf8');assert.ok(sql.includes("lower_count*4<=near_count"));assert.ok(sql.includes("then 'waiting'"));assert.ok(!/update public\.app_state/i.test(sql));
console.log('Review window verified: same-level priority, confirmed weakness/recovery, maximum four and 20% basic reviews, no artificial 20-slot wait, low profiles, five genuine new targets, short/empty reserve, immutable prefix/current/draft/deferred checkpoint and real-band grade calculation.');
