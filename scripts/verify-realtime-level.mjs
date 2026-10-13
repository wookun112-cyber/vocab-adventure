import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {REALTIME_LEVEL_POLICY,initRealtimeLevel,observeRealtimeLevel,updateLearningLevels,reconcileLevelBackfill,realtimeTargetBand,calibratedWord,learningDay} from '../lib/learning-model.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {DAILY_POLICY} from '../lib/daily-practice.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {buildRealtimePool,buildStudyTopups} from '../api/study-topups.js';
import {prepare} from '../api/prepare-worker.js';

const day=learningDay(),learner=level=>({difficulty:level,leagueLevel:level,words:{}});
const lesson=()=>({mode:'daily',lessonId:'fast-level',results:[]});
const row=(word,band=4,credit=1,type='subjective_recall',extra={})=>({word,band,credit,type,contextSuccess:credit===1,result:credit?'○':'×',...extra});
function add(l,a,rows){a.results.push(...rows);return observeRealtimeLevel(l,a)}
let l=learner(4),a=lesson();initRealtimeLevel(l,a);
assert.equal(add(l,a,[row('관점'),row('해석')]),null);assert.equal(l.difficulty,4);
const first=add(l,a,[row('반박')]);assert.equal(first.change,.3);assert.equal(l.difficulty,4.3);assert.equal(l.leagueLevel,4);
assert.equal(add(l,a,[row('양보',5),row('조율',5),row('통찰',5)]).change,.5);assert.equal(l.difficulty,4.8);
assert.equal(add(l,a,[row('규범',5),row('책무',5),row('합의',5)]).change,.5);assert.equal(l.difficulty,5.3);
const resultPrefix=JSON.stringify(a.results),saved=structuredClone(a),restarted=structuredClone(l);
assert.equal(observeRealtimeLevel(restarted,saved),null);assert.equal(JSON.stringify(saved.results),resultPrefix);assert.equal(restarted.difficulty,5.3);
const final=updateLearningLevels(l,a.results,day,{lessonId:a.lessonId,active:a});
assert.equal(final.policy,REALTIME_LEVEL_POLICY);assert.equal(final.change,1.3);assert.equal(l.leagueLevel,5.3);assert.equal(l.difficulty,5.3,'completion adds no second adjustment');
updateLearningLevels(l,a.results,day,{lessonId:a.lessonId,active:a});assert.equal(l.levelAdjustmentHistory.length,1);

// Repeated practice, exposed answers, easy old words and ungraded work never
// promote or demote the overall ability estimate.
for(const extra of [{remedial:true},{practiceOnly:true},{hintUsed:true},{revealed:true},{result:'?'},{evaluationError:true},{levelEligible:false}]){
 l=learner(4);a=lesson();initRealtimeLevel(l,a);
 add(l,a,['관점','해석','반박'].map(w=>row(w,4,1,'subjective_recall',extra)));assert.equal(l.difficulty,4);
}
l=learner(4);a=lesson();initRealtimeLevel(l,a);
add(l,a,Array.from({length:30},()=>row('관점')));assert.equal(l.difficulty,4);assert.equal(a.adaptation.rows.length,1);
l=learner(7.4);a=lesson();initRealtimeLevel(l,a);
add(l,a,['아기','학교','친구'].map(w=>row(w,2)));assert.equal(l.difficulty,7.4);assert.equal(a.adaptation.rows.length,0);
add(l,a,['가장자리','가격','저울'].map(w=>row(w,8)));assert.equal(l.difficulty,7.4);assert.equal(a.adaptation.rows.length,0,'forged high labels cannot promote calibrated basic words');
l=learner(4);a=lesson();initRealtimeLevel(l,a);
add(l,a,['관점','해석','반박'].map(w=>row(w,4,1,'subjective_recall',{targetRecall:false})));assert.equal(l.difficulty,4,'a natural alternative cannot prove recall of the target word');
l=learner(4);a=lesson();initRealtimeLevel(l,a);
add(l,a,['관점','해석','반박'].map(w=>row(w,4,1,'mc_usage')));assert.equal(l.difficulty,4,'choices alone cannot promote');
add(l,a,['통찰','규범','책무'].map(w=>row(w,5,0,'subjective_use')));assert.equal(l.difficulty,4,'writing trouble is not an assumed meaning failure');
l=learner(4);a=lesson();initRealtimeLevel(l,a);
assert.equal(add(l,a,['관점','해석','반박'].map(w=>row(w,4,0))).change,-.3);assert.equal(l.difficulty,3.7);
l=learner(4);a=lesson();initRealtimeLevel(l,a);
for(let i=0;i<30;i++)add(l,a,[row('핵심어휘'+i)]);
assert.equal(l.difficulty,4.5,'higher grades require actual evidence from higher-band words');
const old=lesson();old.results=['관점','해석','반박'].map(w=>row(w));l=learner(4);initRealtimeLevel(l,old);
assert.equal(observeRealtimeLevel(l,old),null);assert.equal(l.difficulty,4,'upgrade never regrades an old prefix');
const local=structuredClone(restarted),remote={...learner(4),gradeBackfill:{id:'new-parent-marker',date:day},levelAdjustmentHistory:[]};
local.levelAdjustmentHistory=[final];local.sessions=[];
assert.equal(reconcileLevelBackfill(remote,local).difficulty,5.3,'new parent marker retains a valid fast completion delta');
assert.equal(realtimeTargetBand(4,0),5);assert.equal(realtimeTargetBand(4,1),4);assert.equal(realtimeTargetBand(4,2,true),5);assert.equal(realtimeTargetBand(9,0,true),9);

