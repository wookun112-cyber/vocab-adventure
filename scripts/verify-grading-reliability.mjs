import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(local=new Map(),cloud=new Map(),account='family'){
 const nodes=new Map(),alerts=[],calls={reads:0,consumes:0,generation:0,topups:0,writes:[]};
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},children:[],appendChild(x){this.children.push(x)},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}});
  }
  return nodes.get(id);
 };
 let run;const deferred=[];let blockWrites=false;
 const ctx=vm.createContext({studyHistory,AbortSignal,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,authoredQuestionValid:authoredPolicy.authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,console,setTimeout,clearTimeout,Date,Math,Map,Set,Promise,
  document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>node('element-'+Math.random())},window:{scrollTo(){}},alert:x=>alerts.push(x),
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
  fetch:url=>{
   if(url==='/api/study-topups'){calls.topups++;return Promise.resolve({ok:true,json:async()=>({policy:MINIMUM_STUDY_POLICY,level:run('child().difficulty'),targets:[],exhausted:true})})}
   calls.generation++;throw Error('Resuming saved base questions must not use AI');
  },
  createClient:()=>({
   auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
   from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{calls.reads++;return {data:cloud.has(account)?{state:clone(cloud.get(account))}:null,error:null}}})}),upsert:async row=>{
    calls.writes.push(clone(row));if(blockWrites)await new Promise(resolve=>deferred.push(resolve));
    cloud.set(row.user_id,clone(row.state));return {error:null};
   }}),
   rpc:async(name,args)=>{
    if(name==='save_learning_patch'){
     if(blockWrites)await new Promise(resolve=>deferred.push(resolve));
     const state=clone(cloud.get(account));
     for(const op of args.p_operations){
      let target=state;for(const part of op.path.slice(0,-1))target=target[part];
      const key=op.path.at(-1),exists=Object.hasOwn(target,key);
      if(!op.remove&&exists&&JSON.stringify(target[key])===JSON.stringify(op.value))continue;
      if(exists!==op.exists||exists&&JSON.stringify(target[key])!==JSON.stringify(op.before))return {data:{conflict:true,path:op.path},error:null};
      if(op.remove)delete target[key];else target[key]=clone(op.value);
     }
     calls.writes.push({user_id:account,state:clone(state)});cloud.set(account,state);return {data:{saved:true},error:null};
    }
    if(name==='consume_prepared_lesson'){calls.consumes++;return {data:true,error:null}}
    if(!['get_prepared_lesson','ensure_prepared_lesson'].includes(name))throw Error('Unexpected RPC '+name);
    calls.reads++;return {data:run('typeof recoveryRemote==="undefined"?makeRemoteLesson():recoveryRemote'),error:null};
   }
  })
 });
 run=code=>vm.runInContext(code,ctx);run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 run(`state.selected='guest';authUser={id:${JSON.stringify(account)}};loadedAccount=authUser.id;
  globalThis.makeRemoteLesson=()=>{
   const newWords=SEED_WORDS.filter(w=>isLearningTarget(w.w,w.cat,w.band)&&inTargetBand(w,child().difficulty)).slice(0,5),plans=assignScenarios(makeQuestionPlan(newWords,[],20,'daily'));
   const ready=plans.map((p,i)=>[i,{w:p.w,type:p.type,label:'문맥',q:'빈칸을 채우세요.',ctx:'기록'+i+'를 읽고 새로운 상황'+i+'의 ＿＿＿＿를 살폈어요.',open:p.type.startsWith('subjective_'),hideWord:true,showTarget:false,
    opts:p.type.startsWith('mc_')?[{t:p.w.w,ok:true},...['가나다','라마바','사아자','차카타'].map(t=>({t,ok:false}))]:[],acceptedAnswers:[p.w.w],hints:['상황의 단서를 살펴보세요.','앞뒤 문장을 함께 살펴보세요.'],feedbackCorrect:'문맥에 맞는 말이에요.',signature:'새 상황'+i,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}}]);
   return {id:'job-'+state.selected,status:'ready',payload:{selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:PREPARATION_ENGINE,created:Date.now(),account:authUser.id,profile:state.selected,mode:'daily',snapshot:preparationSnapshot(state.selected),difficulty:child().difficulty,newWords:newWords.map(w=>w.w),baseWords:newWords,plans,ready}};
  };
 `);
 run("getPreparation=async()=>{const remote=typeof recoveryRemote==='undefined'?makeRemoteLesson():recoveryRemote;const blocked=serverPreparationError(remote);if(blocked)throw blocked;return createServerPreparation({...remote.payload,key:preparationKey('daily'),serverId:remote.id},remote.payload.ready)}");
 return {run,ctx,node,alerts,calls,local,cloud,block(){blockWrites=true},release(){blockWrites=false;deferred.splice(0).forEach(resolve=>resolve())}};
}

