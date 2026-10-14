import assert from 'node:assert/strict';
import {makePreparedPlan,learnerSnapshot,passageKeys} from '../lib/prepared-plan.js';
import {prepare} from '../api/prepare-worker.js';
import {CONTEXT_ONLY_EXPRESSIONS,isLearningTarget} from '../lib/learning-model.js';
const learner={difficulty:2,levelTestCompleted:false,words:Object.fromEntries(Array.from({length:20},(_,i)=>['복습기존'+i,{seen:1,wrong:1,correct:0,streak:0,introducedAt:'2026-09-01'}])),recentProblems:[]};
const before=JSON.stringify(learner);
const curriculum=[...Array.from({length:30},(_,i)=>({word:'어휘'+i,definition:'상황의 뜻을 나타내는 말',band:2,domain:'국어',example:''})),...Array.from({length:20},(_,i)=>({word:'복습기존'+i,definition:'이미 학습한 말의 뜻',band:2,domain:'국어'}))];
const job={id:'test',lease:'lease',account:'family',profile:'inseong',learner,curriculum,catalog:{}};
const plan=makePreparedPlan(learner,{},curriculum,'family','inseong');
assert.equal(plan.plans.length,15);
assert.equal(plan.target,15);assert.equal(plan.newWords.length,5);assert.ok(plan.plans.some(p=>p.type==='subjective_use'));
assert.ok(new Set(plan.plans.map(p=>p.type)).size>=3);
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
assert.equal(guestPlan.plans.length,15);
assert.ok(guestPlan.plans.some(p=>p.w.band===7));
let inFlight=0,maxFlight=0,calls=0;
const answer=item=>({id:item.id,type:item.type,learningCard:{definition:item.definition,example:'이 어휘를 자연스러운 새 예문에 사용했어요.',nonExample:'다른 상황에서는 쓰지 않아요.',structureNote:''},prompt:'빈칸을 채우세요.',context:'탐험'+item.id+'의 기록을 다시 살펴본 뒤 탐험'+item.id+'의 ＿＿＿＿를 찾았어요.',options:[],acceptedAnswers:[],hints:[],feedbackCorrect:'좋아요.',signature:'새로운 상황'+item.id,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true,levelDemandFit:true}}});
const generate=async items=>{
 inFlight++;maxFlight=Math.max(maxFlight,inFlight);calls++;
 await new Promise(r=>setTimeout(r,0));inFlight--;
 return items.map(answer);
};
const checkpoints=[];
const store=async(name,args)=>{assert.equal(name,'save_preparation');checkpoints.push(structuredClone(args));return true};
const ready=await prepare(job,'key',generate,store);
assert.equal(ready.ready.length,15);
assert.equal(maxFlight,2);
assert.equal(calls,2,'legacy reviews are immediately available; only five new-word cards need background generation');
assert.equal(JSON.stringify(learner),before);
assert.equal(checkpoints.at(-1).p_payload.ready.length,15);
assert.ok(checkpoints.every(c=>!c.p_failed));
// Repair rejected IDs inside the same run instead of waiting another cron cycle.
let rejectedOnce=false,repairIds=[];
const immediate=await prepare(job,'key',async items=>{
 repairIds.push(items.map(x=>x.id));
 if(items.some(x=>x.id==='4')&&!rejectedOnce){rejectedOnce=true;const out=items.filter(x=>x.id!=='4').map(answer);out.failed=[{id:'4',issues:['coherentSituation']}];return out}
 return items.map(answer);
},store);
assert.equal(immediate.ready.length,15);assert.ok(repairIds.some(ids=>ids.length===1&&ids[0]==='4'));
// Ready output resumes without any AI call; partial output generates only missing indices.
calls=0;
await prepare({...job,payload:ready},'key',generate,store);
assert.equal(calls,0);
const partial={...ready,ready:ready.ready.slice(0,8)};
const resumed=await prepare({...job,payload:partial},'key',generate,store);
assert.equal(resumed.ready.length,15);
assert.equal(calls,1,'remaining own-sentence tasks are supplied without a generation group');
// A single rejected question does not discard the three validated peers.
await assert.rejects(prepare(job,'key',async items=>items.filter(i=>i.id!=='4').map(answer),store),/Incomplete validated preparation/);
const almostReady=checkpoints.at(-1).p_payload;
assert.equal(almostReady.ready.length,14);
let retriedIds=[];
const completed=await prepare({...job,payload:almostReady},'key',async items=>{retriedIds=items.map(i=>i.id);return items.map(answer)},store);
assert.deepEqual(retriedIds,['4']);
assert.equal(completed.ready.length,15);
// One failed group leaves good peer groups durable and marks the job retryable.
let failed=false;
const failOnce=async items=>{if(!failed){failed=true;throw Error('Temporary AI failure')}return generate(items)};
await assert.rejects(prepare(job,'key',failOnce,store),/Temporary AI failure/);
const failedSave=checkpoints.at(-1);
assert.equal(failedSave.p_failed,true);
assert.ok(failedSave.p_payload.ready.length>0&&failedSave.p_payload.ready.length<15);
// A stale lease cannot overwrite a newer lesson.
let staleCalls=0;
await assert.rejects(prepare(job,'key',async()=>{staleCalls++;return []},async()=>false),/superseded/);
assert.equal(staleCalls,0);
// Parallel responses are checked against other completed groups before publication.
const repeated=async items=>items.map(item=>({...answer(item),context:'오늘 도서관에서 같은 자료를 살펴보고 생각을 뒷받침하는 ＿＿＿＿를 찾았어요.'}));
await assert.rejects(prepare({...job,payload:{...plan,resumeId:'repeated-test'},learner:{...learner,activeLesson:{id:'repeated-test'},words:Object.fromEntries(plan.plans.map(p=>[p.w.w,{...(learner.words[p.w.w]||{}),problemHistory:[{context:'오늘 도서관에서 같은 자료를 살펴보고 생각을 뒷받침하는 ＿＿＿＿를 찾았어요.',options:[]}]}]))}},'key',repeated,store),/Repeated sentence/);
const withheld=checkpoints.at(-1).p_payload;
for(const word of withheld.newWords){
 const seen=new Set();
 for(const [,q] of withheld.ready.filter(([,q])=>q.w.w===word)){
  for(const key of passageKeys(q.ctx,q.opts.map(o=>o.t))){assert.ok(!seen.has(key));seen.add(key)}
 }
}
console.log('Server preparation verified: personalized 5-new/10-review packets with 15 distinct targets, parallel background groups, durable checkpoints, resume without regeneration, bounded duplicate rejection, stale-lease protection, unchanged records.');

