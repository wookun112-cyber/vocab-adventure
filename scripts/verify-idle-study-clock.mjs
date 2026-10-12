import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {DAILY_POLICY,minimumStudyReached} from '../lib/daily-practice.js';
import {LEARNING_MODEL,REVIEW_POLICY,learningDay} from '../lib/learning-model.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {buildStudyTopups} from '../api/study-topups.js';

const at=s=>Date.parse(s),start=at('2026-10-12T20:10:00+09:00');
// Accounting remains correct even if the browser's timer runs very late.
let a={lessonId:'bounded',activeMs:0,clockStarted:start};
studyHistory.beginStudyWindow(a,'question:0',start);
assert.equal(studyHistory.activeStudyTime(a,start+29000),29000);
assert.equal(studyHistory.activeStudyTime(a,start+180000),30000);
studyHistory.captureStudyClock(a,start+180000);
assert.equal(a.activeMs,30000);assert.equal(a.clockStarted,null);assert.equal(a.studyIdle.remainingMs,0);
studyHistory.beginStudyWindow(a,'question:0',start+3600000);
assert.equal(a.studyIdle.remainingMs,0,'same question never replenishes an expired allowance');
studyHistory.beginStudyWindow(a,'feedback:0',start+3600000,true);a.clockStarted=start+3600000;
studyHistory.captureStudyClock(a,start+3610000);assert.equal(a.activeMs,40000);

// The allowance is accumulated foreground study, including accurate midnight split.
const midnight=at('2026-10-11T23:59:45+09:00');
a={lessonId:'midnight',activeMs:0,clockStarted:midnight};studyHistory.beginStudyWindow(a,'question:0',midnight);
const l={sessions:[]};studyHistory.recordStudySession(l,a,midnight+300000);
assert.equal(l.studyHistory.entries.midnight.days['2026-10-11'].activeMs,15000);
assert.equal(l.studyHistory.entries.midnight.days['2026-10-12'].activeMs,15000);
a={activeMs:0,clockStarted:start};studyHistory.beginStudyWindow(a,'question:0',start);
studyHistory.captureStudyClock(a,start+20000);a.clockStarted=null;
const reopened=structuredClone(a);reopened.clockStarted=start+3600000;
studyHistory.beginStudyWindow(reopened,'question:0',start+3600000);
studyHistory.captureStudyClock(reopened,start+3700000);assert.equal(reopened.activeMs,30000,'closing does not replenish the unused 10 seconds');

// Upgrading the old 60-second window preserves time already recorded and
// only shortens the remaining allowance for the same unanswered question.
const legacyPolicy='answer-submit-idle-60s-12.16.16';
for(const spent of [0,10000,20000,30000,40000,60000]){
 const legacy={activeMs:spent,clockStarted:null,studyIdle:{policy:legacyPolicy,key:'question:0',remainingMs:60000-spent}};
 const remaining=Math.max(0,30000-spent);
 assert.equal(studyHistory.studyWindowRemaining(legacy,start),remaining);
 studyHistory.beginStudyWindow(legacy,'question:0',start);
 assert.equal(legacy.studyIdle.policy,studyHistory.STUDY_IDLE_POLICY);
 assert.equal(legacy.studyIdle.remainingMs,remaining);assert.equal(legacy.activeMs,spent);
 legacy.clockStarted=start;studyHistory.captureStudyClock(legacy,start+180000);
 assert.equal(legacy.activeMs,Math.max(30000,spent),'recorded time is retained without extra idle time');
 assert.equal(legacy.studyIdle.remainingMs,0);assert.equal(legacy.clockStarted,null);
 studyHistory.beginStudyWindow(legacy,'question:0',start+180000);
 assert.equal(legacy.studyIdle.remainingMs,0);
 studyHistory.beginStudyWindow(legacy,'question:0',start+180000,true);
 assert.equal(legacy.studyIdle.remainingMs,30000,'valid submission renews the new 30-second allowance');
 studyHistory.beginStudyWindow(legacy,'question:1',start+180000);
 assert.equal(legacy.studyIdle.remainingMs,30000);
}
const delayedLegacy={activeMs:10000,clockStarted:start,studyIdle:{policy:legacyPolicy,key:'question:0',remainingMs:50000}};
assert.equal(studyHistory.activeStudyTime(delayedLegacy,start+180000),30000);
studyHistory.captureStudyClock(delayedLegacy,start+180000);
assert.equal(delayedLegacy.activeMs,30000);assert.equal(delayedLegacy.studyIdle.remainingMs,0);

