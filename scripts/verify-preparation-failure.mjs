import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runPreparation} from '../api/prepare-worker.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
const job={id:'job',lease:'lease'},calls=[];
const rpc=async(name,args)=>{calls.push([name,args]);return true};
assert.equal(await runPreparation(job,'key',rpc,async()=>42),42);assert.equal(calls.length,0);
const failure=Error('Invalid review window');
await assert.rejects(runPreparation(job,'key',rpc,async()=>{throw failure}),e=>e===failure);
assert.deepEqual(calls,[['fail_preparation',{p_id:'job',p_key:'key',p_lease:'lease'}]]);
const log=console.error;console.error=()=>{};
try{await assert.rejects(runPreparation(job,'key',async()=>{throw Error('offline')},async()=>{throw failure}),e=>e===failure)}finally{console.error=log}
const effective=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
assert.ok(effective.includes("if(remote?.status==='failed')throw Object.assign"));
assert.ok(effective.includes("error.code==='preparation_failed'"));
console.log('Preparation failure verified: independent lease-scoped reporting, original errors preserved, effective UI exposes failed storage.');