// Recovery preserves original plans and accepted peers even after an answer
// changes the learner snapshot. It must not create an unrelated new lesson.
const interruptedLearner={...learner,difficulty:3.2,activeLesson:{id:'paused-lesson'},words:{'근거':{seen:1,correct:1,wrong:0,streak:1}}};
const interrupted={...ready,resumeId:'paused-lesson',ready:ready.ready.slice(0,8),snapshot:'before-answer'};
const frozenPlans=JSON.stringify(interrupted.plans),firstEight=JSON.stringify(interrupted.ready);
let recoveryIds=[];
const repaired=await prepare({...job,learner:interruptedLearner,payload:interrupted},'key',async items=>{recoveryIds.push(...items.map(i=>i.id));return items.map(answer)},store);
assert.equal(JSON.stringify(repaired.plans),frozenPlans);
assert.equal(JSON.stringify(repaired.ready.slice(0,8)),firstEight);
assert.equal(repaired.ready.length,15);
assert.equal(recoveryIds.length,interrupted.plans.slice(8).filter(p=>p.type!=='subjective_use'||p.needsCard).length);assert.ok(recoveryIds.every(id=>Number(id)>=8));
assert.equal(repaired.snapshot,learnerSnapshot(interruptedLearner));
console.log('Recovery worker verified: original plans and eight accepted questions retained across changed progress; fixed sentence tasks supplied locally and only missing passage tasks generated.');

for(const phrase of CONTEXT_ONLY_EXPRESSIONS){
 assert.equal(isLearningTarget(phrase),false);assert.equal(isLearningTarget(phrase.replaceAll(' ','')),false);
}
for(const w of ['격차','정보','기준','시행착오','역지사지','탄소 중립','먹이 사슬','발이 넓다'])assert.equal(isLearningTarget(w),true);
const rejectedCatalog={'생활 정보 격차':{w:'생활 정보 격차',d:'설명형 표현',band:7,source:'fixed'}};
const rejectedLearner={...learner,difficulty:7,words:{'생활 정보 격차':{seen:10,introducedAt:'2026-09-01'}}};
const rejectedCurriculum=[...guestCurriculum,...CONTEXT_ONLY_EXPRESSIONS.map(word=>({word,definition:'설명형 표현',band:7,domain:'생활'}))];
const curated=makePreparedPlan(rejectedLearner,rejectedCatalog,rejectedCurriculum,'family','guest');
assert.ok(curated.plans.every(p=>isLearningTarget(p.w.w)));
assert.ok(curated.newWords.every(isLearningTarget));assert.equal(rejectedLearner.words['생활 정보 격차'].seen,10);
const stale=JSON.parse(JSON.stringify(ready));stale.plans[0].w.w='생활 정보 격차';
const replaced=await prepare({...job,payload:stale},'key',generate,store);
assert.ok(replaced.plans.every(p=>isLearningTarget(p.w.w)));
const oldPaused=JSON.parse(JSON.stringify(interrupted));oldPaused.plans[0].w.w='생활 정보 격차';
const preserved=await prepare({...job,learner:interruptedLearner,payload:oldPaused},'key',async items=>items.map(answer),store);
assert.equal(JSON.stringify(preserved.plans),JSON.stringify(oldPaused.plans));
console.log('Core vocabulary verified: descriptive phrases and spacing variants excluded from new/review targets, independent concepts and idioms retained, stale unused packets replaced, interrupted lessons and records preserved.');

