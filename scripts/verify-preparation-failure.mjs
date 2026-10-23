import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runPreparation,rpc as storageRpc} from '../api/prepare-worker.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
const job={id:'job',lease:'lease'},calls=[];
const rpc=async(name,args)=>{calls.push([name,args]);return true};
assert.equal(await runPreparation(job,'key',rpc,async()=>42),42);assert.equal(calls.length,0);
const failure=Error('Invalid review window');
await assert.rejects(runPreparation(job,'key',rpc,async()=>{throw failure}),e=>e===failure);
assert.deepEqual(calls,[['report_preparation_failure',{p_id:'job',p_key:'key',p_lease:'lease',p_failure:{code:'PREPARATION_FAILED',reason:'worker_failed',stage:'prepare'}}]]);
const log=console.error;console.error=()=>{};
try{await assert.rejects(runPreparation(job,'key',async()=>{throw Error('offline')},async()=>{throw failure}),e=>e===failure)}finally{console.error=log}
const effective=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
assert.ok(effective.includes("if(remote?.status==='failed')throw Object.assign"));
assert.ok(effective.includes("error.code==='preparation_failed'"));
console.log('Preparation failure verified: independent lease-scoped reporting, original errors preserved, effective UI exposes failed storage.');

const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>({ok:false,status:400,json:async()=>({code:'P0001',message:'Invalid review window',details:'DO NOT PERSIST PRIVATE DETAIL'})});
 let caught;try{await storageRpc('save_preparation',{})}catch(e){caught=e}
 assert.deepEqual(caught.preparationFailure,{code:'P0001',reason:'review_window_invalid',stage:'save_preparation'});
 assert.ok(!JSON.stringify(caught).includes('PRIVATE DETAIL'));
 const diagnostics=[];await assert.rejects(runPreparation(job,'key',async(n,a)=>{diagnostics.push([n,a]);return true},async()=>{throw caught}));
 assert.equal(diagnostics[0][1].p_failure.reason,'review_window_invalid');
 const fallback=[];await assert.rejects(runPreparation(job,'key',async(n)=>{fallback.push(n);if(n==='report_preparation_failure')throw Error('old server');return true},async()=>{throw caught}));
 assert.deepEqual(fallback,['report_preparation_failure','fail_preparation']);
}finally{globalThis.fetch=originalFetch}
console.log('Failure diagnostics PASS: bounded storage code/stage/reason, no private DB details, exact lease RPC, backward-compatible failure transition.');

const terminalSql=fs.readFileSync(new URL('../database/preparation-terminal-status.sql',import.meta.url),'utf8');
assert.ok(terminalSql.includes('not coalesce(vocab_private.packet_complete(j.payload),false)'));
assert.ok(terminalSql.includes('get_prepared_lesson(text,uuid)')&&terminalSql.includes('ensure_prepared_lesson(text,text,boolean)'));
const diagnosticSql=fs.readFileSync(new URL('../database/preparation-failure-diagnostics.sql',import.meta.url),'utf8');
assert.ok(diagnosticSql.includes('set last_failure=failure')&&!diagnosticSql.includes('set payload='),'failure-only metadata must not masquerade as an outdated lesson payload');
