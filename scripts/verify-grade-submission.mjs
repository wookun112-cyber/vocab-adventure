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
  cloudSave:()=>{saves++;return new Promise(r=>{release=r})},fetch:async()=>{fetches++;return {ok:true,status:200,json:async()=>({score:1,contextSuccess:true})}}});
 vm.runInContext(code,context);
 return {context,job,call:(poll=false)=>vm.runInContext(`requestGrade(job,25000,${poll})`,context),release:v=>release(v),get fetches(){return fetches},get saves(){return saves}};
}
const pending=fixture(),task=pending.call();await new Promise(r=>setTimeout(r,0));assert.equal(pending.saves,1);assert.equal(pending.fetches,0,'AI request must wait for confirmed server save');pending.release(true);assert.equal((await task).score,1);assert.equal(pending.fetches,1);
const failed=fixture(),fail=failed.call();await new Promise(r=>setTimeout(r,0));failed.release(false);await assert.rejects(fail,e=>e.code==='grading_assignment_pending');assert.equal(failed.fetches,0);assert.equal(failed.job.payload.answer,'original answer');
const changed=fixture(),stale=changed.call();await new Promise(r=>setTimeout(r,0));vm.runInContext("authUser={id:'other'}",changed.context);changed.release(true);await assert.rejects(stale,e=>e.code==='grading_assignment_pending');assert.equal(changed.fetches,0);
const poll=fixture();assert.equal((await poll.call(true)).score,1);assert.equal(poll.saves,0,'existing provider polling must not depend on a new lesson save');
const cached=fixture();cached.job.receivedGrade={score:1};assert.equal((await cached.call()).score,1);assert.equal(cached.fetches,0);assert.equal(cached.saves,0);
console.log('Submission ordering PASS: deployed frontend waits for server save, preserves failed answer, discards account-switched submission, polls existing work without save, reuses received results. No external calls.');
