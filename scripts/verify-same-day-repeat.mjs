import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,minimumStudyReached} from '../lib/daily-practice.js';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')
 .replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const nodes=new Map(),local=new Map(),cloud=new Map();
const alerts=[],generated=[];
const node=id=>{
 if(!nodes.has(id)){
  const flags=new Set();
  nodes.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,style:{},children:[],
   classList:{add(...x){x.forEach(k=>flags.add(k))},remove(...x){x.forEach(k=>flags.delete(k))},contains:k=>flags.has(k),toggle(k,v){if(v??!flags.has(k))flags.add(k);else flags.delete(k)}},
   appendChild(x){this.children.push(x)},closest:()=>null});
 }
 return nodes.get(id);
};
const ctx=vm.createContext({
 studyHistory,AbortSignal,structuredClone,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,
 authoredQuestionValid:authoredPolicy.authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,
 console,Date,Math,Map,Set,Promise,setTimeout,clearTimeout,alert:m=>alerts.push(m),
 document:{hidden:false,getElementById:node,querySelectorAll:()=>[],createElement:()=>node('created-'+Math.random())},
 window:{scrollTo(){}},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
 fetch:()=>{throw Error('Review-only start must not call paid server questions')},
 createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:cloud.has('family')?{state:JSON.parse(JSON.stringify(cloud.get('family')))}:null,error:null})})}),
   upsert:async row=>{cloud.set(row.user_id,JSON.parse(JSON.stringify(row.state)));return {error:null}}}),
  rpc:async(name,args)=>{
   if(name!=='save_learning_patch')throw Error('Optional review may not consume a new daily lesson: '+name);
   const current=JSON.parse(JSON.stringify(cloud.get('family')));
   for(const op of args.p_operations){
    let obj=current;for(const key of op.path.slice(0,-1))obj=obj[key];
    const last=op.path.at(-1);
    if(op.remove)delete obj[last];else obj[last]=JSON.parse(JSON.stringify(op.value));
   }
   cloud.set('family',current);return {data:{saved:true},error:null};
  }
 })
});
const run=code=>vm.runInContext(code,ctx);
run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));
run(source);
run(`
 state.selected='ayoung';authUser={id:'family'};loadedAccount=authUser.id;
 const choices=WORDS.filter(w=>isLearningTarget(w)&&inTargetBand(w,3.0)).slice(0,18);
 child().difficulty=3;child().leagueLevel=3;child().learningDays=8;
 for(const word of choices){
  const st=wordState(word.w);st.seen=1;st.introducedAt=dayOffset(-2);st.nextReviewAt=dayOffset(3);
 }
 child().lastDate=today();child().lastStudyDate=today();
 child().sessions=[{lessonId:'official-session',date:today(),mode:'daily',score:82,total:20,good:16,wrong:4,activeMinutes:30}];
 ensureCatalog=async()=>{};
 fetchValidatedQuestions=async plans=>{globalThis.calls=(globalThis.calls||0)+1;return plans.map(p=>({
  w:p.w,type:p.type,stage:p.stage,label:'문맥',q:'이 어휘의 쓰임을 확인하세요.',
  ctx:p.type==='subjective_use'?'':'학교의 수업에서 '+p.w.w+'의 뜻을 찾아 자세히 살폈어요. 이 문장을 보고 알맞은 말을 골라 보세요.',
  open:p.type.startsWith('subjective_'),showTarget:p.type==='subjective_use',
  opts:p.type.startsWith('mc_')?[{t:p.w.w,ok:true},...['가나다','라마바','사아자','차카타'].map(t=>({t,ok:false}))]:[],
  acceptedAnswers:[p.w.w],hints:[],feedbackCorrect:'맞아요.',
  signature:'extra-review-'+p.id+'-'+(globalThis.calls||0),validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}
 }))};
`);
const day=run('today()');
run('renderTodayCompletion();renderTodayCompletion(child(),"reportTodayCompletion")');
assert.equal(node('todayCompletion').classList.contains('hidden'),false,'completed primary study is clearly shown');
assert.equal(node('todayCompletionTitle').textContent,'오늘 학습을 완료 하였습니다');
assert.match(node('todayCompletionDetail').textContent,/기본 학습 1회 완료/);
assert.equal(node('reportTodayCompletion').classList.contains('hidden'),false);
assert.equal(run('todayCompletionSummary(child()).daily'),1);
assert.equal(run('todayCompletionSummary(child()).review'),0);
assert.equal(run('todayCompletionSummary(child(),dayOffset(1)).daily'),0,'completion must not carry into tomorrow');
const notFinished=run(`todayCompletionSummary({sessions:[
 {lessonId:'blocked:time-limit:'+today(),date:today(),mode:'daily',status:'time_limit'},
 {lessonId:'pending',date:today(),mode:'review',status:'in_progress'}
],studyHistory:{version:1,entries:{inprogress:{id:'inprogress',mode:'review',status:'in_progress',completedDay:today()}}}},today())`);
assert.equal(notFinished.daily+notFinished.review,0,'time cap, pending and incomplete do not show completion');

