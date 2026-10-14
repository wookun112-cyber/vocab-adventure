import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rows} from './build-level-nine-bank.mjs';
import {AUTHORED_OWNER,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredQuestion,authoredEntry} from '../api/authored-bank.js';
import {localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {browserQuestion,passageKeys} from '../lib/prepared-plan.js';
import {prepare} from '../api/prepare-worker.js';
import {recordLearningEvidence,researchSchedule,masteryConfirmed,copiedUsageExample} from '../lib/learning-model.js';
const receipts=[];
for(const row of rows){
 const used=[],learner={difficulty:9,words:{}},w={w:row.word,d:row.definition,band:9,cat:row.domain,source:'fixed'};
 for(const type of ['mc_context','mc_usage','subjective_recall','subjective_use'])for(let i=0;i<(type==='subjective_use'?1:3);i++){
  const item={id:type+i,word:row.word,type,readerLevel:9,review:true,band:9,definition:row.definition};
  const q=authoredQuestion(item,AUTHORED_OWNER,used);assert.ok(q,row.word+' '+type+' '+i);assert.equal(q.type,type);assert.ok(!q.context.includes('{'));
  assert.ok(!passageKeys(q.context,q.options.map(o=>o.text)).some(k=>used.some(p=>passageKeys(p.context,p.options.map(o=>o.text)).includes(k))),row.word+' duplicated passage');
  used.push(q);receipts.push(browserQuestion(q,{w,type,review:true,taskDemand:'advanced'}));
 }
 const entry=authoredEntry({id:'receipt',w,type:'mc_context',review:true,taskDemand:'advanced',supportLevel:0},learner,AUTHORED_OWNER);
 assert.ok(authoredQuestionValid(entry.question,AUTHORED_OWNER));
}
const w={w:'밀도',d:'일정한 부피에 들어 있는 물질의 양을 나타내는 성질이다.',band:6,cat:'과학',source:'fixed'};
const learner={difficulty:6,words:{밀도:{seen:6,lastExposureAt:'2026-09-01',usedPassageKeys:[],problemHistory:[],useDays:['2026-09-01']}}},st=learner.words.밀도;
for(let i=0;i<3;i++){const entry=authoredEntry({id:String(i),w,type:'subjective_recall',review:true},learner,AUTHORED_OWNER);st.usedPassageKeys.push(...passageKeys(entry.question.ctx,[]));}
const plan={id:'r',w,type:'subjective_recall',stage:'check',review:true,taskDemand:'advanced',needsCard:false,allowBankTypeFallback:true};
for(const day of ['2026-09-02','2026-09-05','2026-09-12','2026-10-12']){
 const q=localPracticeQuestion(plan,learner,[],[],AUTHORED_OWNER);assert.ok(sentenceUseQuestionValid(q,plan));assert.equal(q.showTarget,false);assert.equal(q.ctx,'');
 const rec={credit:1,targetRecall:true,practiceOnly:false,hintUsed:false,revealed:false};const evidence=recordLearningEvidence(learner,st,q,rec,day);researchSchedule(st,evidence,rec,day);
 assert.equal(evidence.unpromptedRecall,true);
}
assert.ok(masteryConfirmed(st));assert.equal(st.retention7.success,1);assert.equal(st.retention30.success,1);
const recall=localPracticeQuestion(plan,learner,[],[],AUTHORED_OWNER);assert.equal(sentenceUseQuestionValid({...recall,showTarget:true},plan),false);
assert.equal(copiedUsageExample('친구의 의견을 존중했다!',['친구의 의견을 존중했다.']),true);
assert.equal(copiedUsageExample('내 의견은 공원을 깨끗이 쓰자는 것이다.',['친구의 의견을 존중했다.']),false);
const packet=await prepare({id:'nine',kind:'daily',account:AUTHORED_OWNER,profile:'test',learner:{difficulty:9,words:{}},curriculum:[],catalog:{}},'test',async()=>{throw Error('Stage nine must not generate live questions')},async()=>true);
assert.equal(packet.ready.length,packet.plans.length);assert.ok(packet.plans.some(p=>p.w.band===9));
fs.writeFileSync('/tmp/vocab-nine-receipts.json',JSON.stringify(receipts));
fs.writeFileSync('/tmp/vocab-recall-receipt.json',JSON.stringify({question:recall,plan}));
console.log('Audit bank verified: 27/270, distinct passages, hidden-target recall after exhaustion, 7/30-day evidence, tamper rejection and a complete stage-nine packet without generation.');
