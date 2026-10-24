import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
import {makePreparedPlan} from '../lib/prepared-plan.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY,MINIMUM_STUDY_MS,buildDailyPlan} from '../lib/daily-practice.js';
import {calibratedWord,inTargetBand,isCoveragePlan,learningDay} from '../lib/learning-model.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {prepare} from '../api/prepare-worker.js';
import topupHandler,{buildStudyTopups} from '../api/study-topups.js';

const level=3.5;
const w=authoredCurriculum(AUTHORED_OWNER).map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,source:'fixed'})).find(w=>inTargetBand(w,level));
const learner={difficulty:level,words:{[w.w]:{seen:1,introducedAt:'2026-10-01'}}};
const topups=buildStudyTopups(learner,AUTHORED_OWNER,[w.w],'client');
const basePlan={...buildDailyPlan([w],[],()=>({}),level)[0],type:'subjective_use',stage:'use',firstLearning:false,needsCard:false,review:true,taskDemand:'standard'};
const packet={account:AUTHORED_OWNER,plans:[basePlan],ready:[]};
assert.equal(hydrateFromBank(packet,learner,[authoredEntry(basePlan,learner,AUTHORED_OWNER)]),1);
const correct={word:w.w,type:'subjective_use',credit:1,contextSuccess:true,hintUsed:false,revealed:false,result:'○',band:w.band,answeredAt:Date.now(),studyDate:learningDay()};
const source=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture(elapsed=MINIMUM_STUDY_MS-1000,saved=null){
 let now=Date.parse('2026-10-12T14:44:00+09:00');
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const nodes=new Map(),alerts=[],requests=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,textContent:'',innerHTML:'',value:'',disabled:false,style:{},appendChild(){},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const screens=['learn','intro','home','report'].map(node);
 const context=vm.createContext({studyHistory,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,AbortSignal,structuredClone,console,Date:ClockDate,Math,Promise,Map,Set,setTimeout,clearTimeout,window:{scrollTo(){}},
  document:{hidden:false,getElementById:node,createElement:()=>node('option'),querySelectorAll:s=>s==='.screen'?screens:[]},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:x=>alerts.push(x),
  createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}})});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 context.packet=structuredClone(packet);context.topups=structuredClone(topups);context.correct=correct;
 run(`authUser={id:${JSON.stringify(AUTHORED_OWNER)}};loadedAccount=authUser.id;state.selected='ayoung';child().difficulty=${level};wordState(${JSON.stringify(w.w)}).seen=1;
  renderAll=()=>{};renderReport=()=>{};renderExploration=()=>{};warmDailyQuestions=()=>{};localSave=()=>{};cloudSave=()=>Promise.resolve();
  globalThis.prep=createPreparation({account:authUser.id,profile:'ayoung',plans:packet.plans,baseWords:[packet.plans[0].w],newWords:[],key:'fixture',deliveryPolicy:DELIVERY_POLICY,practicePool:[],adopted:true},packet.ready);
  session={lessonId:'duration-fixture',profile:'ayoung',account:authUser.id,mode:'daily',model:LEARNING_MODEL,difficulty:${level},preparation:prep,queue:prep.queue,results:[correct],target:1,baseWords:[packet.plans[0].w],newWords:[],completionPolicy:DAILY_POLICY,introWords:[],introCursor:0,introDone:true,activeMs:${elapsed},clockStarted:Date.now(),studyTopups:topups,timeAddedWords:[]};
  current=1;document.getElementById('learn').classList.add('active');`);
 const f={run,node,alerts,requests,advance:ms=>{now+=ms},setFetch:fn=>{context.fetch=async(...args)=>{requests.push(args[0]);return fn(...args)}}};
 f.setFetch(()=>{throw Error('Unexpected network')});
 if(saved){context.saved=saved;run('state=mergeState(saved);session=null');}
 return f;
}


