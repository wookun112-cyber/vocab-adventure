import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepare} from '../api/prepare-worker.js';

const source=fs.readFileSync(new URL('../api/prepare-worker.js',import.meta.url),'utf8');
assert.doesNotMatch(source,/\bbuildValidated\b|api\.openai\.com|OPENAI_API_KEY/);
assert.match(source,/bank_variant_unavailable/);

// A depleted bank must not trigger paid generation from the learner workflow.
const words=Array.from({length:24},(_,i)=>({
 word:'어휘'+i,definition:'문맥에서 쓰는 일반적인 뜻',band:2,domain:'국어'
}));
const job={id:'bank-only-test',kind:'daily',account:'offline-test',profile:'guest',
 learner:{difficulty:2,levelTestCompleted:false,words:{},recentProblems:[]},
 curriculum:words,catalog:{}};
const before=JSON.stringify(job.learner);
const originalFetch=globalThis.fetch;
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('Unexpected network request')};
try{
 await assert.rejects(prepare(job,'test',undefined,async()=>true),/Incomplete validated preparation/);
}finally{
 globalThis.fetch=originalFetch;
}
assert.equal(networkCalls,0,'bank shortfall must never call the network to generate questions');
assert.equal(JSON.stringify(job.learner),before,'bank shortfall must preserve learning progress');
console.log('Bank-only runtime verified: no paid generation, shortfall is reported, learning state unchanged.');