// Actual app transitions under simulated network failure, no paid calls.
const f=fixture();await f.run('buildSession()');await flush();
f.run(`session.queue[current]={...session.queue[current],type:'subjective_use',open:true,showTarget:true,opts:[]};session.preparation.plans[current].type='subjective_use';session.preparation.ready.set(current,session.queue[current]);renderQuestion();`);
f.node('answer').value='나는 친구의 의견을 듣고 계획을 바꾸었다.';
const seenBefore=f.run('wordState(session.queue[current].w.w).seen');
f.ctx.fetch=async()=>{throw Error('offline')};
await f.run('gradeCurrent(false)');
assert.equal(f.run('session.gradingQueue.length'),1);
assert.equal(f.run('session.results[0].gradingPending'),true);
assert.equal(f.run('wordState(session.queue[0].w.w).seen'),seenBefore,'pending is not a wrong answer');
assert.equal(f.run('session.gradingQueue[0].answer'),f.node('answer').value);
await f.run('cloudSave()');
const restarted=fixture(f.local,f.cloud);await restarted.run('cloudLoad()');await restarted.run('buildSession()');
assert.equal(restarted.run('session.gradingQueue.length'),1,'queue survives restart');
assert.equal(restarted.run('current>=1'),true,'other questions remain available');
let calls=0;restarted.ctx.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({score:1,contextSuccess:true,targetRecall:false,feedback:'뜻에 맞게 썼어요.',normalizedAnswer:'나는 친구의 의견을 듣고 계획을 바꾸었다.',exampleAnswer:'나는 친구의 의견을 듣고 계획을 바꾸었다.'})}};
await restarted.run('processGradingQueue(session,true)');
assert.equal(restarted.run('session.gradingQueue[0].status'),'ready');
const index=restarted.run('session.preparation.plans.findIndex(p=>p.deferredGradeId===session.gradingQueue[0].id)');
// Advance the fixture cursor to the delivered feedback without fabricating learning credit.
restarted.run(`while(session.results.length<${index})session.results.push({excludedFromVocabulary:true,credit:null});current=${index};renderQuestion();`);
assert.equal(restarted.run('session.gradingQueue[0].status'),'applied');
assert.equal(restarted.run('session.results.filter(r=>!r.excludedFromVocabulary&&r.gradingJobId).length'),1);
await restarted.run('processGradingQueue(session,true)');assert.equal(calls,1,'applied answers are not charged or counted twice');
assert.equal(restarted.run('session.results.at(-1).credit'),1);
// A copied model sentence remains practice, not completed use.
restarted.run(`current=session.results.length;const q=session.queue[0];session.queue[current]=q;session.preparation.plans[current]={...session.preparation.plans[0],id:String(current)};wordState(q.w.w).shownExamples=['나는 친구의 의견을 듣고 계획을 바꾸었다.'];applyResult(q,'○','맞는 문장이에요.','나는 친구의 의견을 듣고 계획을 바꾸었다.',{credit:1,contextSuccess:true,rawAnswer:'나는 친구의 의견을 듣고 계획을 바꾸었다.'});`);
assert.equal(restarted.run('session.results.at(-1).copiedExample'),true);
assert.equal(restarted.run('usageCompleted([session.results.at(-1)]).size'),0);
console.log('Grading recovery: persisted answer, other questions, restart, queued feedback once, and copied-example practice verified.');

