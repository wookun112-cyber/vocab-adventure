import assert from 'node:assert/strict';
import {AUTHORED_OWNER,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredCurriculum,authoredEntry,choiceFeedbackStats,savedChoiceFeedback} from '../api/authored-bank.js';
import {CHOICE_FEEDBACK_WORDS} from '../lib/server/choice-feedback.js';
import {calibratedWord} from '../lib/learning-model.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import handler from '../api/choice-feedback.js';
assert.deepEqual(choiceFeedbackStats,{questions:66,reasons:264,words:11});
let tested=0,sample;
for(const word of CHOICE_FEEDBACK_WORDS){
 const row=authoredCurriculum(AUTHORED_OWNER).find(r=>r.word===word);assert.ok(row);
 const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain});
 const learner={difficulty:w.band,words:{}};
 for(const type of ['mc_context','mc_usage']){
  const seen=new Set();
  for(let n=0;n<100&&seen.size<3;n++){
   const plan={id:'reason-'+n,w,type,taskDemand:'standard',review:true,answerSlot:n%5,supportLevel:0};
   const entry=authoredEntry(plan,learner,AUTHORED_OWNER);assert.ok(entry,word+'/'+type);const q=entry.question;if(seen.has(q.signature))continue;seen.add(q.signature);
   assert.equal(q.opts.filter(o=>!o.ok&&o.reason?.length>20).length,4);assert.ok(authoredQuestionValid(q,AUTHORED_OWNER));
   const copy=structuredClone(q);copy.opts.forEach(o=>delete o.reason);
   const extra=savedChoiceFeedback(copy,AUTHORED_OWNER);assert.equal(extra.length,4);
   const sorted=reasons=>reasons.map(x=>[x.text,x.reason]).sort((a,b)=>a[0].localeCompare(b[0]));
   assert.deepEqual(sorted(extra),sorted(q.opts.filter(o=>!o.ok).map(o=>({text:o.t,reason:o.reason}))));
   assert.equal(savedChoiceFeedback({...copy,ctx:copy.ctx+'changed'},AUTHORED_OWNER),null);
   assert.equal(savedChoiceFeedback(copy,'other-account'),null);
   const packet={account:AUTHORED_OWNER,plans:[{...plan,answerSlot:4}],ready:[]};
   assert.equal(hydrateFromBank(packet,learner,[entry]),1);
   assert.equal(packet.ready[0][1].opts.findIndex(o=>o.ok),4);
   for(const option of packet.ready[0][1].opts.filter(o=>!o.ok))assert.equal(option.reason,q.opts.find(o=>o.t===option.t).reason,'reason stays with text during reorder');
   if(word==='기준'&&type==='mc_context'){assert.ok(q.opts.find(o=>o.t==='목적').reason.includes('이루려는지'));sample=copy}
   tested++;
  }
 }
}
assert.equal(tested,66);
const oldFetch=globalThis.fetch;
try{
 let calls=0;globalThis.fetch=async url=>{assert.ok(String(url).endsWith('/auth/v1/user'));calls++;return {ok:true,json:async()=>({id:AUTHORED_OWNER})}};
 const res={status(n){this.code=n;return this},json(data){this.body=data;return this}};
 await handler({method:'POST',headers:{authorization:'Bearer test'},body:{question:sample}},res);
 assert.equal(res.code,200);assert.equal(res.body.reasons.length,4);assert.equal(res.body.paidGenerationCalls,0);assert.equal(calls,1);
}finally{globalThis.fetch=oldFetch}
console.log('Choice feedback PASS: 66 exact canonical questions, 264 option-specific explanations, shuffled-choice binding, old-checkpoint enrichment and tamper/account rejection, zero paid generation.');
