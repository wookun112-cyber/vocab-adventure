import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as history from '../lib/study-history.js';
import * as model from '../lib/learning-model.js';
import * as authored from '../lib/authored-policy.js';
import {authoredQuestion,authoredCurriculum} from '../api/authored-bank.js';
import {prepare} from '../api/prepare-worker.js';
import {browserQuestion} from '../lib/prepared-plan.js';
import {sentenceUseQuestion,sentenceUseQuestionValid,SENTENCE_USE_REVISION} from '../lib/sentence-use-template.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {DAILY_POLICY} from '../lib/daily-practice.js';

assert.equal(model.RETIRED_LEVEL_ONE_WORDS.length,563);
assert.equal(new Set(model.RETIRED_LEVEL_ONE_WORDS).size,563);
for(const word of model.RETIRED_LEVEL_ONE_WORDS)assert.equal(model.isLearningTarget(word,'생활',8),false,'stale high-band caches cannot revive retired words');
assert.equal(model.isLearningTarget({w:'새기초어',band:1,cat:'생활'}),false);
assert.equal(model.isRecordedVocabulary('아기'),true,'retired genuine words remain valid historical answers');
assert.equal(model.isRecordedVocabulary('상징적 장치'),false,'historical reporting still excludes non-vocabulary phrases');
assert.ok(authoredCurriculum(authored.AUTHORED_OWNER).every(w=>model.vocabularyBand(w)>=2));
assert.equal(authoredQuestion({word:'아기',band:8,type:'subjective_use',readerLevel:1.8,review:true},authored.AUTHORED_OWNER),null);

const old={w:'아기',d:'아직 어린 아이',band:1,cat:'생활'},active={w:'의견',d:'어떤 일에 대한 생각이나 판단',band:2,cat:'국어'};
const plan=(w,id)=>({id:String(id),w,type:'subjective_use',review:true,needsCard:false,stage:'use',taskDemand:'standard'});
const oldTask=model.sentenceWritingTask(old.w);
const receipt={id:'0',type:'subjective_use',prompt:oldTask.prompt,context:'',showTarget:true,options:[],answerForm:old.w,acceptedAnswers:[],hints:oldTask.hints,
 feedbackCorrect:'단어의 뜻이 드러나게 쓴 문장을 확인했어요.',signature:SENTENCE_USE_REVISION+':'+old.w,learningCard:null,semanticGraderRequired:true,allowNaturalDerivations:[],
 validation:{policy:model.QUESTION_POLICY,source:'sentence_use_template',sourceRevision:SENTENCE_USE_REVISION,schemaChecked:true,deterministic:true,aiVerified:false}};