// Closing while the first server request is still in flight must not lose its answer.
const flight=fixture();await flight.run('buildSession()');await flush();
flight.run(`session.queue[current]={...session.queue[current],type:'subjective_use',open:true,showTarget:true,opts:[]};session.preparation.plans[current].type='subjective_use';session.preparation.ready.set(current,session.queue[current]);renderQuestion();`);
flight.node('answer').value='나는 친구와 의견을 나누었다.';
let release;flight.ctx.fetch=()=>new Promise(resolve=>{release=resolve});
const inflight=flight.run('gradeCurrent(false)');await flush();await flight.run('cloudSave()');
const afterClose=fixture(flight.local,flight.cloud);await afterClose.run('cloudLoad()');await afterClose.run('buildSession()');
assert.equal(afterClose.run('session.gradingQueue[0].answer'),'나는 친구와 의견을 나누었다.');
assert.equal(afterClose.run('session.results.filter(r=>r.gradingPending).length'),1,'unfinished first request becomes one pending cursor record');
assert.equal(afterClose.run('current>=1'),true);
release({ok:true,status:202,json:async()=>({code:'grading_pending'})});await inflight;
console.log('Close during initial request verified: original answer recovered once and next problem remains available.');
const boundary=fixture();await boundary.run('buildSession()');await flush();
boundary.run(`session.queue[0]={...session.queue[0],type:'subjective_use',open:true,showTarget:true,opts:[]};session.preparation.plans=[{...session.preparation.plans[0],type:'subjective_use'}];session.preparation.ready=new Map([[0,session.queue[0]]]);session.queue.splice(1);session.target=1;session.preparation.baseCount=1;session.baseWords=[session.queue[0].w];session.completionPolicy=DAILY_POLICY;session.introDone=true;$('learn').classList.add('active');renderQuestion();$('answer').value='나는 친구의 의견을 존중했다.';`);
boundary.ctx.fetch=async()=>{throw Error('offline')};await boundary.run('gradeCurrent(false)');await boundary.run('nextQuestion()');
assert.equal(boundary.run('session.completed'),undefined);assert.equal(boundary.run('session.waitingForGradeResults'),true);
assert.equal(boundary.run('session.clockStarted'),null,'boundary network wait cannot add study time');
boundary.ctx.fetch=async()=>({ok:true,status:200,json:async()=>({score:1,contextSuccess:true,targetRecall:false,feedback:'좋아요',normalizedAnswer:'나는 친구의 의견을 존중했다.',exampleAnswer:'나는 친구의 의견을 존중했다.'})});
await boundary.run('processGradingQueue(session,true)');
assert.equal(boundary.run('session.gradingQueue[0].status'),'applied');assert.equal(boundary.run('session.waitingForGradeResults'),false);
console.log('All-other-work-finished boundary verified: no false completion or wait-time credit, successful retry displays feedback and resumes.');

// Normal pending responses stay on the fast result-only path, without exponential backoff.
const poll=fixture();await poll.run('buildSession()');await flush();
poll.run(`session.queue[current]={...session.queue[current],type:'subjective_use',open:true,showTarget:true,opts:[]};session.preparation.plans[current].type='subjective_use';session.preparation.ready.set(current,session.queue[current]);renderQuestion();`);
poll.node('answer').value='나는 친구의 의견을 들었다.';
const requests=[];let response={code:'grading_pending'},responseStatus=202;
poll.ctx.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,status:responseStatus,json:async()=>response}};
await poll.run('gradeCurrent(false)');
assert.equal(requests[0].pollOnly,false);
for(let i=0;i<5;i++)await poll.run('processGradingQueue(session,true)');
assert.equal(requests.filter(r=>!r.pollOnly).length,1,'pending polling must not submit another generation request');
assert.equal(poll.run('session.gradingQueue[0].attempts'),0);
assert.ok(poll.run('session.gradingQueue[0].nextRetryAt-Date.now()')<=2000);
assert.ok(poll.run('session.gradingQueue[0].nextRetryAt-Date.now()')>1500);
response={score:1,contextSuccess:true,feedback:'맞아요'};responseStatus=200;
await poll.run('processGradingQueue(session,true)');assert.equal(poll.run('session.gradingQueue[0].status'),'ready');
// Only an explicit server retryable response permits a fresh request.
const retry=fixture();await retry.run('buildSession()');await flush();
retry.run(`session.queue[current]={...session.queue[current],type:'subjective_use',open:true,opts:[]};session.preparation.plans[current].type='subjective_use';session.preparation.ready.set(current,session.queue[current]);renderQuestion();`);
retry.node('answer').value='나는 친구의 의견을 들었다.';retry.ctx.fetch=async()=>{throw Error('offline')};await retry.run('gradeCurrent(false)');
const kinds=[];retry.ctx.fetch=async(url,options)=>{const body=JSON.parse(options.body);kinds.push(body.pollOnly);return {ok:true,status:body.pollOnly?202:200,json:async()=>body.pollOnly?{code:'grading_retryable'}:{score:1,contextSuccess:true,feedback:'맞아요'}}};
await retry.run('processGradingQueue(session,true)');assert.deepEqual(kinds,[true,false]);
// Recovery errors keep the answer saved, never turn it into a wrong answer.
poll.run("session.gradingQueue[0].status='pending'");
response={code:'grading_result_recovery_required'};responseStatus=202;
const paidBefore=requests.filter(r=>!r.pollOnly).length;
await poll.run('processGradingQueue(session,true)');
assert.equal(requests.filter(r=>!r.pollOnly).length,paidBefore);
assert.equal(poll.run('session.gradingQueue[0].status'),'pending');
poll.run("session.waitingForGradeResults=true;$('learn').classList.add('active');renderGradingProgress(session)");
assert.match(poll.node('feedback').textContent,/남은 채점 1개/);
assert.match(poll.node('feedback').textContent,/복구/);
console.log('Fast queue PASS: pending checks every 2s without failure escalation, only server retryable allows submission, recovery preserves answer and accurate pending count.');

