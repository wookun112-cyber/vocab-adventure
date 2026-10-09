import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REVIEW_POLICY,selectLevelReviews,confirmedReviewWeakness,confirmedLowerReviewWeakness,lowerReviewFloor,inReviewBand,reviewFloor,targetBandRange,updateLearningLevels,calibratedWord,isLearningTarget} from '../lib/learning-model.js';
import {DAILY_POLICY,applyPendingReviewPolicy,buildDailyPlan,usageLessonComplete} from '../lib/daily-practice.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
import {prepare,reviewSupply} from '../api/prepare-worker.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const word=(w,band)=>({w,band,d:'문맥에서 배우는 독립 어휘',cat:'국어'}),near=Array.from({length:6},(_,i)=>word('심화어'+i,7)),low=Array.from({length:30},(_,i)=>word('기초어'+i,1)),future=word('상위어',9);
const day='2026-10-09',moderate=word('뜻회상약점',5);
const meaningErrors=(w,dates=['2026-10-06','2026-10-07'])=>dates.map(date=>({word:w,date,kind:'recall',success:false,firstAttempt:true,independent:false}));
const learner={difficulty:7.4,words:Object.fromEntries([...near,...low,moderate,future].map(w=>[w.w,{seen:3,wrong:w.band<7?4:0,streak:0,nextReviewAt:'2026-01-01'}])),learningEvidence:[...meaningErrors(moderate.w),...meaningErrors(low[0].w)]};
const original=JSON.stringify(learner),selected=selectLevelReviews([...low,...near,moderate,future],learner,20,day,{available:new Set(low.map(w=>w.w))});
assert.equal(selected.filter(w=>w.band===7).length,6);assert.equal(selected.filter(w=>w.band===5).length,1);assert.ok(selected.every(w=>w.band>=5));assert.ok(!selected.includes(future));assert.equal(JSON.stringify(learner),original);
assert.equal(selectLevelReviews(low,{...learner,words:Object.fromEntries(low.map(w=>[w.w,{seen:1,wrong:0,streak:0}]))},20).length,0);
assert.equal(selectLevelReviews(low,learner,20).length,0,'near zero never backfills easy words');
assert.equal(confirmedReviewWeakness({wrong:8,streak:0},{activeLesson:{results:[{word:'기초어0',type:'subjective_use',credit:1,contextSuccess:true}]}},'기초어0'),false);
assert.equal(confirmedReviewWeakness({assisted:1,streak:0},{},'기초어0'),true);
assert.equal(confirmedReviewWeakness({wrong:0,streak:0},{},'기초어0'),false);
assert.equal(lowerReviewFloor(7.4),5);assert.equal(inReviewBand(word('아기',1),7.4),false);
const weak={seen:3,wrong:2,assisted:2,streak:0};
const evidenceLearner=learningEvidence=>({learningEvidence});
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(meaningErrors(moderate.w)),moderate.w,day),true);
assert.equal(confirmedLowerReviewWeakness(weak,{},moderate.w,day),false,'old aggregate errors alone do not prove a meaning weakness');
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(meaningErrors(moderate.w).map(e=>({...e,kind:'use'}))),moderate.w,day),false,'sentence-only partial credit is not missing vocabulary knowledge');
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(meaningErrors(moderate.w).slice(0,1)),moderate.w,day),false,'one slip does not force an easy review');
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(meaningErrors(moderate.w,['2026-10-07','2026-10-07'])),moderate.w,day),false,'same-day repetition is one check');
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(meaningErrors(moderate.w,['2026-09-01','2026-09-02'])),moderate.w,day),false,'stale failures do not dominate review');
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(meaningErrors(moderate.w).map(e=>({...e,firstAttempt:false}))),moderate.w,day),false,'feedback practice does not confirm a new weakness');
const recovered=[...meaningErrors(moderate.w),{word:moderate.w,date:'2026-10-08',kind:'recall',success:true,independent:true,firstAttempt:true}];
assert.equal(confirmedLowerReviewWeakness(weak,evidenceLearner(recovered),moderate.w,day),false,'independent recovery clears old meaning failures');
assert.equal(confirmedLowerReviewWeakness(weak,{...evidenceLearner(meaningErrors(moderate.w)),activeLesson:{results:[{word:moderate.w,type:'subjective_use',credit:1,contextSuccess:true,hintUsed:false,revealed:false}]}},moderate.w,day),false,'correct current usage clears the lower exception');
for(const difficulty of [1.7,1.8]){const w=low.slice(0,20).map((x,i)=>({...x,band:i%2?2:1}));assert.equal(selectLevelReviews(w,{difficulty,words:Object.fromEntries(w.map(x=>[x.w,{seen:1,wrong:0}]))},10).length,10)}
// Due dates and actual recent need outrank convenient bank availability.
const rankingWords=['오래된약점','최근약점','뜻만아는말','문장도아는말','아직복습전'].map(w=>word(w,7));
const rankingLearner={difficulty:7.4,words:{
 '오래된약점':{seen:3,wrong:1,streak:0,nextReviewAt:'2026-10-01'},
 '최근약점':{seen:3,wrong:99,streak:0,nextReviewAt:'2026-10-08'},
 '뜻만아는말':{seen:3,wrong:0,nextReviewAt:'2026-10-08'},
 '문장도아는말':{seen:3,wrong:0,nextReviewAt:'2026-10-08',useDays:['2026-10-01'],independentRecallDays:['2026-10-01']},
 '아직복습전':{seen:3,wrong:0,nextReviewAt:'2026-10-15'}
},learningEvidence:[{word:'문장도아는말',kind:'use',success:true,date:'2026-10-01'}]};
const ranked=selectLevelReviews(rankingWords,rankingLearner,10,'2026-10-08',{available:new Set(['문장도아는말'])});
assert.deepEqual(ranked.map(w=>w.w),['오래된약점','최근약점','뜻만아는말','문장도아는말']);
assert.equal(selectLevelReviews(rankingWords,rankingLearner,10,'2026-10-08',{includeNotDue:true}).at(-1).w,'아직복습전');
for(const difficulty of [1,1.7,2,2.5,3,3.8,4,4.9,5,5.5,6,6.9,7.4,8,8.8,9]){
 const range=targetBandRange(difficulty),pool=Array.from({length:15},(_,i)=>word('수준어'+i,range.min));
 if(range.min>1)pool.push(...Array.from({length:8},(_,i)=>word('약점어'+i,range.min-1)));
 const c={difficulty,words:Object.fromEntries(pool.map(w=>[w.w,{seen:3,wrong:2,streak:0,nextReviewAt:'2026-10-08'}])),learningEvidence:pool.flatMap(w=>meaningErrors(w.w))};
 const picked=selectLevelReviews(pool,c,30,'2026-10-08'),lower=picked.filter(w=>w.band<range.min);
 assert.equal(picked.length,10);assert.ok(lower.length<=2&&lower.length*5<=picked.length);assert.ok(lower.every(w=>w.band>=lowerReviewFloor(difficulty)));
}
const daily=buildDailyPlan([],selected,w=>learner.words[w],7.4);assert.equal(daily.filter(p=>p.w.band===5).length,1);assert.ok(daily.filter(p=>p.w.band===5).every(p=>p.taskDemand==='foundation-review'));assert.ok(daily.filter(p=>p.w.band===7).every(p=>p.taskDemand==='advanced'));
assert.equal(buildDailyPlan([],low,w=>learner.words[w],7.4).length,0,'plan building also refuses remote easy targets');
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
 const legacy={...saved,completionPolicy:'daily-5-new-20-review-use-unlimited-12.15',reviewPolicy:'review-window-12.16.3',deferredReview:{originalTarget:100,originalBaseWords:saved.baseWords,items:[{originalIndex:99,reason:'prior_deferred'}]}};
 const migrated=applyPendingReviewPolicy(legacy,learner);
 assert.equal(migrated.completionPolicy,DAILY_POLICY);assert.equal(migrated.reviewPolicy,REVIEW_POLICY);assert.deepEqual(migrated.results,legacy.results);assert.deepEqual(new Map(migrated.ready).get(index),ready[index][1]);assert.equal(migrated.pendingAnswer,legacy.pendingAnswer);
 assert.equal(migrated.deferredReview.items[0].reason,'prior_deferred');assert.equal(migrated.deferredReview.originalTarget,100);assert.ok(migrated.baseWords.filter(w=>!migrated.newWords.includes(w.w)).length<=10);assert.equal(applyPendingReviewPolicy(migrated,learner),migrated);
}
const authored=authoredCurriculum(AUTHORED_OWNER),simple=authored.filter(w=>w.band===1).slice(0,22),high=authored.filter(w=>calibratedWord({w:w.word,band:w.band}).band===7&&isLearningTarget(w.word,w.domain,w.band)).slice(0,6);
const beginner={difficulty:1.8,words:Object.fromEntries(simple.map(w=>[w.word,{seen:1,wrong:0,streak:0}]))};
const novice=await prepare({id:'low',account:AUTHORED_OWNER,profile:'test',learner:beginner,curriculum:[],catalog:{},kind:'reserve',slot:1},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(novice.plans.length,10);assert.equal(novice.ready.length,10);
const advanced={difficulty:7.4,words:Object.fromEntries([...simple,...high].map(w=>[w.word,{seen:1,wrong:w.band===1?2:0,streak:0}]))};
const packet=await prepare({id:'short',account:AUTHORED_OWNER,profile:'test',learner:advanced,curriculum:[],catalog:{},kind:'reserve',slot:1},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(packet.plans.length,6);assert.equal(packet.ready.length,6);assert.equal(packet.budget.reviewShortfall,4);assert.equal(packet.reserveSlot,1);assert.equal(packet.plans.filter(p=>p.w.band<7).length,0);
const empty={difficulty:7.4,words:Object.fromEntries(simple.map(w=>[w.word,{seen:1,wrong:9,streak:0}]))};
const newOnly=await prepare({id:'new',account:AUTHORED_OWNER,profile:'test',learner:empty,curriculum:[],catalog:{}},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(newOnly.newWords.length,5);assert.equal(newOnly.plans.length,5);assert.equal(newOnly.ready.length,5);assert.ok(newOnly.plans.every(p=>!p.review&&p.w.band>=7));
const zero=await prepare({id:'waiting',account:AUTHORED_OWNER,profile:'test',learner:empty,curriculum:[],catalog:{},kind:'reserve',slot:1},'local',async()=>{throw Error('Unexpected AI')},async()=>true);assert.equal(zero.plans.length,0);assert.equal(zero.budget.waitingForReviews,true);
const lowResult=updateLearningLevels({difficulty:7.4},low.map(w=>({word:w.w,band:1,credit:1,type:'subjective_use',taskDemand:'advanced',bankReaderLevel:7.4})));assert.equal(lowResult.samples,0);assert.equal(lowResult.change,0);
const sql=fs.readFileSync(new URL('../database/due-review-5-10-runtime.sql',import.meta.url),'utf8');assert.ok(sql.includes("lower_count*4<=near_count"));assert.ok(sql.includes("greatest(1,lo-2)"));assert.ok(sql.includes("lower_review_weakness"));assert.ok(sql.includes("count(distinct e->>'date')"));assert.ok(sql.includes("then 'waiting'"));assert.ok(!/update public\.app_state/i.test(sql));
console.log('Review window verified: same-level priority, nearby lower bands only, two recent meaning failures on separate days, no sentence-only/stale-error weakness, recovery, maximum two and 20%, low profiles, short/empty reserve, immutable answers/current/draft and real-band grade calculation.');

