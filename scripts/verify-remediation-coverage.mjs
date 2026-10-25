import assert from 'node:assert/strict';
import {authoredCurriculum} from '../api/authored-bank.js';
import {OFFLINE_ROWS} from '../lib/server/offline-bank-runtime.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {approvedRemediation} from '../api/practice-pool.js';
import {localPracticeQuestion,localSentenceQuestion,deliveryQuestionValid} from '../lib/local-delivery.js';
import {passageKeys} from '../lib/prepared-plan.js';

// Every eligible target, not just a few sample levels. Fail CI on a missing bridge.
const rows=[...new Map([...authoredCurriculum(AUTHORED_OWNER),...OFFLINE_ROWS]
 .filter(r=>r.band>=2&&r.band<=9).map(r=>[r.word,r])).values()];
const bands=new Set();let checks=0;
for(const r of rows){
 bands.add(r.band);
 const plan={w:{w:r.word,d:r.definition,band:r.band,cat:r.domain},type:'mc_usage',stage:'bridge',taskDemand:'standard',review:true,practiceOnly:true,firstLearning:false,needsCard:false,supportLevel:3,sentenceCyclePolicy:'sentence-first-7-30-20261021'};
 const learner={difficulty:r.band,words:{}},q=approvedRemediation(plan,learner,AUTHORED_OWNER);
 assert.ok(q,'Missing approved MC: '+r.word);
 assert.ok(deliveryQuestionValid(q,plan,learner.difficulty,AUTHORED_OWNER),r.word);
 assert.equal(q.opts.length,5,r.word);assert.equal(q.opts.filter(o=>o.ok).length,1,r.word);
 const sentence=localSentenceQuestion({...plan,type:'subjective_use'});
 assert.ok(sentence);assert.equal(sentence.ctx,'');assert.deepEqual(sentence.acceptedAnswers,[]);
 learner.words[r.word]={problemHistory:[{signature:q.signature,context:q.ctx,options:q.opts.map(o=>o.t)}],usedPassageKeys:passageKeys(q.ctx,q.opts.map(o=>o.t))};
 const before=JSON.stringify(learner),ready=[q];
 for(let i=0;i<6;i++){
  const delivered=localPracticeQuestion({...plan,id:String(i),answerSlot:i%5},learner,[q,sentence],ready,AUTHORED_OWNER);
  assert.ok(delivered,'Exhausted retry blocked: '+r.word);
  assert.ok(delivered.type.startsWith('mc_'),'Failed writing must retain MC: '+r.word);
  assert.ok(deliveryQuestionValid(delivered,plan,learner.difficulty,AUTHORED_OWNER));
  ready.push(delivered);checks++;
 }
 assert.equal(JSON.stringify(learner),before,'Delivery mutated learner: '+r.word);
 const own=localPracticeQuestion({...plan,type:'subjective_use'},learner,[q,sentence],ready,AUTHORED_OWNER);
 assert.equal(own.type,'subjective_use');assert.equal(own.semanticGraderRequired,true);
}
assert.deepEqual([...bands].sort(),[2,3,4,5,6,7,8,9]);
console.log(`Full remediation coverage: ${rows.length} words, bands 2–9, ${checks} exhausted retries; approved MC → example-free sentence, unchanged learner.`);

// Exercise the actual recovery endpoint with authentication/provider stubs only.
const {default:handler}=await import('../api/practice-repair.js');
const row=rows.find(r=>r.word==='성향')||rows[0];
const plan={w:{w:row.word,d:row.definition,band:row.band},type:'mc_usage',stage:'bridge',taskDemand:'standard',review:true,needsCard:false,firstLearning:false,sentenceCyclePolicy:'sentence-first-7-30-20261021'};
const originalFetch=globalThis.fetch;
// Production regression: an already assigned seed target was absent from the
// current curriculum, so both the bundled MC and /practice-repair were empty.
// Keep this literal historical meaning/band independent of curriculum output.
const historical={...plan,w:{w:'증여',d:'살아 있는 사람이 재산을 대가 없이 주는 것',band:4,cat:'사회'},realtimeLevelPolicy:'realtime-level-12.16.18',supportLevel:3};
async function request(headers={},candidate=plan){
 let status,body;
 await handler({method:'POST',headers,body:{plan:candidate,readerLevel:row.band}},{status(n){status=n;return this},json(v){body=v;return this},setHeader(){}});
 return {status,body};
}
try{
 assert.equal((await request()).status,401);
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:AUTHORED_OWNER})});
 assert.equal((await request({authorization:'Bearer test'})).status,200);
 for(const type of ['mc_context','mc_usage']){
  const previous=JSON.stringify(historical),candidate={...historical,type};
  const result=await request({authorization:'Bearer test'},candidate);
  assert.equal(result.status,200,'historical seed must recover without changing meaning');
  assert.ok(deliveryQuestionValid(result.body.question,candidate,row.band,AUTHORED_OWNER));
  assert.equal(JSON.stringify(historical),previous);
  const restored=localPracticeQuestion(candidate,{difficulty:3.7,words:{}},[result.body.question],[],AUTHORED_OWNER);
  assert.ok(restored,'recovered MC must remain available after reload');
 }
 assert.equal((await request({authorization:'Bearer test'},{...plan,w:{...plan.w,d:'altered definition'}})).status,409);
 assert.equal((await request({authorization:'Bearer test'},{...plan,firstLearning:true})).status,409);
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:'another-account'})});
 assert.equal((await request({authorization:'Bearer test'})).status,409);
 globalThis.fetch=async()=>{throw Error('network unavailable')};
 assert.equal((await request({authorization:'Bearer test'})).status,503);
}finally{globalThis.fetch=originalFetch}
console.log('Recovery endpoint verified: authentication, canonical target, account isolation, no first-learning bypass, bounded failure; no paid API calls.');