assert.equal(run("studyHistory.dailyStudyTime(child(),null,Date.now(),'daily')"),30*60*1000);
assert.equal(run("dailyLimitBlocked('daily')"),true,'official daily 30m limit remains');
assert.equal(run("dailyLimitBlocked('review')"),false,'extra review remains available after 30m');
assert.equal(run('minimumStudyReached({mode:"review",completionPolicy:DAILY_POLICY},0)'),true);
run('renderResumeButton()');
assert.match(node('startDaily').textContent,/오늘 다시 학습하기/);
assert.equal(node('startDaily').disabled,false);

await run("buildSession('daily')");
assert.equal(run('session.mode'),'review','completed main button starts review rather than re-consuming daily packet');
assert.equal(run('session.newWords.length'),0,'extra practice cannot assign a second five-new-word allowance');
assert.ok(run('session.baseWords.length')>0,'same-day review must find studied words');
assert.equal(run('session.preparation.serverId||null'),null,'extra practice is local review, not daily server queue');
assert.equal(run('session.results.length'),0);
assert.equal(run('stopAtDailyLimit()'),false,'review is not stopped by previous daily time');
assert.equal(run('session.completed'),undefined);
assert.ok((await run("session.preparation.waitFor(0,true)")),'first review question is available');
assert.ok(run('calls')>0);
await Promise.resolve();
assert.equal(run('child().lastDate'),day);
assert.equal(run('child().sessions[0].score'),82);

run(`
 session.results=session.preparation.plans.map(p=>({word:p.w.w,type:'subjective_use',result:'○',credit:1,
  contextSuccess:true,hintUsed:false,revealed:false,answeredAt:Date.now(),studyDate:today()}));
 current=session.results.length;session.activeMs=4*60*1000;session.clockStarted=null;
 session.studyDays={[today()]:{activeMs:4*60*1000,timeKnown:true}};session.studyTimeInitialized=true;
`);
assert.equal(run('sessionUsageComplete(session)'),true);
run('finishSession()');
assert.equal(run('session.completed'),true,'review can finish without imposing another 25-minute minimum');
assert.match(alerts.at(-1),/오늘 학습을 완료 하였습니다/,'completed review announces the requested exact phrase');
assert.match(alerts.at(-1),/추가 복습 완료/);
assert.equal(node('todayCompletionTitle').textContent,'오늘 학습을 완료 하였습니다');
assert.match(node('todayCompletionDetail').textContent,/기본 학습 1회 완료/);
assert.match(node('todayCompletionDetail').textContent,/추가 복습 1회 완료/);
assert.equal(node('reportTodayCompletion').classList.contains('hidden'),false,'completion is visible on report immediately after finishing');
assert.equal(node('reportTodayCompletionTitle').textContent,'오늘 학습을 완료 하였습니다');
assert.equal(run('todayCompletionSummary(child()).review'),1);

assert.equal(run('child().lastDate'),day,'official completion date is preserved');
assert.equal(run('child().learningDays'),8,'same-day extra practice does not create a new study day');
assert.equal(run('child().sessions[0].mode'),'review','voluntary study is separately recorded');
assert.equal(run("child().sessions.some(s=>s.lessonId==='official-session'&&s.score===82)"),true);
assert.equal(node('statScore').textContent,82,'main score is not replaced by the voluntary review');
assert.equal(run("studyHistory.dailyStudyTime(child(),null,Date.now(),'daily')"),30*60*1000,'extra review does not enlarge the official daily allowance');
assert.ok(run("studyHistory.dailyStudyTime(child(),null,Date.now())")>=34*60*1000,'extra practice time is still shown in full history');
assert.equal(run("exploration(child()).days[today()]?.bonus||false"),false,'extra practice cannot award the official completion bonus');
assert.equal(run("child().activeLesson"),null);
run("state.selected='inseong';renderTodayCompletion();renderTodayCompletion(child(),'reportTodayCompletion')");
assert.equal(node('todayCompletion').classList.contains('hidden'),true,'another child must not inherit completion');
assert.equal(node('reportTodayCompletion').classList.contains('hidden'),true);
run("state.selected='ayoung';renderTodayCompletion();renderTodayCompletion(child(),'reportTodayCompletion')");
assert.equal(node('todayCompletion').classList.contains('hidden'),false,'completion survives profile switching');
const persisted=run('todayCompletionSummary(JSON.parse(JSON.stringify(child())))');
assert.equal(persisted.review,1,'completion is reconstructed from saved learner records');

assert.equal(generated.length,0);

await run("buildSession('daily')");
assert.equal(run('session.mode'),'review','a second extra practice session remains possible on the same date');
assert.equal(run('session.newWords.length'),0);
assert.equal(run('session.results.length'),0,'new extra session never reuses previous answers');
assert.equal(run('child().lastDate'),day);
assert.ok(!alerts.some(x=>/문제를 준비|출제할 어휘/.test(x)),'no preparation error');
console.log('Same-day replay PASS: after official 30m cap, main button opens repeated bank-only review, preserves daily score/completion/history, no fresh-word reset, no duplicate completion reward, no second server consumption.');
