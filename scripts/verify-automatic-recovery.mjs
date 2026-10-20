import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
import {reliableSaveSource} from './patch-daily-recovery.mjs';

// Execute the delivered browser code, including receipt persistence and save patches.
const effectiveSource=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
const fixtureUrl=new URL('./verify-grading-reliability.mjs',import.meta.url);
let harness=fs.readFileSync(fixtureUrl,'utf8').split('\nconst f=fixture();')[0].replace(/^import[^\n]+\n/gm,'').replaceAll('import.meta.url','fixtureUrl');
const a=harness.indexOf('const source='),b=harness.indexOf('\n',a);
harness=harness.slice(0,a)+`const source=effectiveSource.replace(/^import[^\\n]+\\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];`+harness.slice(b);
const fixture=new Function('effectiveSource','fs','vm','URL','fixtureUrl','studyHistory','DELIVERY_POLICY','localPracticeQuestion','sentenceUseQuestionValid','authoredPolicy','DAILY_POLICY','MINIMUM_STUDY_POLICY',harness+'\n;return fixture;')(
 effectiveSource,fs,vm,URL,fixtureUrl,studyHistory,DELIVERY_POLICY,localPracticeQuestion,sentenceUseQuestionValid,authoredPolicy,DAILY_POLICY,MINIMUM_STUDY_POLICY);
async function gradeFixture(waiting=true){
 const f=fixture();await f.run('buildSession()');
 f.run(`session.introDone=true;session.completionPolicy=DAILY_POLICY;session.preparation.deliveryPolicy=DELIVERY_POLICY;
 const word=session.baseWords[0].w,submittedAt=Date.now()-180000;
 session.gradingQueue=[{id:'lost',index:session.target-1,word,answer:'보관할 원래 답안',payload:{taskType:'sentence_use',answer:'보관할 원래 답안'},submittedAt,status:'pending',nextRetryAt:0}];
 session.results=Array.from({length:session.target},(_,i)=>i===session.target-1?{word,type:'subjective_use',result:'채점 대기',credit:null,excludedFromVocabulary:true,gradingPending:true,gradingJobId:'lost',answeredAt:submittedAt}:{word:session.queue[i].w.w,type:session.queue[i].type,result:'제외',credit:null,excludedFromVocabulary:true});
 current=${waiting?'session.target':'0'};session.waitingForGradeResults=${waiting};$('learn').classList.add('active');`);
 return f;
}
const lost=await gradeFixture(),requests=[];
lost.ctx.fetch=async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,status:202,json:async()=>({code:'grading_result_recovery_required'})}};
await lost.run('processGradingQueue(session,true)');
assert.equal(lost.run('session.gradingQueue[0].status'),'needs_review');
assert.equal(lost.run('child().ungradedSubmissions[0].answer'),'보관할 원래 답안');
assert.equal(lost.run('child().ungradedSubmissions[0].holdReason'),'missing_result');
assert.equal(lost.run('session.results.find(r=>r.gradingJobId==="lost").credit'),null);
assert.equal(lost.run('session.waitingForGradeResults'),false);
assert.ok(lost.run('current<session.target&&session.preparation.ready.has(current)'));
assert.equal(lost.run('wordState(session.baseWords[0].w).seen'),0,'missing result never changes mastery or accuracy');
assert.equal(lost.alerts.length,0,'automatic recovery never blocks on a modal');
assert.deepEqual(requests.map(r=>r.pollOnly),[true],'one cache check, no duplicate paid request');
await lost.run('processGradingQueue(session,true)');
assert.equal(lost.run('child().ungradedSubmissions.length'),1,'idempotent on repeated queue ticks');
await lost.run('cloudSave()');assert.equal(lost.cloud.get('family').users.guest.ungradedSubmissions[0].answer,'보관할 원래 답안');
// Resume a saved final-cursor lesson: no manual hold button is required.
const resume=await gradeFixture();resume.run('checkpointSession();localSave();session=null;');
resume.ctx.fetch=async()=>({ok:true,status:202,json:async()=>({code:'grading_result_recovery_required'})});
await resume.run("buildSession('daily')");await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(resume.run('session.gradingQueue[0].status'),'needs_review');
assert.equal(resume.run('session.waitingForGradeResults'),false);
assert.ok(resume.run('current<session.target&&session.preparation.ready.has(current)'));
// Each job needs its own fresh status check; a second old error flag is insufficient.
const multiple=await gradeFixture();multiple.run(`const other={...session.gradingQueue[0],id:'not-checked',errorCode:'grading_result_recovery_required',nextRetryAt:Date.now()+999999};session.gradingQueue.push(other);session.results[0]={...session.results.at(-1),gradingJobId:other.id};`);
multiple.ctx.fetch=async()=>({ok:true,status:202,json:async()=>({code:'grading_result_recovery_required'})});
await multiple.run('processGradingQueue(session,true)');
assert.equal(multiple.run("session.gradingQueue.find(j=>j.id==='not-checked').status"),'pending');
assert.equal(multiple.run('child().ungradedSubmissions.length'),1);
// A normal pending/temporarily inaccessible result must not be falsely declared missing.
for(const code of ['grading_pending','grading_temporarily_unavailable']){
 const f=await gradeFixture();f.ctx.fetch=async()=>({ok:true,status:202,json:async()=>({code})});
 await f.run('processGradingQueue(session,true)');assert.equal(f.run('session.gradingQueue[0].status'),'pending');
 assert.equal(f.run('child().ungradedSubmissions?.length||0'),0);
}
// Recoverable grade wins over the old error flag, and is delivered once.
const recovered=await gradeFixture();recovered.run("session.gradingQueue[0].errorCode='grading_result_recovery_required'");
recovered.ctx.fetch=async()=>({ok:true,status:200,json:async()=>({score:1,contextSuccess:true,feedback:'알맞아요.'})});
await recovered.run('processGradingQueue(session,true)');assert.ok(['ready','applied'].includes(recovered.run('session.gradingQueue[0].status')));
assert.equal(recovered.run('child().ungradedSubmissions?.length||0'),0);
// Do not navigate away from an answer the learner is writing.
const writing=await gradeFixture(false);writing.node('answer').value='아직 쓰고 있는 문장';
writing.ctx.fetch=async()=>({ok:true,status:202,json:async()=>({code:'grading_result_recovery_required'})});
await writing.run('processGradingQueue(session,true)');assert.equal(writing.run('current'),0);assert.equal(writing.node('answer').value,'아직 쓰고 있는 문장');

