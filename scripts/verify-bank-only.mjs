import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AUTHORED_OWNER,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {prepare} from '../api/prepare-worker.js';
import vocabHandler from '../api/vocab.js';
import {BANK_COST_POLICY,templateOnlyQuestions,supplyRequest,deduplicateSupplyRequests,preflightNewTargets} from '../lib/server/bank-only-policy.js';
import {OFFLINE_ROWS,offlineAuthoredEntry} from '../lib/server/offline-bank-runtime.js';
import {OFFLINE_BANK_REVISION} from '../lib/server/offline-bank-supplement.js';
import {calibratedWord,isLearningTarget} from '../lib/learning-model.js';
import {makePreparedPlan,passageKeys} from '../lib/prepared-plan.js';
import {bundlePractice} from '../api/practice-pool.js';

assert.equal(OFFLINE_ROWS.length,3);
assert.deepEqual(OFFLINE_ROWS.map(r=>r.word).sort(),['객관적','예측하다','추측'].sort());
let checked=0;
for(const row of OFFLINE_ROWS){
 assert.equal(row.questions.length,10);assert.equal(new Set(row.questions.map(q=>q.slot)).size,10);
 const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain});
 assert.ok(isLearningTarget(w.w,w.cat,w.band));
 for(const q of row.questions){
  assert.ok(q.explanation.trim());
  if(q.type.startsWith('mc_')){assert.equal(q.options.length,5);assert.equal(q.options.filter(o=>o.correct).length,1);assert.equal(new Set(q.options.map(o=>o.text)).size,5)}
  if(q.type==='mc_context'||q.type==='subjective_recall')assert.equal((q.context.match(/＿＿＿＿/g)||[]).length,1);
  if(q.type==='mc_usage'){assert.equal(q.context,'');assert.ok(q.options.every(o=>!o.text.includes(w.w)))}
  if(q.type==='subjective_use'){assert.equal(q.context,'');assert.deepEqual(q.acceptedAnswers,[])}
  checked++;
 }
 const learner={difficulty:w.band,words:{[w.w]:{seen:3,introducedAt:'2026-01-01',nextReviewAt:'2026-01-01'}}};
 for(const type of ['mc_context','mc_usage','subjective_recall']){
  const p={id:'test',w,type,review:true,needsCard:false,supportLevel:0,taskDemand:'standard',answerSlot:4};
  const held=[];
  for(let i=0;i<12;i++){const e=authoredEntry(p,learner,AUTHORED_OWNER,held);if(!e)break;held.push(e.question)}
  assert.equal(authoredEntry(p,learner,AUTHORED_OWNER,held),null);
  const first=offlineAuthoredEntry(p,learner,AUTHORED_OWNER,held);
  assert.ok(first,'offline variant after canonical exhaustion: '+w.w+'/'+type);
  assert.equal(first.question.authored.revision,OFFLINE_BANK_REVISION);
  assert.ok(authoredQuestionValid(first.question,AUTHORED_OWNER));
  assert.equal(first.question.validation.aiVerified,false);
  assert.equal(offlineAuthoredEntry(p,learner,'unrelated-account',held),null);
  if(type.startsWith('mc_'))assert.equal(first.question.opts.findIndex(o=>o.ok),4);
  if(type==='subjective_recall'&&w.w==='예측하다'){
   assert.equal(first.question.answerForm,'예측');
   assert.equal(first.question.acceptedAnswers.find(a=>a.text==='예측').targetRecall,true);
   assert.equal(first.question.acceptedAnswers.find(a=>a.text==='예상').targetRecall,false);
  }
  held.push(first.question);
  const second=offlineAuthoredEntry(p,learner,AUTHORED_OWNER,held);assert.ok(second);assert.notEqual(second.question.signature,first.question.signature);
  const previous=new Set(held.flatMap(q=>passageKeys(q.ctx,(q.opts||[]).map(o=>o.t))));
  assert.ok(!passageKeys(second.question.ctx,second.question.opts.map(o=>o.t)).some(k=>previous.has(k)));
 }
}
assert.equal(checked,30);
const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
let networkCalls=0;
try{
 delete process.env.OPENAI_API_KEY;
 globalThis.fetch=async()=>{networkCalls++;throw Error('No external request permitted in bank preparation tests')};
 for(const difficulty of [1.8,2,3,4,4.4,5,5.8,6,7.5,8,9]){
  const learner={difficulty,words:{},levelTestCompleted:true},before=JSON.stringify(learner),writes=[];
  const result=await prepare({id:'local-'+difficulty,lease:'test',account:AUTHORED_OWNER,profile:'test',learner,catalog:{},curriculum:[]},'test',undefined,async(name,args)=>{writes.push(args);return true});
  assert.equal(result.bankCostPolicy,BANK_COST_POLICY);
  assert.equal(result.ready.length,result.plans.length,'complete bank-only set at '+difficulty);
  assert.equal(result.newWords.length,5);
  assert.equal(result.preparationBlocked,undefined);
  assert.equal(JSON.stringify(learner),before,'no mutation of learner evidence');
  assert.ok(writes.length>=1);
 }
 const r=OFFLINE_ROWS[0],w=calibratedWord({w:r.word,d:r.definition,band:r.band,cat:r.domain});
 const learner={difficulty:w.band,words:{[w.w]:{seen:3}},activeLesson:{id:'paused-fixture'}};
 const packet=makePreparedPlan(learner,{},[r],AUTHORED_OWNER,'test',{reviewOnly:true});
 packet.resumeId='paused-fixture';packet.plans=[{id:'0',w,type:'mc_structure',stage:'bridge',review:true,needsCard:false,taskDemand:'standard',supportLevel:0}];packet.ready=[];packet.baseWords=[w];packet.baseCount=1;packet.target=1;
 const originalPlan=JSON.stringify(packet.plans),writes=[];
 const blocked=await prepare({id:'missing-fixture',lease:'test',account:AUTHORED_OWNER,profile:'test',learner,catalog:{},curriculum:[r],payload:packet},'test',undefined,async(name,args)=>{writes.push(args);return true});
 assert.equal(blocked.preparationBlocked,'bank_supply_required');assert.equal(blocked.ready.length,0);assert.equal(writes.length,1);
 assert.equal(JSON.stringify(blocked.plans),originalPlan,'no replacement of interrupted tasks');
 assert.equal(blocked.bankSupplyRequests.length,1);assert.equal(blocked.bankSupplyRequests[0].reason,'preserve_original_interrupted_task');
 const a=supplyRequest(packet.plans[0]),b=supplyRequest({...packet.plans[0],id:'different-job'},'different-reason');
 assert.equal(a.key,b.key);assert.equal(deduplicateSupplyRequests([a,b]).length,1);
 const templates=await templateOnlyQuestions([{id:'unsupported',type:'mc_structure',word:w.w,definition:w.d,band:w.band}]);
 assert.equal(templates.length,0);assert.equal(templates.failed.length,1);
 assert.equal(networkCalls,0,'no paid generation or auth requests in prepare');
 // Only the authenticated account lookup is allowed for vocabulary expansion.
 globalThis.fetch=async url=>{assert.ok(String(url).endsWith('/auth/v1/user'));return {ok:true,json:async()=>({id:AUTHORED_OWNER})}};
 const response={status(n){this.code=n;return this},json(value){this.body=value;return this}};
 await vocabHandler({method:'POST',headers:{authorization:'Bearer test'},body:{band:4,count:12}},response);
 assert.equal(response.code,200);assert.equal(response.body.paidGenerationCalls,0);assert.ok(response.body.words.length>0);assert.ok(response.body.words.every(word=>word.source==='fixed'));
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey}
const worker=fs.readFileSync(new URL('../api/prepare-worker.js',import.meta.url),'utf8');
assert.ok(!worker.includes('buildValidated'));assert.ok(!worker.includes('api.openai.com'));
assert.ok(!fs.readFileSync(new URL('../api/vocab.js',import.meta.url),'utf8').includes('api.openai.com'));
console.log('Bank-only PASS: 11 complete level preparations, zero paid/network calls, exact paused-task preservation, deduplicated supply queue, 30 editorial slots and validated fresh alternatives, current grading unchanged.');