// If a provider-started submission has no recoverable cache result, the
// learner can explicitly archive its original answer without a grade or a
// second bill. Other words remain available and the original stays auditable.
const stale=fixture();await stale.run('buildSession()');await flush();
stale.run(`session.queue.splice(1);session.preparation.plans.splice(1);session.target=1;session.preparation.baseCount=1;session.baseWords=[session.queue[0].w];
 session.completionPolicy=DAILY_POLICY;session.introDone=true;
 const word=session.queue[0].w.w,submittedAt=Date.now()-180000;
 session.gradingQueue=[{id:'lost-grade-1',index:0,word,answer:'나는 의견을 나누었다.',payload:{taskType:'sentence_use',answer:'나는 의견을 나누었다.'},submittedAt,status:'pending',errorCode:'grading_result_recovery_required',nextRetryAt:Date.now()+15000}];
 session.results=[{word,type:'subjective_use',result:'채점 대기',credit:null,excludedFromVocabulary:true,gradingPending:true,gradingJobId:'lost-grade-1',answeredAt:submittedAt}];
 current=1;session.waitingForGradeResults=true;$('learn').classList.add('active');renderGradingProgress(session);`);
assert.equal(stale.node('holdPendingGrades').classList.contains('hidden'),false);
assert.match(stale.node('holdPendingGrades').textContent,/1개/);
const gradeRequests=[];
stale.ctx.fetch=async(url,opts)=>{if(url==='/api/grade')gradeRequests.push(opts);throw Error('Mock offline: no provider request allowed');};
await stale.run('holdStaleGradingQueue()');
assert.equal(stale.run('session.gradingQueue[0].status'),'needs_review');
assert.equal(stale.run('session.results[0].result'),'확인 필요');
assert.equal(stale.run('session.results[0].credit'),null);
assert.equal(stale.run('session.results[0].gradingPending'),false);
assert.equal(stale.run('child().ungradedSubmissions.length'),1);
assert.equal(stale.run('child().ungradedSubmissions[0].answer'),'나는 의견을 나누었다.');
assert.equal(stale.run('wordState(session.queue[0].w.w).seen'),0);
assert.equal(gradeRequests.length,0,'holding a missing grade never resubmits paid grading');
await stale.run('cloudSave()');
assert.equal(stale.cloud.get('family').users.guest.ungradedSubmissions.length,1,'original ungraded submission is durable in cloud');
console.log('Stale grading hold PASS: 90s wait exposed, original answer retained, no false grade/learning, cloud persistence and no extra model request.');