// Every neighboring-band probe and its retry alternatives are fixed-bank
// questions. Candidate downloads do not introduce words or mutate learners.
for(const level of [1.8,4,7.4,9]){
 const model=learner(level),before=JSON.stringify(model),pool=buildRealtimePool(model,AUTHORED_OWNER);
 assert.equal(JSON.stringify(model),before);assert.equal(pool.policy,REALTIME_LEVEL_POLICY);assert.ok(pool.targets.length);
 assert.equal(new Set(pool.targets.map(t=>t.plan.w.w)).size,pool.targets.length);
 for(const t of pool.targets){assert.ok(authoredQuestionValid(t.question,AUTHORED_OWNER));assert.ok(authoredQuestionValid(t.probeQuestion,AUTHORED_OWNER));assert.ok(!t.probeQuestion.learningCard);assert.equal(t.probeQuestion.showTarget,false);assert.ok(t.practicePool.some(q=>q.type==='subjective_use'));}
 const packet=await prepare({id:'adaptive-'+level,lease:'test',account:AUTHORED_OWNER,profile:'ayoung',learner:model},'test',async()=>{throw Error('Unexpected generation')},async()=>true);
 assert.equal(packet.ready.length,packet.plans.length);assert.ok(packet.adaptivePool.targets.length);assert.equal(JSON.stringify(model),before);
}
assert.equal(buildRealtimePool(learner(4),'other-owner').targets.length,0);