const row=authoredCurriculum(AUTHORED_OWNER).find(w=>w.word==='의견');
const w={w:row.word,d:row.definition,band:2,cat:row.domain,source:'fixed'};
const topups=buildStudyTopups({difficulty:2,words:{}},AUTHORED_OWNER,[w.w],'idle');
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture({elapsed=0,type='subjective_use',saved=null}={}){
 let now=start,nextTimer=0;
 const timers=new Map(),nodes=new Map(),alerts=[],requests=[];
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,textContent:'',innerHTML:'',value:'',disabled:false,style:{},appendChild(){},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const screens=['learn','intro','home','report'].map(node);
 const context=vm.createContext({studyHistory,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,AbortSignal,structuredClone,console,Date:ClockDate,Math,Promise,Map,Set,
  setTimeout:(fn,delay)=>{const timer={id:++nextTimer,unref(){}};timers.set(timer.id,{fn,at:now+Math.max(0,Number(delay)||0)});return timer},clearTimeout:t=>timers.delete(t?.id),
  window:{scrollTo(){}},document:{hidden:false,getElementById:node,createElement:()=>node('option'),querySelectorAll:s=>s==='.screen'?screens:[]},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:x=>alerts.push(x),createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}})});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 const plan={id:'0',w,type,review:true,stage:type==='subjective_use'?'use':'bridge',taskDemand:'standard',firstLearning:false,needsCard:false,answerSlot:0};
 const packet={account:AUTHORED_OWNER,plans:[plan],ready:[]};assert.equal(hydrateFromBank(packet,{difficulty:2,words:{}},[authoredEntry(plan,{difficulty:2,words:{}},AUTHORED_OWNER)]),1);
 context.packet=structuredClone(packet);context.topups=structuredClone(topups);
 run(`authUser={id:${JSON.stringify(AUTHORED_OWNER)}};loadedAccount=authUser.id;state.selected='ayoung';child().difficulty=2;
  renderAll=()=>{};renderReport=()=>{};renderExploration=()=>{};warmDailyQuestions=()=>{};localSave=()=>{};cloudSave=()=>Promise.resolve();
  globalThis.prep=createPreparation({account:authUser.id,profile:'ayoung',mode:'daily',plans:packet.plans,baseWords:[packet.plans[0].w],newWords:[],key:'fixture',deliveryPolicy:DELIVERY_POLICY,practicePool:[],adopted:true},packet.ready);
  session={lessonId:'idle-fixture',profile:'ayoung',account:authUser.id,mode:'daily',model:LEARNING_MODEL,reviewPolicy:REVIEW_POLICY,difficulty:2,preparation:prep,queue:prep.queue,results:[],target:1,baseWords:[packet.plans[0].w],newWords:[],completionPolicy:DAILY_POLICY,introWords:[],introCursor:0,introDone:true,activeMs:${elapsed},clockStarted:null,studyTopups:topups,timeAddedWords:[]};
  current=0;show('learn');renderQuestion();`);
 const f={run,node,alerts,requests,advance(ms,fire=true){const end=now+ms;let steps=0;if(fire)for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=Math.max(now,due[1].at);due[1].fn();assert.ok(++steps<1000)}now=end},setFetch(fn){context.fetch=async(...args)=>{requests.push(args[0]);return fn(...args)}}};
 f.setFetch(()=>{throw Error('Unexpected question generation')});
 if(saved){context.saved=saved;run('state=mergeState(saved);pauseLearningClock();session=null')}
 return f;
}

// Actual question timer pauses at exactly 30s and saves the draft without scoring.
let f=fixture();f.node('answer').value='입력하던 의견 문장';
const words=f.run('JSON.stringify(child().words)');
f.advance(29000);assert.equal(f.run('activeTime()'),29000);
f.advance(1000);assert.equal(f.run('activeTime()'),30000);assert.equal(f.run('session.clockStarted'),null);
assert.match(f.node('studyTime').textContent,/일시정지/);
assert.equal(f.run('child().activeLesson.pendingAnswer'),'입력하던 의견 문장');
assert.equal(f.run('JSON.stringify(child().words)'),words);assert.equal(f.run('session.results.length'),0);
f.advance(180000);f.node('answer').value='더 길게 입력한 의견 문장';f.run('checkpointSession()');
assert.equal(f.run('activeTime()'),30000);assert.equal(f.run('child().activeLesson.activeMs'),30000);
assert.equal(f.run('child().studyHistory.entries["idle-fixture"].days["2026-10-12"].activeMs'),30000);
// Hint/repaint, screen return, and empty submissions cannot manufacture time.
f.run('showHint();renderQuestion(hintLevel)');assert.equal(f.run('activeTime()'),30000);assert.equal(f.run('session.clockStarted'),null);
f.run('show("home")');f.advance(600000);f.run('show("learn");renderQuestion(hintLevel)');f.advance(30000);
assert.equal(f.run('activeTime()'),30000);
f.node('answer').value='';await f.run('gradeCurrent(false)');assert.equal(f.run('session.clockStarted'),null);assert.equal(f.run('session.results.length'),0);
f.node('answer').value='더 길게 입력한 의견 문장';f.run('checkpointSession()');

