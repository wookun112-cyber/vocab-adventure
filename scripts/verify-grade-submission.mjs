import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
const source=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
const code=source.slice(source.indexOf('async function requestGrade('),source.indexOf('function applyGradedAnswer'));
function fixture(){
 let release,fetches=0,saves=0;
 const job={id:'job',payload:{answer:'original answer'}},active={gradingQueue:[job]};
 const context=vm.createContext({job,session:active,authUser:{id:'owner'},sb:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}},
  withDeadline:t=>t,AbortSignal,Date,JSON,gradeReceiptKey:()=>'',deviceStore:{get:()=>null,set:async()=>{},flush:async()=>{}},checkpointSession(){},localSave(){},
  waitForGradeSave:()=>{saves++;return new Promise(r=>{release=r})},fetch:async()=>{fetches++;return {ok:true,status:200,json:async()=>({score:1,contextSuccess:true})}}});
 vm.runInContext(code,context);
 return {context,job,call:(poll=false)=>vm.runInContext(`requestGrade(job,25000,${poll})`,context),release:v=>release(v),get fetches(){return fetches},get saves(){return saves}};
}
const pending=fixture(),task=pending.call();await new Promise(r=>setTimeout(r,0));assert.equal(pending.saves,1);assert.equal(pending.fetches,0,'AI request must wait for confirmed server save');pending.release(true);assert.equal((await task).score,1);assert.equal(pending.fetches,1);
const failed=fixture(),fail=failed.call();await new Promise(r=>setTimeout(r,0));failed.release(false);await assert.rejects(fail,e=>e.code==='grading_assignment_pending');assert.equal(failed.fetches,0);assert.equal(failed.job.payload.answer,'original answer');
const changed=fixture(),stale=changed.call();await new Promise(r=>setTimeout(r,0));vm.runInContext("authUser={id:'other'}",changed.context);changed.release(true);await assert.rejects(stale,e=>e.code==='grading_assignment_pending');assert.equal(changed.fetches,0);
const poll=fixture();assert.equal((await poll.call(true)).score,1);assert.equal(poll.saves,0,'existing provider polling must not depend on a new lesson save');
const cached=fixture();cached.job.receivedGrade={score:1};assert.equal((await cached.call()).score,1);assert.equal(cached.fetches,0);assert.equal(cached.saves,0);
console.log('Submission ordering PASS: deployed frontend waits for server save, preserves failed answer, discards account-switched submission, polls existing work without save, reuses received results. No external calls.');

// Exercise the actual production save loop: a later unrelated write stays
// unresolved while the committed answer is released to the grader immediately.
const {reliableSaveSource}=await import('./patch-daily-recovery.mjs');
let writes=[],saveLoopFinished=false;
const savedJob={id:'job-1',index:0,word:'의견',answer:'내 의견을 말했어요.',payload:{answer:'내 의견을 말했어요.'}};
const lesson={id:'lesson',gradingQueue:[savedJob],ready:[[0,{w:{w:'의견'}}]]};
const state={users:{inseong:{activeLesson:lesson}}};
const saveContext=vm.createContext({state,session:{profile:'inseong',lessonId:'lesson',gradingQueue:[savedJob]},authUser:{id:'owner'},authEpoch:1,
 cloudSavePending:false,cloudSaveTask:null,cloudBaseline:{users:{inseong:{activeLesson:{...lesson,gradingQueue:[]}}}},saving:false,
 setTimeout,clearTimeout,Promise,Set,Date,JSON,AbortSignal,console,canSaveLearning:()=>true,localSave(){},
 learningPatch:()=>[{path:['users']}],withDeadline:t=>t,sb:{rpc:()=>new Promise(resolve=>writes.push(resolve))},
 $:()=>({classList:{add(){},remove(){}},textContent:''}),document:{hidden:false},navigator:{onLine:true}});
vm.runInContext(reliableSaveSource,saveContext);saveContext.savedJob=savedJob;
const answerSaved=vm.runInContext('waitForGradeSave(savedJob)',saveContext);
await new Promise(r=>setTimeout(r,0));assert.equal(writes.length,1);
vm.runInContext('state.backgroundUpdate=1;cloudSavePending=true',saveContext);
vm.runInContext('cloudSaveTask',saveContext).then(()=>{saveLoopFinished=true});
writes[0]({data:{saved:true}});
assert.equal(await answerSaved,true);await new Promise(r=>setTimeout(r,0));
assert.equal(writes.length,2);assert.equal(saveLoopFinished,false,'grading must not wait for the second background write');
assert.equal(vm.runInContext('gradeSaveWaiters.size',saveContext),0);
writes[1]({data:{saved:true}});await vm.runInContext('cloudSaveTask',saveContext);
assert.equal(saveLoopFinished,true);
assert.equal(await vm.runInContext('waitForGradeSave(savedJob)',saveContext),true,'already committed answer needs no new write');
assert.equal(writes.length,2);
console.log('Save-drain regression PASS: first committed answer releases grading while later background save remains in flight; no extra save for committed answers.');