function round(elapsed=19*60000){
 const f=fixture(elapsed);f.run("pauseLearningClock();session.roundPolicy=studyHistory.LEGACY_ROUND_POLICY;studyHistory.organizeStudyRounds(child(),studyHistory.historyFor(child()),session);session.studyStartedAt=Date.now();session.studyFallbackDay=today();session.results[0]={...session.results[0],answeredAt:Date.now(),studyDate:today()};");return f;
}
const fast=round();fast.run('finishSession()');
assert.equal(fast.run('session.timeAddedWords.length'),1);assert.equal(fast.run('session.completed'),undefined);assert.equal(fast.requests.length,0);
const resolved=round();resolved.run("session.results.unshift({...session.results[0],credit:0,contextSuccess:false,type:'mc_usage',result:'×'});finishSession()");
assert.equal(resolved.run('session.timeAddedWords.length'),0,'one error stops additional new words');
assert.equal(resolved.run('session.preparation.plans.at(-1).roundReinforcement'),true);
assert.equal(resolved.run('session.completed'),undefined,'resolved early still practices until 20');
for(const elapsed of [20*60000,23*60000]){
 const f=round(elapsed);f.run('finishSession()');assert.equal(f.run('session.completed'),true);assert.equal(f.run('child().sessions.length'),1);
 assert.equal(f.run('child().activeLesson'),null);assert.equal(f.run('session.roundEndReason'),'completed');
 f.run('session.completed=false;completeStudyRound()');assert.equal(f.run('child().sessions.length'),1,'stale completed cursor cannot reward or summarize twice');
}
const errors=round(20*60000);errors.run("session.results[0]={...session.results[0],credit:0,contextSuccess:false,result:'×'};finishSession()");
assert.equal(errors.run('session.completed'),undefined,'same round remains active at 20 with unresolved words');
assert.equal(errors.run('session.timeAddedWords.length'),0);
errors.run("session.results.push({...session.results[0],credit:1,contextSuccess:true,result:'○',type:'subjective_use'});session.activeMs=23*60000;session.clockStarted=null;finishSession()");
assert.equal(errors.run('session.completed'),true);assert.equal(errors.run('session.roundNumber'),1);
const cap=round(25*60000);cap.run("session.results[0]={...session.results[0],credit:0,contextSuccess:false,result:'×'};finishSession()");
assert.equal(cap.run('session.completed'),true);assert.equal(cap.run('session.roundEndReason'),'time_limit');assert.equal(cap.run('session.unfinishedWords.length'),1);
assert.equal(cap.run('unfinishedUsageWords(child(),today()).length'),1,'unresolved word carries to a later round on the same day');
assert.equal(cap.run('child().studyHistory.entries[session.lessonId].status'),'completed');
assert.equal(cap.run('child().words[session.baseWords[0].w].mastered'),false);
const retry=round(19*60000);retry.run("session.results.unshift({...session.results[0],credit:0,contextSuccess:false,type:'mc_usage',result:'×'});finishSession();");
const n=retry.run('current');retry.node('answer').value='입력하던 문장';retry.run('checkpointSession()');
const saved=JSON.parse(retry.run('JSON.stringify(child().activeLesson)')),before=JSON.stringify(saved.results);
retry.run('session.preparation.cancel();session=null');await retry.run('resumeLesson(child().activeLesson)');
assert.equal(retry.run('session.roundNumber'),saved.roundNumber);assert.equal(retry.run('session.activeMs'),saved.activeMs);assert.equal(retry.run('JSON.stringify(session.results)'),before);
// The clock gets ten seconds from actual activity, never the full grading wait.
const clock=round(0);clock.run("session.results=[];current=0;session.studyDays={};session.studyTimeInitialized=true;session.activeMs=0;show('learn');renderQuestion()");
clock.advance(45000);clock.run('pauseLearningClock()');assert.equal(clock.run('activeTime()'),10000);
clock.advance(300000);assert.equal(clock.run('activeTime()'),10000);
clock.run('session.waitingForGrading=true;markStudyActivity({isTrusted:true})');clock.advance(300000);assert.equal(clock.run('activeTime()'),10000);
// Historical numbers, duplicates and true total time remain stable and separate.
const legacy={sessions:[{lessonId:'a',date:'2026-10-18',mode:'daily',activeMinutes:25,total:10,good:10,wrong:0},{lessonId:'a',date:'2026-10-18',mode:'daily',activeMinutes:12,total:5,good:4,wrong:1},{lessonId:'b',date:'2026-10-18',mode:'review',activeMinutes:19,total:9,good:8,wrong:1}]};
const hist=studyHistory.historyFor(legacy),rows=studyHistory.roundHistoryRows(legacy,hist);
assert.equal(rows.length,2);assert.equal(rows.reduce((sum,r)=>sum+r.activeMs,0),44*60000);
const registry=JSON.stringify(legacy.studyRounds);studyHistory.roundHistoryRows(legacy,hist);assert.equal(JSON.stringify(legacy.studyRounds),registry);
// More than three daily rounds: fresh words are allocated per round after today's first five.
const curriculum=authoredCurriculum(AUTHORED_OWNER),reader={difficulty:3.5,words:{},lastDate:learningDay()};
let prior=[];
for(let number=1;number<=4;number++){
 const packet=makePreparedPlan(reader,{},curriculum,AUTHORED_OWNER,'guest');assert.equal(packet.roundPolicy,studyHistory.ROUND_POLICY);assert.equal(packet.newWords.length,5);
 assert.ok(packet.newWords.every(w=>!prior.includes(w)));prior.push(...packet.newWords);
 for(const word of packet.newWords)reader.words[word]={seen:1,introducedAt:learningDay(),nextReviewAt:learningDay()};
}

