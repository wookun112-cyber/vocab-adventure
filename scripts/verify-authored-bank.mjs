import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {archive} from '../api/authored-bank-data.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredStats,authoredCurriculum,authoredQuestion,authoredEntry} from '../api/authored-bank.js';
import {prepare} from '../api/prepare-worker.js';
import {bankCompatible} from '../lib/question-bank.js';
import {calibratedWord,isLearningTarget} from '../lib/learning-model.js';
const rows=JSON.parse(gunzipSync(Buffer.from(archive,'base64')));
assert.equal(rows.length,1854);assert.equal(authoredStats.questions,18540);
assert.equal(authoredStats.independentReviewComplete,false);
assert.deepEqual(authoredCurriculum('another-account'),[]);
assert.equal(authoredQuestion({word:'의견',readerLevel:2,type:'mc_context'},'another-account'),null);
for(const word of ['근거자료','공공재원','공공임대주택','여론조작'])assert.ok(!rows.some(r=>r.word===word));
let tested=0;
for(const row of rows){
 const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain});
 const learner={difficulty:w.band,words:{}};
 for(const task of row.questions){
  for(const answerSlot of task.type.startsWith('mc_')?[0,4]:[0]){
   const plan={id:'test-'+task.slot,w,type:task.type,taskDemand:'standard',review:true,answerSlot,supportLevel:0};
   const entry=authoredEntry(plan,learner,AUTHORED_OWNER);
   assert.ok(entry);const q=entry.question;
   assert.ok(authoredQuestionValid(q,AUTHORED_OWNER));assert.equal(authoredQuestionValid(q,'another-account'),false);
   assert.equal(q.validation.aiVerified,false);assert.equal(q.authored.revision,AUTHORED_REVISION);
   assert.equal(q.w.d,row.definition);
   if(q.opts.length)assert.equal(q.opts.findIndex(o=>o.ok),answerSlot);
   if(q.type==='subjective_recall')assert.equal((q.ctx.match(/＿＿＿＿/g)||[]).length,1);
   if(q.type==='subjective_use'){assert.equal(q.ctx,'');assert.deepEqual(q.acceptedAnswers,[]);assert.equal(q.semanticGraderRequired,true)}
   if(isLearningTarget(w.w,w.cat,w.band))assert.ok(bankCompatible(entry,plan,learner,AUTHORED_OWNER));
   tested++;
  }
 }
}
const recall=authoredQuestion({id:'7',word:'마르다',readerLevel:1,type:'subjective_recall',review:true},AUTHORED_OWNER);
assert.ok(recall.acceptedAnswers.filter(a=>a.text!=='마르다').every(a=>a.targetRecall===true));
assert.equal(authoredQuestion({word:'열심히',readerLevel:7.4,type:'mc_context',firstLearning:true},AUTHORED_OWNER),null);
for(const word of ['묻다','기르다','의논하다','달성하다']){const q=authoredQuestion({id:'7',word,readerLevel:3,type:'subjective_recall',review:true},AUTHORED_OWNER);for(const a of q.acceptedAnswers)if(/질문|물어보|^키|상의|이루|이뤘|성취/.test(a.text)){assert.equal(a.credit,1);assert.equal(a.targetRecall,false)}}
const cardWord=authoredCurriculum(AUTHORED_OWNER).find(r=>r.word==='회복');assert.ok(cardWord.example.includes('회복'));
for(const difficulty of [1,2,3,7.4,8]){
 const learner={difficulty,words:{},levelTestCompleted:true};const before=JSON.stringify(learner);let calls=0;
 const packet=await prepare({id:'local',lease:'test',account:AUTHORED_OWNER,profile:'test',learner,curriculum:[],catalog:{}},'local',async()=>{calls++;throw Error('Unexpected live generation')},async()=>true);
 assert.equal(packet.ready.length,packet.plans.length);assert.equal(packet.newWords.length,5);assert.equal(calls,0);assert.equal(packet.bankRevision,AUTHORED_REVISION);assert.equal(JSON.stringify(learner),before);
 assert.ok(packet.plans.every(p=>p.w.band>=Math.max(1,Math.ceil(difficulty-1))&&p.w.band<=Math.min(9,Math.floor(difficulty+1))));
}
console.log(`Authored bank verified: ${rows.length} words, 18,540 canonical slots, ${tested} runtime entries, owner isolation, truthful draft metadata, rotated correct markers, blank recall/inflection credit, example-free semantic sentence use, and five grade-matched preparations with zero AI generation or learner mutations.`);