// Actual client: three first-attempt recall answers adjust the level before
// finishing, replace only unseen future new targets, retain the entire prefix
// and current input on restart, and finalize the league exactly once.
const curriculum=authoredCurriculum(AUTHORED_OWNER),base=learner(4);
const words=curriculum.filter(w=>w.band===4).slice(0,8).map(w=>calibratedWord({w:w.word,d:w.definition,band:w.band,cat:w.domain,source:'fixed'}));
const plans=words.map((w,i)=>({id:String(i),w,type:i<3?'subjective_recall':'mc_usage',stage:i<3?'check':'practice',review:i<3,firstLearning:i>=3,needsCard:i>=3,taskDemand:i<3?'standard':'initial-practice',supportLevel:0,answerSlot:i%5}));
const packet={account:AUTHORED_OWNER,profile:'ayoung',plans,ready:[],baseWords:words,newWords:words.slice(3).map(w=>w.w)};
for(let i=0;i<3;i++)base.words[words[i].w]={seen:1,introducedAt:'2026-10-01',lastExposureAt:'2026-10-01'};
assert.equal(hydrateFromBank(packet,base,plans.map(p=>authoredEntry(p,base,AUTHORED_OWNER))),8);
const pool=buildRealtimePool(base,AUTHORED_OWNER,words.map(w=>w.w),'client');
const timePool=buildStudyTopups(base,AUTHORED_OWNER,words.map(w=>w.w),'client');
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture(seed=null){
 const nodes=new Map(),requests=[],alerts=[];
 const node=id=>{if(!nodes.has(id)){const cs=new Set();nodes.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},appendChild(){},classList:{add(...xs){xs.forEach(x=>cs.add(x))},remove(...xs){xs.forEach(x=>cs.delete(x))},contains:x=>cs.has(x),toggle(x,on){if(on??!cs.has(x))cs.add(x);else cs.delete(x)}}})}return nodes.get(id)};
 const context=vm.createContext({studyHistory,AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,AbortSignal,structuredClone,console,Date,Math,Promise,Map,Set,setTimeout,clearTimeout,
  document:{hidden:false,getElementById:node,createElement:()=>node('option'),querySelectorAll:()=>[]},window:{scrollTo(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:x=>alerts.push(x),createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}}),fetch:(url)=>{requests.push(url);throw Error('Unexpected network')}});
 const run=s=>vm.runInContext(s,context);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 context.packet=structuredClone(packet);context.base=structuredClone(base);context.pool=structuredClone(pool);context.timePool=structuredClone(timePool);
 run(`authUser={id:AUTHORED_OWNER};loadedAccount=authUser.id;state.selected='ayoung';state.users.ayoung=Object.assign(freshChild('아영'),base);
  localSave=()=>{};cloudSave=()=>Promise.resolve();warmDailyQuestions=()=>{};renderAll=()=>{};renderReport=()=>{};renderExploration=()=>{};
  const p=createPreparation({...packet,key:'fixture',mode:'daily',deliveryPolicy:DELIVERY_POLICY,practicePool:[],adopted:true},packet.ready);
  session={lessonId:'client-fast',profile:'ayoung',account:AUTHORED_OWNER,mode:'daily',model:LEARNING_MODEL,reviewPolicy:REVIEW_POLICY,completionPolicy:DAILY_POLICY,difficulty:4,
   preparation:p,queue:p.queue,results:[],target:8,baseWords:packet.baseWords,newWords:packet.newWords,introWords:packet.newWords.slice(),introAt:3,introCursor:0,introDone:false,activeMs:0,clockStarted:null,adaptivePool:pool,studyTopups:timePool,timeAddedWords:[]};
  current=0;initRealtimeLevel(child(),session);show('learn');renderQuestion();`);
 if(seed){context.seed=seed;run('pauseLearningClock();state=mergeState(seed);session=null')}
 return {run,node,requests,alerts};
}
let f=fixture();const originalTargets=f.run('JSON.stringify(session.baseWords)');
for(let i=0;i<3;i++){
 f.run("applyResult(session.queue[current],'◎','직접 떠올렸어요.','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})");
 if(i<2)await f.run('nextQuestion()');
}
assert.equal(f.run('child().difficulty'),4.3);assert.equal(f.run('child().leagueLevel'),4);assert.equal(f.run('child().sessions.length'),0);
const answers=f.run('JSON.stringify(session.results)'),prefix=f.run('JSON.stringify(session.preparation.plans.slice(0,3))');
await f.run('nextQuestion()');
assert.equal(f.run('JSON.stringify(session.results)'),answers);assert.equal(f.run('JSON.stringify(session.preparation.plans.slice(0,3))'),prefix);
assert.notEqual(f.run('JSON.stringify(session.baseWords)'),originalTargets);assert.equal(f.run('session.newWords.length'),5);assert.equal(f.run('session.baseWords.length'),8);
assert.ok(f.run('session.preparation.plans.slice(3,8).filter(p=>p.realtimeProbe).length')>=2);
while(f.run('!session.introDone'))f.run('nextIntro()');
assert.equal(f.run('session.queue[current].type'),'subjective_recall');assert.equal(f.node('qWord').textContent,'');
f.node('answer').value='작성 중인 답';f.run('checkpointSession()');
const savedState=JSON.parse(f.run('JSON.stringify(state)')),livePlan=f.run('JSON.stringify(session.preparation.plans[current])');
const oldInput=f.node('answer').value;f.run('adaptPendingTargets(session)');assert.equal(f.node('answer').value,oldInput);assert.equal(f.run('JSON.stringify(session.preparation.plans[current])'),livePlan);
f=fixture(savedState);await f.run('resumeLesson(child().activeLesson)');
assert.equal(f.run('child().difficulty'),4.3);assert.equal(f.run('child().leagueLevel'),4);assert.equal(f.run('current'),3);
assert.equal(f.run('JSON.stringify(session.results)'),answers);assert.equal(f.node('answer').value,'작성 중인 답');
for(let i=0;i<3;i++){
 assert.equal(f.run('session.queue[current].type'),'subjective_recall');assert.equal(f.run('session.queue[current].w.band'),5);
 f.run("applyResult(session.queue[current],'◎','정확해요.','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})");await f.run('nextQuestion()');
}
assert.equal(f.run('child().difficulty'),4.8);assert.equal(f.run('child().leagueLevel'),4);
assert.equal(f.run('session.results.slice(3,6).every(r=>r.levelEligible&&!r.practiceOnly)'),true);
assert.equal(f.run('session.results.slice(3,6).every(r=>child().words[r.word].introducedAt===today())'),true);
assert.ok(f.requests.every(url=>url==='/api/study-topups'),'transitions continue from cached prompts even when background bank downloads fail');
f.run("pauseLearningClock();session.activeMs=25*60000;session.results.push(...session.baseWords.map(w=>({word:w.w,type:'subjective_use',band:w.band,result:'○',credit:1,contextSuccess:true,remedial:true})));current=session.results.length;session.target=current;finishSession()");
assert.equal(f.run('child().difficulty'),4.8);assert.equal(f.run('child().leagueLevel'),4.8);assert.equal(f.run('child().sessions.length'),1);
f.run('finishSession()');assert.equal(f.run('child().sessions.length'),1);assert.equal(f.run('child().activeLesson'),null);
console.log('Realtime levels verified: three-word .3/.5 promotion, supported-band ceiling, distinct meaning failures, no choice/feedback/typing-error inflation, delayed league finalization, idempotent restart/completion, parent reconciliation, fixed neighboring-bank probes, unchanged prefix/input, five-new budget and instantaneous client transitions.');