const oldQuestion=browserQuestion(receipt,plan(old,0)),newRaw=sentenceUseQuestion({id:'2',word:active.w,definition:active.d,band:active.band,domain:active.cat,type:'subjective_use',review:true,needsCard:false});
assert.equal(sentenceUseQuestion({id:'1',word:old.w,definition:old.d,band:1,domain:old.cat,type:'subjective_use'}),null,'new stage-one templates are forbidden');
assert.equal(sentenceUseQuestionValid(oldQuestion,plan(old,0)),false);
assert.equal(sentenceUseQuestionValid(oldQuestion,plan(old,0),true),true,'exact historical receipts can be restored without issuing them again');
assert.equal(sentenceUseQuestionValid({...oldQuestion,q:'위조한 안내'},plan(old,0),true),false);
const plans=[plan(old,0),plan(old,1),plan(active,2),plan(active,3)],newQuestion=browserQuestion(newRaw,plans[2]);
const saved={version:1,engine:'11.0.0',id:'retirement-test',account:'family',profile:'guest',mode:'daily',model:model.LEARNING_MODEL,created:Date.now(),difficulty:1.8,ability:1.8,
 completionPolicy:DAILY_POLICY,reviewPolicy:model.REVIEW_POLICY,plans,ready:[[0,oldQuestion],[2,newQuestion],[3,{...newQuestion}]],target:4,baseCount:4,baseWords:[old,active],newWords:[old.w,active.w],
 results:[{word:old.w,type:'subjective_use',credit:1,contextSuccess:true,studyDate:'2026-10-11'}],nextIndex:1,pendingAnswer:'아직 제출하지 않은 아기 문장',hintLevel:1,
 introWords:[old,active],introAt:2,introCursor:1,introDone:false,activeMs:120000,studyStartedAt:Date.now()};
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture(){
 const nodes=new Map(),alerts=[],writes=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},setAttribute(){},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const ctx=vm.createContext({studyHistory:history,AbortSignal,AUTHORED_REVISION:authored.AUTHORED_REVISION,authoredQuestionValid:authored.authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,
  console,Date,Math,Map,Set,Promise,setTimeout,clearTimeout,window:{scrollTo(){}},document:{getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:s=>alerts.push(s),
  createClient:()=>({from:()=>({upsert:async row=>{writes.push(row);return {error:null}}})})});
 const run=s=>vm.runInContext(s,ctx);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 run("authUser={id:'family'};loadedAccount=authUser.id;state.selected='guest';child().difficulty=1.8;child().leagueLevel=1.8;child().words['아기']={seen:3,correct:2,wrong:1,useDays:['2026-10-11']};warmDailyQuestions=()=>{};fetchValidatedQuestions=()=>{throw Error('Retirement must not regenerate skipped questions')};");
 return {run,node,ctx,alerts};
}
const f=fixture();f.ctx.saved=structuredClone(saved);const frozen=JSON.stringify(f.ctx.saved),migrated=f.run('applyVocabularyRetirement(saved)');
assert.equal(JSON.stringify(f.ctx.saved),frozen);assert.deepEqual(JSON.parse(JSON.stringify(migrated.results)),saved.results);assert.equal(migrated.nextIndex,1);
assert.equal(migrated.plans.length,3);assert.equal(migrated.plans[0].w.w,old.w);assert.ok(migrated.plans.slice(1).every(p=>p.w.w===active.w));assert.equal(migrated.ready.length,3);
assert.equal(migrated.pendingAnswer,'');assert.equal(migrated.deferredVocabulary.currentDraft.answer,saved.pendingAnswer);assert.equal(migrated.baseWords.length,1);assert.equal(migrated.introWords.length,1);
f.ctx.migrated=migrated;assert.equal(f.run('applyVocabularyRetirement(migrated)'),migrated,'migration is idempotent');
// Fully ready active tasks can resume even when the missing retired task had
// no saved question. Original answered receipts and child statistics remain.
f.ctx.saved.engine=f.run('PREPARATION_ENGINE');f.ctx.saved.introDone=true;
f.run('child().activeLesson=saved');const oldStats=f.run("JSON.stringify(child().words['아기'])");
await f.run('resumeLesson(saved)');assert.equal(f.run('current'),1);assert.equal(f.run('session.queue[current].w.w'),active.w);assert.equal(f.run('session.results.length'),1);
assert.equal(f.node('answer').value,'');assert.equal(f.run("JSON.stringify(child().words['아기'])"),oldStats);assert.equal(f.run('child().difficulty'),1.8);
f.run('checkpointSession()');assert.equal(f.run('child().activeLesson.deferredVocabulary.currentDraft.answer'),saved.pendingAnswer);
f.run('renderVocabularyOverview()');assert.equal((f.node('vocabularyLevels').innerHTML.match(/data-vocabulary-band=/g)||[]).length,8);assert.ok(!f.node('vocabularyLevels').innerHTML.includes('data-vocabulary-band="1"'));
const journal={sessions:[]},past={lessonId:'past',mode:'daily',activeMs:120000,clockStarted:null,studyFallbackDay:'2026-10-11',results:saved.results};
history.recordStudySession(journal,past,Date.now(),true);const daily=history.dailyStudyRows(journal);assert.equal(daily[0].total,1);assert.equal(daily[0].good,1);assert.equal(daily[0].accuracy,100);assert.equal(daily[0].activeMs,120000);
const only=fixture();only.ctx.only={...structuredClone(saved),engine:only.run('PREPARATION_ENGINE'),plans:plans.slice(0,2),ready:[[0,oldQuestion]],baseWords:[old],newWords:[old.w],target:2,baseCount:2,introWords:[old],introDone:true};
only.run('child().activeLesson=only');await only.run('resumeLesson(only)');assert.equal(only.run('child().activeLesson'),null);assert.equal(only.run('child().sessions.length'),0,'retired-only lessons cannot invent a completion');assert.equal(only.run("child().retiredLessons['retirement-test'].results.length"),1);assert.equal(only.run('child().difficulty'),1.8);
const learner={difficulty:1.8,words:{아기:{seen:3,wrong:1,streak:0}}},before=JSON.stringify(learner);let generation=0;
const fresh=await prepare({id:'fresh',account:authored.AUTHORED_OWNER,profile:'test',learner,curriculum:[],catalog:{}},'test',async()=>{generation++;throw Error('Unexpected AI')},async()=>true);
assert.equal(fresh.newWords.length,5);assert.ok(fresh.plans.every(p=>p.w.band===2&&!model.isRetiredVocabulary(p.w)));assert.equal(generation,0);assert.equal(JSON.stringify(learner),before);
const reserve=await prepare({id:'reserve',account:authored.AUTHORED_OWNER,profile:'test',kind:'reserve',slot:1,learner,curriculum:[],catalog:{}},'test',async()=>{throw Error('Unexpected AI')},async()=>true);
assert.equal(reserve.plans.length,0);assert.equal(reserve.budget.waitingForReviews,true,'a retired-only history waits for real eligible learning');
console.log('Level-one retirement verified: 563 names, unseen band-one targets, stale caches, authored/templates, eight-level overview, five bank-backed stage-two new words, safe empty reserve, no generation, unchanged answered receipts/word stats/grades, incomplete-task resume, archived drafts, idempotency, historical time/accuracy and no false completion.');