const late=round(20*60000-1000);late.run("studyHistory.beginStudyWindow(session,'test',Date.now(),true);session.clockStarted=Date.now();studyHistory.bindDailyStudyLimit(child(),session,Date.now())");
late.advance(120000);late.run('stopAtDailyLimit()');assert.equal(late.run('activeTime()'),20*60000,'delayed timer cannot inflate the round past its 20-minute boundary');
// A later reinforcement failure reopens the word, and the correction is visible.
const reopened=round();reopened.run("session.results.push({...session.results[0],credit:0,contextSuccess:false,result:'×'});current=session.results.length;ensureUsageContinuation(session);session.preparation.pump();renderQuestion()");
assert.equal(reopened.run('studyHistory.roundUnfinished(session).length'),1);
assert.equal(reopened.run('session.completed'),undefined);
assert.ok(reopened.node('qText').textContent.includes(reopened.run('session.baseWords[0].w')));

const pending=round(20*60000);pending.run("child().sessions.push({lessonId:'prior-round',date:today(),mode:'daily',total:2,good:2,wrong:0,activeMinutes:25});session.results[0]={...session.results[0],gradingPending:true,gradingJobId:'waiting',credit:null,excludedFromVocabulary:true};session.gradingQueue=[{id:'waiting',word:session.baseWords[0].w,answer:'보관할 문장',status:'pending',submittedAt:Date.now(),nextRetryAt:Date.now()+60000,pollPolicy:'status-poll-12.16.35',payload:{answer:'보관할 문장'}}];finishSession()");
assert.equal(pending.run('session.completed'),undefined);assert.equal(pending.run('session.waitingForGradeResults'),true,'a second round does not hit the old cumulative daily cap while waiting');
pending.run('session.activeMs=25*60000;session.clockStarted=null;finishSession()');
assert.equal(pending.run('session.roundEndReason'),'time_limit');assert.equal(pending.run('child().ungradedSubmissions[0].payload.answer'),'보관할 문장');
assert.equal(pending.run('session.results[0].credit'),null,'a timed-out grade is never invented as correct or wrong');
console.log('Rounds PASS: new5 per round, 4 same-day rounds, no new additions after errors, early reinforcement, 25/28/30 endpoints, same-day unfinished carry, duplicate completion guard, resume draft/time/number, ten-second idle and excluded waits, historical duplicate and 44-minute split. No paid calls.');
const breadthTopup=round();
breadthTopup.run("session.roundPolicy=studyHistory.ROUND_POLICY;session.readingPractice={completed:true};session.results.unshift({...session.results[0],credit:0,contextSuccess:false,result:'×'});finishSession()");
assert.equal(breadthTopup.run('session.timeAddedWords.length'),1,'when no other learned target exists, corrected historical errors must not block a validated new-word topup');
assert.equal(breadthTopup.run('session.completed'),undefined,'minimum active study time is preserved');
assert.equal(breadthTopup.requests.length,0,'downloaded topup needs no provider call');
console.log('Finite review supply PASS: no learned alternatives falls back to a validated downloaded topup after corrections.');
