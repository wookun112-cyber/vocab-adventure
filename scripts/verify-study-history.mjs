import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {DELIVERY_POLICY,localPracticeQuestion,localSentenceQuestion} from '../lib/local-delivery.js';

const at=value=>Date.parse(value),legacy={sessions:[
 {date:'2026-10-11',mode:'daily',total:10,good:6,wrong:2,score:75,activeMinutes:12.5},
 {date:'2026-10-11',mode:'review',total:2,good:1,wrong:1,score:50,activeMinutes:3.5},
 {date:'2026-10-10',mode:'daily',total:3,good:2,wrong:1,score:67},
 {date:'2026-10-09',mode:'daily',total:4,score:75,activeMinutes:5}]};
const before=JSON.stringify(legacy),initial=studyHistory.dailyStudyRows(legacy);
assert.equal(JSON.stringify(legacy),before,'opening reports cannot rewrite learning');
assert.equal(initial[0].activeMs,16*60000);assert.equal(initial[0].total,12);assert.equal(initial[0].good,7);assert.equal(initial[0].accuracy,58,'accuracy uses full correct counts, not weighted or averaged scores');
assert.equal(initial[1].unknownTimes,1);assert.equal(initial[2].accuracy,null,'unknown counts cannot be reconstructed from weighted points');
const canonicalCopy={sessions:legacy.sessions.map(session=>Object.fromEntries(Object.entries(session).reverse())),studyHistory:studyHistory.historyFor(legacy)};
assert.equal(Object.keys(studyHistory.historyFor(canonicalCopy).entries).length,legacy.sessions.length,'JSON property order never duplicates historical sessions');
assert.equal(studyHistory.formatStudyTime(17900),'18초');assert.equal(studyHistory.formatStudyTime(179000),'2분 59초');

const learner={sessions:[]},session={lessonId:'across-midnight',mode:'daily',activeMs:0,clockStarted:at('2026-10-11T23:59:30+09:00'),studyStartedAt:at('2026-10-11T23:59:30+09:00'),results:[
 {word:'의견',credit:1,studyDate:'2026-10-11'},
 {word:'기준',credit:.5,answeredAt:at('2026-10-12T00:00:05+09:00')},
 {word:'근거',credit:0,studyDate:'2026-10-12'},
 {word:'결과',credit:1,hintUsed:true,studyDate:'2026-10-12'},
 {word:'상징적 장치',credit:1,excludedFromVocabulary:true,studyDate:'2026-10-12'}]};
const stop=at('2026-10-12T00:02:00+09:00');
studyHistory.recordStudySession(learner,session,stop);
const first=JSON.stringify(learner.studyHistory);studyHistory.recordStudySession(learner,session,stop);
assert.equal(JSON.stringify(learner.studyHistory),first,'repeated checkpoints never double count');
let rows=studyHistory.dailyStudyRows(learner);assert.equal(rows[0].activeMs,120000);assert.equal(rows[1].activeMs,30000);assert.equal(rows[0].total,3);assert.equal(rows[0].good,0);assert.equal(rows[0].partial,2);assert.equal(rows[0].wrong,1);
session.clockStarted=null;studyHistory.recordStudySession(learner,session,at('2026-10-12T01:02:00+09:00'));
assert.equal(studyHistory.studyRangeSummary(studyHistory.dailyStudyRows(learner)).activeMs,150000,'closed/background time never accumulates');
const reopened=JSON.parse(JSON.stringify(session));reopened.clockStarted=at('2026-10-12T02:00:00+09:00');
studyHistory.recordStudySession(learner,reopened,at('2026-10-12T02:01:00+09:00'),true);
rows=studyHistory.dailyStudyRows(learner);assert.equal(rows[0].activeMs,180000);assert.equal(rows[0].completed,1);assert.equal(rows[0].ongoing,0);assert.equal(Object.keys(learner.studyHistory.entries).length,1);
const immutable=JSON.stringify(learner.studyHistory);reopened.results.push({word:'의견',credit:0,studyDate:'2026-10-12'});studyHistory.recordStudySession(learner,reopened,at('2026-10-12T02:02:00+09:00'),true);
assert.equal(JSON.stringify(learner.studyHistory),immutable,'completed lesson snapshots are immutable');
assert.equal(studyHistory.dailyStudyRows(learner,{from:'2026-10-12',to:'2026-10-12'}).length,1);
assert.equal(studyHistory.dailyStudyRows(learner,{from:'2026-10-13',to:'2026-10-12'}).length,0);
const diagnostic={lessonId:'diagnostic',mode:'level',activeMs:60000,clockStarted:null,results:[{word:'의견',credit:1,studyDate:'2026-10-12'}],studyFallbackDay:'2026-10-12'};
studyHistory.recordStudySession(learner,diagnostic,stop,true);
assert.equal(studyHistory.dailyStudyRows(learner)[0].total,3);assert.equal(studyHistory.dailyStudyRows(learner,{mode:'all'})[0].total,4);assert.equal(studyHistory.dailyStudyRows(learner,{mode:'level'})[0].total,1);