// Regression from the October 17 family screenshot: the lesson reached its
// final answer index, but one already-started AI grade never got a saved result.
// Restarting from Home must show the waiting screen and the manual hold control,
// not silently return to Home with only "채점 대기 1개 · 이어서 확인".
{
 const resumeGate=fixture();await resumeGate.run('buildSession()');await flush();
 resumeGate.run(`
  globalThis.navigation=[];
  show=id=>{navigation.push(id);$('learn').classList.toggle('active',id==='learn');$('home').classList.toggle('active',id==='home');};
  const heldId='stalled-grade-home-resume',old=Date.now()-180000;
  session.results=Array.from({length:session.target},(_,i)=>({word:session.preparation.plans[i].w.w,type:session.preparation.plans[i].type,result:'제외',credit:null,excludedFromVocabulary:true}));
  for(let i=1;i<session.baseWords.length;i++)session.results[i-1]={word:session.baseWords[i].w,type:'subjective_use',result:'○',credit:1,contextSuccess:true,hintUsed:false,revealed:false};
  session.results[session.target-1]={word:session.baseWords[0].w,type:'subjective_use',result:'채점 대기',credit:null,gradingPending:true,gradingJobId:heldId,excludedFromVocabulary:true,answeredAt:old};
  session.gradingQueue=[{id:heldId,index:session.target-1,word:session.baseWords[0].w,answer:'소중한 의견을 존중했다.',submittedAt:old,status:'pending',pollPolicy:'status-poll-12.16.35',errorCode:'grading_result_recovery_required',nextRetryAt:Date.now()+300000}];
  current=session.target;
  checkpointSession();localSave();
  show('home');session=null;
 `);
 const savedBefore=resumeGate.run('JSON.stringify(child().activeLesson.results)');
 await resumeGate.run("buildSession('daily')");
 assert.ok(resumeGate.run("navigation.includes('learn')"),'resume must open learner screen before final wait');
 assert.equal(resumeGate.node('learn').classList.contains('active'),true,'final grade wait must be visible');
 assert.equal(resumeGate.run('session.waitingForGradeResults'),true);
 assert.equal(resumeGate.node('holdPendingGrades').classList.contains('hidden'),false,'stalled-grade hold action must appear');
 assert.match(resumeGate.node('holdPendingGrades').textContent,/1개/);
 assert.equal(resumeGate.run('JSON.stringify(child().activeLesson.results)'),savedBefore,'pending answer remains untouched when entering wait screen');
 assert.equal(resumeGate.run('session.gradingQueue[0].status'),'pending');
 console.log('Final-cursor resume PASS: home button opens visible grade-recovery screen without altering original answers or recharging.');
}

const legacyPoll=fixture();await legacyPoll.run('buildSession()');await flush();
legacyPoll.run("session.gradingQueue=[{id:'legacy',status:'pending',index:0,errorCode:'grading_pending',nextRetryAt:Date.now()+120000,answer:'보관된 답'}];session.results=[{gradingPending:true,gradingJobId:'legacy',excludedFromVocabulary:true}]");
await legacyPoll.run('processGradingQueue(session)');
assert.ok(legacyPoll.run('session.gradingQueue[0].nextRetryAt-Date.now()')<=2000,'old normal-pending delays migrate on resume');
legacyPoll.run("session.gradingQueue[0].pollPolicy=null;session.gradingQueue[0].errorCode='ai_credit_exhausted';session.gradingQueue[0].nextRetryAt=Date.now()+300000");
await legacyPoll.run('processGradingQueue(session)');
assert.ok(legacyPoll.run('session.gradingQueue[0].nextRetryAt-Date.now()')>290000,'quota waits must not become rapid paid retries');
const exact=fixture();await exact.run('buildSession()');await flush();
exact.run("session.queue[current]={...session.queue[current],type:'subjective_recall',open:true,opts:[],acceptedAnswers:['생각']};renderQuestion()");
exact.node('answer').value='생각';exact.ctx.fetch=async()=>{throw Error('Validated exact answer must not request AI')};
await exact.run('gradeCurrent(false)');assert.equal(exact.run('session.results[0].credit'),1);
assert.equal(exact.run('session.results[0].targetRecall'),false,'approved synonym is not independent target recall');
console.log('Legacy wait migration, quota backoff preservation and exact validated synonym fast path PASS.');