for(const w of ["등비중항","소인수분해","삼각형의 합동","사동 표현","절대온도"])assert.equal(isLearningTarget(w),false);
for(const w of ["수렴","편차","확인하다"])assert.equal(isLearningTarget(w,"수학·논리",7),true);
for(const w of ["나누다","비교하다"])assert.equal(isLearningTarget(w,"수학·논리",7),false,'unreviewed retired words cannot return through a stale high band');
assert.equal(isLearningTarget('비교','수학·논리',7),true,'reviewed core noun is reclassified to the canonical stage two');
assert.equal(isLearningTarget("새로운 수학 공식","수학·논리",7),false);
assert.equal(isLearningTarget("간섭","과학",7),true,'canonical general sense replaces the excluded specialist sense');assert.equal(isLearningTarget("새로운 전문 과학명","과학",7),false);

for(const w of ['꾸미는 말','부사','주어','자외선 차단'])assert.equal(isLearningTarget(w),false);

assert.equal(isLearningTarget('세포'),false);

// A rejected advanced blank becomes reviewed sentence use, preserving balance.
const advancedWords=Array.from({length:8},(_,i)=>({word:'심화어휘'+i,definition:'사건을 이해하는 데 필요한 뜻',band:7,domain:'국어'}));
const advancedLearner={difficulty:7.4,words:Object.fromEntries(advancedWords.map(w=>[w.word,{seen:2,correct:1,wrong:1,streak:1}]))};
const advancedJob={...job,kind:'reserve',slot:1,learner:advancedLearner,curriculum:advancedWords};
let wideOnce=false,redesigned=false;
const demandGenerate=async items=>{
 if(items.some(i=>i.id==='0')&&!wideOnce){wideOnce=true;const out=items.filter(i=>i.id!=='0').map(answer);out.failed=[{id:'0',issues:['review_failed:levelDemandFit']}];return out;}
 if(items.some(i=>i.id==='0'&&i.type==='subjective_use'))redesigned=true;
 return items.map(answer);
};
const redesignedPacket=await prepare(advancedJob,'key',demandGenerate,async()=>true);
assert.equal(redesigned,false);assert.equal(wideOnce,false);assert.equal(redesignedPacket.plans[0].type,'subjective_recall');assert.equal(redesignedPacket.plans.filter(p=>p.type==='subjective_use').length,4);assert.equal(redesignedPacket.ready.length,8);
const frozenPacket=makePreparedPlan(advancedLearner,{},advancedWords,'family','inseong',{reviewOnly:true});frozenPacket.resumeId='advanced-paused';
const frozenLearner={...advancedLearner,activeLesson:{id:'advanced-paused'}};const originalTypes=JSON.stringify(frozenPacket.plans.map(p=>p.type));wideOnce=false;redesigned=false;
const frozenOutput=await prepare({...advancedJob,learner:frozenLearner,payload:frozenPacket},'key',demandGenerate,async()=>true);
assert.equal(JSON.stringify(frozenOutput.plans.map(p=>p.type)),originalTypes);assert.equal(redesigned,false);
console.log('Legacy review delivery verified: missing advanced recall stays hidden-target recall, with other unsupplied practice using own sentences without generation; interrupted lessons keep their original tasks.');

// A failed relation task keeps its vocabulary, ID, and objective/written balance.
const relationPlan=makePreparedPlan(advancedLearner,{},advancedWords,'family','inseong',{reviewOnly:true});
const relation=relationPlan.plans.find(p=>p.type==='mc_usage');relation.type='mc_relation';let relationFailed=false;
const diversify=async items=>{if(!relationFailed&&items.some(i=>i.id===relation.id)){relationFailed=true;const out=items.filter(i=>i.id!==relation.id).map(answer);out.failed=[{id:relation.id,issues:['review_failed:levelDemandFit']}];return out;}return items.map(answer)};
const diversified=await prepare({...advancedJob,payload:relationPlan},'key',diversify,async()=>true);
assert.equal(diversified.plans.find(p=>p.id===relation.id).w.w,relation.w.w);
assert.equal(relationFailed,false);assert.equal(diversified.plans.filter(p=>p.type.startsWith('mc_')).length,0);assert.equal(diversified.ready.length,8);
assert.equal(diversified.plans.find(p=>p.id===relation.id).type,'subjective_use');
console.log('Missing relation-bank task verified: vocabulary and ID retained, no generation request, canonical productive use supplied immediately.');