// The actual save writer, controlled clock: no UI action, online event or new answer.
function saves(){
 let timerId=0,fail=true,calls=0,remote=null;const timers=new Map(),pill={textContent:'',classList:{add(){},remove(){}}};
 const ctx=vm.createContext({console:{warn(){}},AbortSignal,Date,JSON,Math,Promise,
 setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},clearTimeout:id=>timers.delete(id),
 document:{hidden:false},navigator:{onLine:true},authUser:{id:'family'},authEpoch:1,loadedAccount:'family',state:{probe:1},cloudBaseline:null,cloudSavePending:false,cloudSaveTask:null,saving:false,
 canSaveLearning:()=>ctx.loadedAccount===ctx.authUser?.id,$:()=>pill,localSave(){},alert(){},setMsg(){},syncAuthControls(){},withDeadline:p=>p,
 learningPatch:(before,after)=>before.probe===after.probe?[]:[{probe:after.probe}],
 sb:{from:()=>({upsert:async row=>{calls++;if(fail)return {error:{code:'57014',message:'timeout'}};remote=structuredClone(row.state);return {error:null}}}),rpc:async()=>{calls++;if(fail)return {error:{code:'57014',message:'timeout'}};remote=structuredClone(ctx.state);return {error:null}}}});
 vm.runInContext(reliableSaveSource,ctx);
 return {ctx,timers,run:code=>vm.runInContext(code,ctx),get calls(){return calls},get remote(){return remote},set fail(v){fail=v},async tick(){const [id,t]=timers.entries().next().value;timers.delete(id);await t.fn();return t.delay}};
}
const s=saves();assert.equal(await s.run('cloudSave()'),false);assert.equal(s.timers.size,1);
assert.equal(await s.tick(),15000);assert.equal(s.timers.size,1);assert.equal(s.calls,2);
s.fail=false;assert.equal(await s.tick(),30000);assert.equal(s.remote.probe,1);assert.equal(s.timers.size,0);assert.equal(s.run('cloudSavePending'),false);
const offline=saves();await offline.run('cloudSave()');offline.ctx.navigator.onLine=false;await offline.tick();assert.equal(offline.calls,1);assert.equal(offline.timers.size,1);
offline.ctx.navigator.onLine=true;offline.ctx.document.hidden=true;await offline.tick();assert.equal(offline.calls,1);
offline.ctx.document.hidden=false;offline.fail=false;await offline.tick();assert.equal(offline.remote.probe,1);
const switched=saves();await switched.run('cloudSave()');switched.ctx.authUser={id:'other'};switched.ctx.authEpoch++;await switched.tick();assert.equal(switched.calls,1);assert.equal(switched.timers.size,0,'never retry previous family into a different account');
const auth=saves();auth.ctx.sb.from=()=>({upsert:async()=>({error:{code:'42501',message:'denied'}})});await auth.run('cloudSave()');assert.equal(auth.timers.size,0);
const conflict=saves();conflict.ctx.sb.from=()=>({upsert:async()=>({error:{code:'learning_conflict',message:'LEARNING_STATE_REGRESSION'}})});await conflict.run('cloudSave()');assert.equal(conflict.timers.size,0);
console.log('Automatic recovery PASS: missing-result hold, saved answer, cache success first, temporary failure preservation, uninterrupted draft, no duplicate AI; idle-home save backoff, offline/hidden pause, account isolation and auth/conflict stop.');

