import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {essentialArchive} from '../lib/server/essential-bank-data.js';
import {ESSENTIAL_VOCABULARY,RESTORED_CORE_WORDS,LEVEL_ONE_RETIREMENT_ARCHIVE_WORDS,RETIRED_LEVEL_ONE_WORDS,GENERAL_SENSE_RESTORED_WORDS,calibratedWord,isLearningTarget,inTargetBand,selectLevelReviews} from '../lib/learning-model.js';
import {AUTHORED_REVISION,AUTHORED_LEGACY_REVISION,AUTHORED_OWNER,authoredQuestionValid} from '../lib/authored-policy.js';
import {authoredQuestion,authoredEntry,authoredStats,authoredCurriculum} from '../api/authored-bank.js';
import {bankCompatible} from '../lib/question-bank.js';
import {passageKeys} from '../lib/prepared-plan.js';
import {prepare} from '../api/prepare-worker.js';
const rows=JSON.parse(gunzipSync(Buffer.from(essentialArchive,'base64')));
const audit=JSON.parse(fs.readFileSync(new URL('../database/essential-vocabulary-20261012.json',import.meta.url),'utf8'));
assert.equal(rows.length,83);assert.equal(Object.keys(ESSENTIAL_VOCABULARY).length,83);
assert.equal(rows.reduce((n,w)=>n+w.questions.length,0),830);
assert.equal(audit.entries.filter(r=>r.category==='미등록 보완').length,66);
assert.equal(audit.entries.filter(r=>r.category==='일반 뜻 복원 검토').length,7);
assert.equal(audit.entries.filter(r=>r.category==='1단계 삭제 재검토').length,10);
assert.equal(LEVEL_ONE_RETIREMENT_ARCHIVE_WORDS.length,563);assert.equal(RETIRED_LEVEL_ONE_WORDS.length,553);
for(const word of RESTORED_CORE_WORDS){assert.equal(ESSENTIAL_VOCABULARY[word].band,2);assert.ok(isLearningTarget({w:word,band:1,cat:'국어'}));}
for(const word of ['아기','사과','상징적 장치','공공재원','밑'])assert.equal(isLearningTarget(word,'생활',8),false,word);
for(const word of GENERAL_SENSE_RESTORED_WORDS){
  const old={w:word,d:'과거의 전문 뜻',band:8,cat:'수학·논리'},frozen=JSON.stringify(old),next=calibratedWord(old);
  assert.equal(JSON.stringify(old),frozen);assert.equal(next.d,ESSENTIAL_VOCABULARY[word].d);assert.ok(isLearningTarget(next));
}
let checked=0;
for(const row of rows){
 const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain});
 assert.ok(isLearningTarget(w));assert.equal(w.d,row.definition);assert.equal(w.band,row.band);
 assert.deepEqual(row.questions.map(q=>q.type),['mc_context','mc_context','mc_context','mc_usage','mc_usage','mc_usage','subjective_recall','subjective_recall','subjective_recall','subjective_use']);
 const used=[];
 for(const type of ['mc_context','mc_usage','subjective_recall','subjective_use']){
  for(let i=0;i<(type==='subjective_use'?1:3);i++){
   const item={id:row.word+':'+type+':'+i,word:row.word,type,readerLevel:row.band,review:true,answerSlot:i%5};
   const q=authoredQuestion(item,AUTHORED_OWNER,used);assert.ok(q,`${row.word}: unavailable ${type} variant ${i}`);
   assert.equal(q.authored.revision,AUTHORED_REVISION);
   assert.ok(!passageKeys(q.context,q.options.map(o=>o.text)).some(k=>used.some(p=>passageKeys(p.context,p.options.map(o=>o.text)).includes(k))),row.word+': repeated sentence');
   if(type.startsWith('mc_')){assert.equal(q.options.length,5);assert.equal(q.options.filter(o=>o.correct).length,1);assert.equal(q.options.findIndex(o=>o.correct),i%5);}
   if(type==='subjective_recall'){
    assert.equal((q.context.match(/＿＿＿＿/gu)||[]).length,1);
    assert.ok(q.acceptedAnswers.some(a=>a.text===row.word&&a.targetRecall));
    for(const alias of row.acceptedAlternatives)assert.equal(q.acceptedAnswers.find(a=>a.text===alias)?.targetRecall,false);
   }
   if(type==='subjective_use'){assert.equal(q.context,'');assert.deepEqual(q.acceptedAnswers,[]);assert.equal(q.semanticGraderRequired,true);assert.ok(!q.hints.join('').includes(row.example));}
   const plan={id:item.id,w,type,review:true,taskDemand:'standard',answerSlot:i%5,supportLevel:0};
   const entry=authoredEntry(plan,{difficulty:row.band,words:{}},AUTHORED_OWNER);
   assert.ok(authoredQuestionValid(entry.question,AUTHORED_OWNER));assert.ok(bankCompatible(entry,plan,{difficulty:row.band},AUTHORED_OWNER));
   used.push(q);checked++;
  }
 }
}
const legacyWord=authoredCurriculum(AUTHORED_OWNER).find(r=>r.word==='의견');
const legacyPlan={id:'old-receipt',w:{w:legacyWord.word,d:legacyWord.definition,band:2,cat:legacyWord.domain},type:'mc_usage',review:true,taskDemand:'standard',answerSlot:0};
const legacy=authoredEntry(legacyPlan,{difficulty:2,words:{}},AUTHORED_OWNER).question;
assert.equal(legacy.authored.revision,AUTHORED_LEGACY_REVISION);assert.ok(authoredQuestionValid(legacy,AUTHORED_OWNER));
assert.equal(authoredQuestionValid({...legacy,validation:{...legacy.validation,sourceRevision:AUTHORED_REVISION}},AUTHORED_OWNER),false);
assert.equal(authoredQuestionValid(legacy,'another-account'),false);
for(const difficulty of [2,3.5,5,6,7.4,8,9]){
 const learner={difficulty,levelTestCompleted:true,words:{}},before=JSON.stringify(learner);let requests=0;
 const packet=await prepare({id:'essential-'+difficulty,lease:'fixture',account:AUTHORED_OWNER,profile:'test',learner,curriculum:[],catalog:{}},'fixture',async()=>{requests++;throw Error('Unexpected AI generation')},async()=>true);
 assert.equal(requests,0);assert.equal(packet.ready.length,packet.plans.length);assert.equal(packet.newWords.length,5);
 assert.ok(packet.plans.every(p=>p.review||inTargetBand(p.w,difficulty)));assert.equal(JSON.stringify(learner),before);
 if(difficulty===7.4)assert.ok(packet.plans.every(p=>!RESTORED_CORE_WORDS.includes(p.w.w)));
}
const low=RESTORED_CORE_WORDS.map(w=>({w,...ESSENTIAL_VOCABULARY[w]}));
assert.deepEqual(selectLevelReviews(low,{difficulty:7.4,words:Object.fromEntries(low.map(w=>[w.w,{seen:2,wrong:0,streak:2}]))},10),[]);
assert.equal(authoredStats.supplementalWords,83);assert.equal(authoredStats.supplementalQuestions,830);
console.log(`Essential vocabulary verified: ${checked} fixed tasks, 83 eligible words, 553 still-retired targets, natural alternative credit without target completion, legacy receipts, and 7 level-matched packets without AI generation or learner mutation.`);