// Closing a timed-out unanswered task retains zero allowance and the input.
const saved=JSON.parse(f.run('JSON.stringify(state)'));
f=fixture({saved});f.advance(3600000);await f.run('resumeLesson(child().activeLesson)');
assert.equal(f.run('activeTime()'),30000);assert.equal(f.run('session.clockStarted'),null);
assert.equal(f.node('answer').value,'더 길게 입력한 의견 문장');assert.equal(f.run('current'),0);

// A draft saved by the previous version resumes with its reduced allowance.
const beforeUpgrade=fixture();beforeUpgrade.node('answer').value='이어 쓰던 의견 문장';
beforeUpgrade.advance(20000);beforeUpgrade.run('checkpointSession()');
const legacySaved=JSON.parse(beforeUpgrade.run('JSON.stringify(state)'));
legacySaved.users.ayoung.activeLesson.studyIdle.policy=legacyPolicy;
legacySaved.users.ayoung.activeLesson.studyIdle.remainingMs=40000;
const upgraded=fixture({saved:legacySaved});upgraded.advance(3600000);
await upgraded.run('resumeLesson(child().activeLesson)');
assert.equal(upgraded.run('activeTime()'),20000);
assert.equal(upgraded.run('session.studyIdle.remainingMs'),10000);
assert.equal(upgraded.node('answer').value,'이어 쓰던 의견 문장');
upgraded.advance(10000);assert.equal(upgraded.run('activeTime()'),30000);
assert.equal(upgraded.run('session.clockStarted'),null);
assert.equal(upgraded.run('child().studyHistory.entries["idle-fixture"].days["2026-10-12"].activeMs'),30000);

// A genuine submission resumes even after the idle stop; AI wait stays excluded.
f.run('hintLevel=0');f.node('answer').value='친구와 의견을 나누어 여행 계획을 정했다.';
f.setFetch(url=>{assert.equal(url,'/api/grade');f.advance(120000);return {ok:true,json:async()=>({score:1,contextSuccess:true,feedback:'정확하게 사용했어요.'})}});
await f.run('gradeCurrent(false)');assert.equal(f.run('session.results.length'),1);assert.equal(f.run('activeTime()'),30000);
assert.ok(f.run('Number.isFinite(session.clockStarted)'));assert.doesNotMatch(f.node('studyTime').textContent,/일시정지/);
f.advance(10000);assert.equal(f.run('activeTime()'),40000);
f.advance(120000);assert.equal(f.run('activeTime()'),60000,'feedback screen idling is bounded too');

// Fast objective answers preserve their real duration and restart measurement.
const mc=fixture({type:'mc_usage'});mc.advance(25000);mc.run('selectedOption=session.queue[current].opts.findIndex(o=>o.ok)');await mc.run('gradeCurrent(false)');
assert.equal(mc.run('activeTime()'),25000);assert.equal(mc.run('session.results.length'),1);
mc.advance(5000);assert.equal(mc.run('activeTime()'),30000);assert.equal(mc.requests.length,0);

// Even time passing during serialization cannot give restart extra allowance.
const coherent=fixture();coherent.advance(20000);
coherent.run('const originalNow=Date.now;let nowReads=0;Date.now=()=>originalNow()+ ++nowReads;checkpointSession()');
const cp=JSON.parse(coherent.run('JSON.stringify(child().activeLesson)'));
assert.equal(cp.activeMs,Object.values(cp.studyDays).reduce((n,d)=>n+d.activeMs,0));
assert.equal(cp.activeMs,30000-cp.studyIdle.remainingMs);

// Delayed timer delivery never inflates the minimum-25m completion test.
const short=fixture({elapsed:23*60000});short.advance(300000,false);
assert.equal(short.run('activeTime()'),23.5*60000);assert.equal(short.run('minimumStudyReached(session,activeTime())'),false);
short.run("applyResult(session.queue[current],'○','정확한 문장입니다.','',{credit:1,contextSuccess:true,hintUsed:false,revealed:false})");await short.run('nextQuestion()');
assert.equal(short.run('child().sessions.length'),0);assert.equal(short.run('session.timeAddedWords.length'),1);
assert.equal(short.run('activeTime()'),23.5*60000,'no idle padding is carried into the added word');

// Cross-profile callbacks and old completed history remain isolated.
const other=fixture();other.run('session=null;state.selected="inseong"');other.advance(180000);assert.equal(other.run('child().sessions.length'),0);assert.equal(other.run('child().activeLesson'),undefined);
const old={difficulty:2,sessions:[{date:'2026-10-11',activeMinutes:15,total:10,good:8,wrong:2}]};
assert.equal(studyHistory.dailyStudyRows(old)[0].activeMs,15*60000);
console.log('Idle study clock verified: 29s/30s boundary, legacy 60-second draft migration, delayed timer cap, automatic pause and draft save, typing/hints/repaint/reopen cannot renew time, restart retains allowance, valid typed/objective submissions resume, grading/background waits excluded, midnight split, minimum-25m continuation, profile/history isolation.');