// Provider recovery metadata is durable even on 202, before a score exists.
const receipt202=fixture();await receipt202.run('buildSession()');
receipt202.run(`const j={id:'receipt-202',index:0,word:session.queue[0].w.w,answer:'원본 답안',submittedAt:Date.now(),payload:{taskType:'sentence_use',targetWord:'의견',question:'문장 만들기',answer:'원본 답안'},status:'pending'};session.gradingQueue=[j];globalThis.receiptJob=j;`);
receipt202.ctx.fetch=async()=>({ok:true,status:202,json:async()=>({code:'grading_pending',providerReceipt:'server-signed-provider-fixture'})});
await assert.rejects(receipt202.run('requestGrade(receiptJob,22000)'),error=>error.code==='grading_pending');
assert.equal(receipt202.run('session.gradingQueue[0].providerReceipt'),'server-signed-provider-fixture');
assert.equal(receipt202.run("deviceStore.get('vocab-grade-receipts-family').rows[0].providerReceipt"),'server-signed-provider-fixture');
let sent;receipt202.ctx.fetch=async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,status:202,json:async()=>({code:'grading_pending'})}};
await assert.rejects(receipt202.run('requestGrade(receiptJob,15000,true)'));assert.equal(sent.providerReceipt,'server-signed-provider-fixture');
await receipt202.run('cloudSave()');assert.equal(receipt202.cloud.get('family').users.guest.activeLesson.gradingQueue[0].providerReceipt,'server-signed-provider-fixture');
// Repeated pending cache polls must not rewrite megabytes of history every 2s.
const quiet=await gradeFixture(false);quiet.run(`session.gradingQueue[0].submittedAt=Date.now();session.gradingQueue[0].errorCode='grading_pending';globalThis.queueWrites=0;cloudSave=async()=>{queueWrites++;return true};`);
quiet.ctx.fetch=async()=>({ok:true,status:202,json:async()=>({code:'grading_pending'})});
for(let i=0;i<5;i++)await quiet.run('processGradingQueue(session,true)');
assert.equal(quiet.run('queueWrites'),1,'pending-only polls are local checkpoints, not a cloud write storm');
quiet.run('session.lastGradeCloudSaveAt=Date.now()-31000');await quiet.run('processGradingQueue(session,true)');assert.equal(quiet.run('queueWrites'),2,'30-second durability heartbeat remains');
quiet.ctx.fetch=async()=>({ok:true,status:200,json:async()=>({score:1,contextSuccess:true,feedback:'맞아요.'})});
await quiet.run('processGradingQueue(session,true)');assert.ok(quiet.run('queueWrites')>2,'new results always trigger cloud persistence');
console.log('202 provider-receipt checkpoint, subsequent GET recovery metadata, original answer persistence and cloud-poll write throttling PASS.');
