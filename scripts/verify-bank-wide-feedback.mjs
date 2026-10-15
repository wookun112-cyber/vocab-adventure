import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {AUTHORED_OWNER,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredCurriculum,authoredEntry,savedChoiceFeedback} from '../api/authored-bank.js';
import {OFFLINE_ROWS,savedOfflineChoiceFeedback} from '../lib/server/offline-bank-runtime.js';
import {enrichBankWideReasons,enrichStoredBankEntries,BANK_WIDE_FEEDBACK_REVISION} from '../lib/server/bank-wide-feedback.js';
import {calibratedWord,isLearningTarget} from '../lib/learning-model.js';
import {archive} from '../api/authored-bank-data.js';
import {essentialArchive} from '../lib/server/essential-bank-data.js';
import {levelFourArchive} from '../lib/server/level-four-bank-data.js';
import {levelFiveSixArchive} from '../lib/server/level-five-six-bank-data.js';
import {levelNineArchive} from '../lib/server/level-nine-bank-data.js';
const rows=[archive,essentialArchive,levelFourArchive,levelFiveSixArchive,levelNineArchive].flatMap(a=>JSON.parse(gunzipSync(Buffer.from(a,'base64'))));
const canonical=rows=>rows.map(r=>[r.word,r.definition,r.band,r.questions.map(q=>[q.type,q.slot,q.prompt,q.context,q.acceptedAnswers,q.options?.map(o=>[o.text,o.correct])])]);
const immutable=canonical(rows),stats=enrichBankWideReasons(rows);
assert.equal(stats.questions,16950);assert.equal(stats.reasons,67800);assert.deepEqual(canonical(rows),immutable);
let count=0,maxLength=0;
for(const row of rows)for(const q of row.questions.filter(q=>q.type.startsWith('mc_'))){
 const reasons=q.options.filter(o=>!o.correct).map(o=>o.reason);assert.equal(reasons.length,4);assert.equal(new Set(reasons).size,4,row.word);
 for(const o of q.options.filter(o=>!o.correct)){
  assert.ok(o.reason.length>50);assert.ok(!/undefined|\[object Object\]|NaN/.test(o.reason));
  assert.ok(o.reason.normalize('NFKC').includes(o.text.normalize('NFKC').replace(/\\n/g,' ').replace(/\s+/g,' ').trim().slice(0,100)),row.word+' selected source');
  maxLength=Math.max(maxLength,o.reason.length);
 }
 count++;
}
assert.equal(count,16950);
let currentQuestions=0,currentReasons=0;const samples=[],originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('No API calls allowed for feedback')};
try{
 for(const row of authoredCurriculum(AUTHORED_OWNER)){
  const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain});if(!isLearningTarget(w.w,w.cat,w.band))continue;
  for(const type of ['mc_context','mc_usage']){
   const seen=new Set(),learner={difficulty:w.band,words:{}};
   for(let n=0;n<100&&seen.size<3;n++){
    const plan={w,id:'full-feedback-'+n,type,review:true,taskDemand:'standard',supportLevel:0,answerSlot:n%5};
    const entry=authoredEntry(plan,learner,AUTHORED_OWNER);assert.ok(entry);const q=entry.question;if(seen.has(q.signature))continue;seen.add(q.signature);
    assert.ok(authoredQuestionValid(q,AUTHORED_OWNER));assert.equal(q.opts.filter(o=>!o.ok&&o.reason).length,4);
    const saved=structuredClone(q);saved.opts.forEach(o=>delete o.reason);saved.opts.reverse();
    const recovered=savedChoiceFeedback(saved,AUTHORED_OWNER);assert.equal(recovered.length,4);
    assert.equal(savedChoiceFeedback({...saved,ctx:saved.ctx+'changed'},AUTHORED_OWNER),null);assert.equal(savedChoiceFeedback(saved,'other-account'),null);
    for(const o of q.opts.filter(o=>!o.ok))assert.equal(recovered.find(x=>x.text===o.t)?.reason,o.reason);
    if(samples.length<20||['공리주의','가공','결과','개체군','발명','높임말'].includes(w.w)&&type==='mc_context'&&seen.size===1)samples.push({word:w.w,type,question:q.q,context:q.ctx,options:q.opts});
    currentQuestions++;currentReasons+=4;
   }
   assert.equal(seen.size,3,row.word+' canonical variant coverage');
  }
 }
 for(const row of OFFLINE_ROWS)for(const q of row.questions.filter(q=>q.type.startsWith('mc_'))){
  assert.equal(q.options.filter(o=>!o.correct&&o.reason?.length>50).length,4);
  const saved={w:{w:row.word,d:row.definition},type:q.type,q:q.prompt,ctx:q.context,opts:q.options.map(o=>({t:o.text,ok:o.correct})),authored:{word:row.word,owner:AUTHORED_OWNER,revision:row.revision,slot:q.slot}};
  assert.equal(savedOfflineChoiceFeedback(saved,AUTHORED_OWNER).length,4);assert.equal(savedOfflineChoiceFeedback({...saved,q:'changed'},AUTHORED_OWNER),null);
  currentQuestions++;currentReasons+=4;
 }
 const fixture={w:{w:'사실',d:'실제로 일어난 일',band:3},type:'mc_relation',q:'사실인 설명을 골라요.',ctx:'관찰한 내용을 기록했어요.',opts:[{t:'확인한 기록',ok:true},{t:'개인의 바람',ok:false},{t:'기분만 나타냄',ok:false},{t:'없는 일을 상상함',ok:false},{t:'확인 없이 단정함',ok:false}],validation:{policy:'vocabulary-level-fit-12.13'}};
 const before=JSON.stringify(fixture),[fixed]=enrichStoredBankEntries([{question:fixture,readerLevel:3}]);
 assert.equal(fixed.question.opts.filter(o=>!o.ok&&o.reason).length,4);assert.equal(JSON.stringify(fixture),before);assert.deepEqual(fixed.question.opts.map(o=>o.ok),fixture.opts.map(o=>o.ok));
}finally{globalThis.fetch=originalFetch}
assert.equal(currentQuestions,13590);assert.equal(currentReasons,54360);
const report={revision:BANK_WIDE_FEEDBACK_REVISION,allRegisteredQuestions:16968,allRegisteredReasons:67872,currentQuestions,currentReasons,historicalQuestions:3378,maxReasonLength:maxLength,independentHumanReview:false,paidProviderCalls:0,samples};
fs.mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../test-results/bank-wide-feedback.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,samples:undefined}));
console.log('Whole-bank feedback PASS: every registered MC slot, four distinct option explanations, question/answer invariants, exact saved-source recovery, shuffled options, zero provider requests.');
