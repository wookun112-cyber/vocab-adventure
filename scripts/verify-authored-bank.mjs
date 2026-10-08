import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {archive} from '../api/authored-bank-data.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredStats,authoredCurriculum,authoredQuestion,authoredEntry,authoredAvailability} from '../api/authored-bank.js';
import {prepare} from '../api/prepare-worker.js';
import {bankCompatible} from '../lib/question-bank.js';
import {calibratedWord,isLearningTarget} from '../lib/learning-model.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
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
// A high-priority, currently unsupplied review stays in the learner record;
// supplied reviews keep their existing due/weakness ordering and up to 10 slots.
const supplied=authoredCurriculum(AUTHORED_OWNER).filter(r=>isLearningTarget(r.word,r.domain,r.band)).slice(0,30);
const withGap={difficulty:2,levelTestCompleted:true,words:Object.fromEntries(supplied.map((r,i)=>[r.word,{seen:1,wrong:i%3,correct:0,streak:0,introducedAt:'2026-09-01',nextReviewAt:'2026-09-01'}]))};
withGap.words['전제']={seen:7,wrong:99,correct:2,streak:0,introducedAt:'2026-09-01'};
const frozen=JSON.stringify(withGap),availability=authoredAvailability(withGap,AUTHORED_OWNER);
assert.ok(availability.review.size>=20);assert.ok(!availability.review.has('전제'));
const reserve=await prepare({id:'review-supply',lease:'test',account:AUTHORED_OWNER,profile:'test',kind:'reserve',slot:1,learner:withGap,curriculum:[{word:'전제',definition:'추론의 바탕',band:5,domain:'국어'}],catalog:{}},'local',async()=>{throw Error('Unexpected quota-dependent review')},async()=>true);
assert.equal(reserve.ready.length,10);assert.equal(reserve.plans.length,10);assert.equal(reserve.newWords.length,0);assert.ok(reserve.plans.every(p=>availability.review.has(p.w.w)));assert.equal(JSON.stringify(withGap),frozen);
const held=reserve.ready.map(([,q])=>q);
const refill=await prepare({id:'latest-level',lease:'test',account:AUTHORED_OWNER,profile:'test',kind:'reserve',slot:1,learner:{...withGap,difficulty:2.2},curriculum:[],catalog:{},reserved:held},'local',async()=>{throw Error('Unexpected repeat or missing task')},async()=>true);
assert.equal(refill.ready.length,refill.plans.length);assert.equal(refill.budget.waitingForReviews,refill.plans.length===0);assert.ok(refill.ready.length<=10);assert.ok(refill.plans.filter(p=>p.w.band<2).length<=Math.floor(refill.plans.filter(p=>p.w.band>=2).length/4));assert.equal(refill.difficulty,2.2);assert.equal(refill.reserveSlot,1);
// Exhausting a supplied type retains the due vocabulary and switches to an
// unused verified type. A paused task must instead keep its original type.
const target=authoredCurriculum(AUTHORED_OWNER).find(r=>r.band===1&&isLearningTarget(r.word,r.domain,r.band));
const dueLearner={difficulty:1.7,words:{[target.word]:{seen:3,wrong:1,streak:0,nextReviewAt:'2020-01-01'}}};
const usagePlan={id:'0',w:calibratedWord({w:target.word,d:target.definition,band:target.band,cat:target.domain}),type:'mc_usage',stage:'bridge',review:true,taskDemand:'standard',supportLevel:0,answerSlot:0};
const exhausted=[];
for(let i=0;i<10;i++){const e=authoredEntry(usagePlan,dueLearner,AUTHORED_OWNER,exhausted);if(!e)break;exhausted.push(e.question)}
assert.ok(exhausted.length>0);assert.equal(authoredEntry(usagePlan,dueLearner,AUTHORED_OWNER,exhausted),null);
const fallbackPacket=makePreparedPlan(dueLearner,{},[target],AUTHORED_OWNER,'test',{reviewOnly:true});Object.assign(fallbackPacket.plans[0],usagePlan);
let fallbackCalls=0;
const varied=await prepare({id:'variation',account:AUTHORED_OWNER,profile:'test',kind:'reserve',slot:1,learner:dueLearner,curriculum:[target],catalog:{},reserved:exhausted,payload:structuredClone(fallbackPacket)},'local',async()=>{fallbackCalls++;throw Error('Unexpected variation generation')},async()=>true);
assert.equal(fallbackCalls,0);assert.equal(varied.plans[0].w.w,target.word);assert.notEqual(varied.plans[0].type,'mc_usage');assert.equal(varied.ready.length,1);assert.ok(authoredQuestionValid(varied.ready[0][1],AUTHORED_OWNER));
const pausedPacket=structuredClone(fallbackPacket);pausedPacket.resumeId='variation-paused';const pausedLearner={...dueLearner,activeLesson:{id:pausedPacket.resumeId}};
await assert.rejects(prepare({id:'paused',account:AUTHORED_OWNER,profile:'test',learner:pausedLearner,curriculum:[target],catalog:{},reserved:exhausted,payload:pausedPacket},'local',async items=>{assert.equal(items[0].type,'mc_usage');throw Error('Original task needs generation')},async()=>true),/Original task needs generation/);
assert.equal(pausedPacket.plans[0].type,'mc_usage');
const config=JSON.parse((await import('node:fs')).readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
for(const path of ['/api/authored-bank-data.js','/api/authored-bank.js'])assert.equal(config.rewrites.find(r=>r.source===path)?.destination,path.slice(0,-3));
console.log(`Authored bank verified: ${rows.length} words, 18,540 canonical slots, ${tested} runtime entries, owner isolation, truthful draft metadata, rotated correct markers, blank recall/inflection credit, example-free semantic sentence use, and five grade-matched preparations with zero AI generation or learner mutations.`);