const archive={sessions:Array.from({length:90},(_,i)=>({date:new Date(Date.UTC(2026,6,1+i)).toISOString().slice(0,10),mode:'daily',lessonId:'historical-'+i,total:1,good:1,wrong:0,activeMinutes:1}))};
archive.studyHistory=studyHistory.historyFor(archive);archive.sessions=archive.sessions.slice(0,60);
assert.equal(studyHistory.dailyStudyRows(archive).length,90,'archive remains after recent-session cache pruning');
const old={version:1,entries:{x:{id:'x',status:'in_progress',updatedAt:20,days:{'2026-10-11':{activeMs:5000,total:3,good:1,partial:1,wrong:1}}}}};
const stale={version:1,entries:{x:{id:'x',status:'in_progress',updatedAt:10,days:{'2026-10-11':{activeMs:7000,total:1,good:1,partial:0,wrong:0}}}}};
const combined=studyHistory.mergeStudyHistories(old,stale);assert.equal(combined.entries.x.days['2026-10-11'].total,3);assert.equal(combined.entries.x.days['2026-10-11'].activeMs,7000);
assert.deepEqual(studyHistory.mergeStudyHistories(learner.studyHistory,undefined),learner.studyHistory,'legacy client without history cannot delete it');

// Exercise real app checkpoint, pause, report filters and restart with a clock.
function fixture(seed,storage=new Map()){
 let now=at('2026-10-12T10:00:00+09:00');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const nodes=new Map(),node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{value:'',textContent:'',innerHTML:'',style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,v){if(v??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const context=vm.createContext({studyHistory,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,localSentenceQuestion,AbortSignal,console,Date:Clock,Math,Map,Set,Promise,setTimeout,clearTimeout,
  window:{scrollTo(){}},document:{hidden:false,getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},alert(){},createClient:()=>({})});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));
 run(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0]);
 if(seed){context.seed=seed;run('state=mergeState(seed)')}
 run("authUser={id:'family'};loadedAccount='family';state.selected='ayoung';cloudSave=()=>Promise.resolve();warmDailyQuestions=()=>{};");
 return {run,node,context,storage,setNow:value=>{now=at(value)}};
}
const app=fixture();
app.run(`globalThis.word={w:'의견',d:'어떤 일에 대한 생각이나 판단',band:2,cat:'국어'};
 globalThis.plan={id:'0',w:word,type:'subjective_use',review:true,stage:'use',taskDemand:'standard',firstLearning:false,needsCard:false};
 globalThis.q=localSentenceQuestion(plan);globalThis.p=createPreparation({account:'family',profile:'ayoung',mode:'daily',key:'test',snapshot:preparationSnapshot('ayoung'),created:Date.now(),plans:[plan],baseWords:[word],baseCount:1,completionPolicy:DAILY_POLICY,deliveryPolicy:DELIVERY_POLICY,practicePool:[],adopted:true},[[0,q]]);
 session={lessonId:'actual-app',profile:'ayoung',account:'family',mode:'daily',preparation:p,queue:p.queue,results:[],target:1,baseWords:[word],completionPolicy:DAILY_POLICY,activeMs:0,clockStarted:Date.now(),introDone:true};
 $('learn').classList.add('active');`);
app.setNow('2026-10-12T10:02:00+09:00');app.run(`applyResult(q,'×','다시 사용해 봐요','',{credit:0,contextSuccess:false});pauseLearningClock();checkpointSession();localSave()`);
assert.equal(app.run('child().studyHistory.entries["actual-app"].days["2026-10-12"].activeMs'),120000);
assert.equal(app.run('child().studyHistory.entries["actual-app"].days["2026-10-12"].wrong'),1);
const checkpoint=JSON.parse(app.run('JSON.stringify(state)')),resumed=fixture(checkpoint,app.storage);
resumed.setNow('2026-10-12T11:00:00+09:00');await resumed.run('resumeLesson(child().activeLesson)');
resumed.setNow('2026-10-12T11:01:00+09:00');resumed.run(`pauseLearningClock();checkpointSession();renderReport()`);
assert.equal(resumed.run('child().studyHistory.entries["actual-app"].days["2026-10-12"].activeMs'),130000,'restart keeps time and excludes the 58-minute break');
assert.equal(resumed.run('child().studyHistory.entries["actual-app"].days["2026-10-12"].total'),1,'restart keeps exactly one graded answer');
assert.match(resumed.node('studyHistory').innerHTML,/2026\.10\.12/);assert.match(resumed.node('studyHistory').innerHTML,/오답 1/);
resumed.node('studyHistoryFrom').value='2026-11-01';resumed.node('studyHistoryTo').value='2026-11-02';resumed.node('studyHistoryMode').value='study';resumed.node('studyHistoryFrom').onchange();
assert.match(resumed.node('studyHistory').innerHTML,/선택한 기간에 학습 기록이 없어요/);
resumed.node('studyHistoryAll').onclick();resumed.run("reportProfile='inseong';renderReport()");assert.match(resumed.node('studyHistory').innerHTML,/인성/);assert.doesNotMatch(resumed.node('studyHistory').innerHTML,/오답 1/,'child reports stay separate');
console.log('Dated study history verified: weighted aggregation, full/partial/wrong counts, unknown legacy data, 90-day archive, Seoul-midnight split, closed-screen exclusion, idempotent completion, diagnostic filtering, stale-client merge, actual-app checkpoints/restart and per-child date filters.');
