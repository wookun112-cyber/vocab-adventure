import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {
 READING_EXPOSURE_POLICY,READING_PASSAGES,chooseReadingPassage,readingPassageById,
 prepareReadingExposure,recordedExposure
} from '../lib/reading-exposure.js';
import {buildDailyPlan,usageCompleted} from '../lib/daily-practice.js';
import {vocabularyMasteryStatus,curriculumMasterySummary,syncUnfinishedUsage,masteryConfirmed,
 learningDay,calibratedWord} from '../lib/learning-model.js';
import {AUTHORED_REVISION,authoredQuestionValid,AUTHORED_OWNER} from '../lib/authored-policy.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';

assert.equal(READING_PASSAGES.length,9);
for(const passage of READING_PASSAGES){
 assert.ok(passage.passage.length>=70);
 assert.ok(passage.words.length>=5&&passage.words.length<=10);
 assert.equal(new Set(passage.words).size,passage.words.length);
 assert.ok(passage.words.every(w=>passage.passage.includes(w)),passage.id+' must include every recorded exposure word in the actual passage');
 assert.equal(passage.tasks.length,2);
 for(const task of passage.tasks){
  assert.ok(passage.words.includes(task.word));
  assert.equal(task.options.length,5);
  assert.equal(new Set(task.options).size,5);
  assert.ok(Number.isInteger(task.correct)&&task.correct>=0&&task.correct<5);
  assert.ok(task.prompt.length>=12&&task.explanation.length>=15);
 }
}
const p=chooseReadingPassage(['분석','예측'],['관찰','자료','변화','근거'],'seed');
assert.equal(p.id,'volcano','choose a passage matching the round target when available');
assert.equal(chooseReadingPassage(['분석','예측'],['관찰','자료','변화','근거'],'seed').id,p.id);
const practice=prepareReadingExposure(['분석'],['관찰'],'round-1');
assert.equal(practice.policy,READING_EXPOSURE_POLICY);
assert.equal(readingPassageById(practice.id).tasks.length,2);

const readLearner={difficulty:4,words:{}};
recordedExposure(readLearner,'관찰',learningDay());
recordedExposure(readLearner,'관찰',learningDay());
assert.equal(readLearner.readingExposure['관찰'].count,2);
assert.equal(readLearner.words['관찰'],undefined,'reading exposure cannot invent a seen-word achievement');
assert.equal(vocabularyMasteryStatus('관찰',readLearner).status,'exposed');
const ledger=curriculumMasterySummary([{w:'관찰',d:'자세히 살핌',band:2,cat:'국어'}, {w:'예측',d:'미리 판단',band:3,cat:'국어'}],readLearner);
assert.equal(ledger.totals.exposed,1);
assert.equal(ledger.totals.unseen,1);
assert.equal(ledger.totals.mastered,0);

const w=(w,i)=>({w,band:4,d:'어떤 내용을 알맞게 이해하는 말',cat:'국어',lv:4});
const newWords=Array.from({length:5},(_,i)=>w('새말'+i,i)),reviewWords=Array.from({length:10},(_,i)=>w('복습말'+i,i));
const plans=buildDailyPlan(newWords,reviewWords,()=>({}),4,{breadth:true});
assert.equal(plans.length,15);
assert.equal(plans.filter(x=>x.firstLearning).length,5);
assert.equal(plans.filter(x=>x.type==='subjective_use').length,0,'a new word does not automatically require a free sentence');
assert.ok(plans.filter(x=>x.type.startsWith('mc_')).length>=5);
assert.ok(plans.filter(x=>x.type.startsWith('subjective_')).length>=4);
assert.ok(plans.filter(x=>x.firstLearning).every(x=>x.needsCard),'unseen vocabulary is explained before its first quiz');
assert.ok(plans.filter(x=>x.firstLearning).every(x=>x.type==='mc_usage'),'new words never begin with an unexplained recall test');

const base=[w('근거'),w('주장')],a={roundPolicy:studyHistory.ROUND_POLICY,mode:'daily',baseWords:base,
 readingPractice:{...practice,completed:false},
 results:[{word:'근거',credit:1,type:'mc_usage',contextSuccess:true,hintUsed:false,revealed:false},
 {word:'주장',credit:1,type:'subjective_recall',contextSuccess:true,hintUsed:false,revealed:false}]};
assert.equal(studyHistory.roundUnfinished(a).length,0);
assert.equal(usageCompleted(a.results).size,0,'meaning success allows round completion without claiming independent sentence usage');
assert.equal(studyHistory.roundState(a,25*60*1000).shouldEnd,false,'the required reading must still be completed');
a.readingPractice.completed=true;
assert.equal(studyHistory.roundState(a,25*60*1000).shouldEnd,true);
assert.equal(studyHistory.roundState(a,25*60*1000).reason,'completed');
const forgotten={...a,results:[a.results[0],{...a.results[1],credit:0,contextSuccess:false}]};
assert.equal(studyHistory.roundUnfinished(forgotten).length,1);
assert.equal(studyHistory.roundState(forgotten,25*60*1000).shouldEnd,false);
assert.equal(studyHistory.roundState(forgotten,30*60*1000).shouldEnd,true);
assert.equal(studyHistory.roundState(forgotten,30*60*1000).reason,'time_limit');
const c={difficulty:4,words:{},unfinishedUsage:{}};
syncUnfinishedUsage(c,{...forgotten,lessonId:'breadth',studyStartedAt:Date.now(),studyFallbackDay:learningDay()});
assert.ok(c.unfinishedUsage['주장'],'unresolved meaning carries to a later round');
assert.ok(!c.unfinishedUsage['근거'],'correct meaning is not forced into an own-sentence backlog');
assert.equal(masteryConfirmed(c.words['근거']||{}),false,'passing a breadth item never confers long-term mastery');
a.roundPolicy=studyHistory.LEGACY_ROUND_POLICY;
assert.equal(studyHistory.roundUnfinished(a).length,2,'legacy sentence-gated checkpoints keep their original contract');

// Execute the current browser code with a real bank-backed prompt. Confirm the
// reading screen is a separate, resumable interlude, not a fake graded answer.
const authored=authoredCurriculum(AUTHORED_OWNER);
const word=authored.map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,source:'fixed'})).find(w=>w.band===3);
assert.ok(word);
const basePlan={...buildDailyPlan([word],[],()=>({}),3)[0],type:'mc_usage',review:true,stage:'bridge',needsCard:false,firstLearning:false};
const lesson={account:AUTHORED_OWNER,plans:[basePlan],ready:[]};
assert.equal(hydrateFromBank(lesson,{difficulty:3,words:{}},[authoredEntry(basePlan,{difficulty:3,words:{}},AUTHORED_OWNER)]),1);
const source=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const nodes=new Map(),alerts=[],requests=[];
const node=id=>{
 if(!nodes.has(id)){
  const classes=new Set();
  nodes.set(id,{id,textContent:'',innerHTML:'',value:'',disabled:false,style:{},children:[],dataset:{},
   appendChild(x){this.children.push(x)},
   closest:()=>null,
   classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}});
 }
 return nodes.get(id);
};
const screens=['learn','intro','reading','home','report'].map(node);
const context=vm.createContext({
 studyHistory,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,
 READING_EXPOSURE_POLICY,readingPassageById,prepareReadingExposure,recordedExposure,
 AbortSignal,structuredClone,console,Date,Math,Promise,Map,Set,setTimeout,clearTimeout,
 document:{hidden:false,getElementById:node,createElement:()=>({ ...node('btn-'+Math.random()),classList:node('class-'+Math.random()).classList }),querySelectorAll:s=>s==='.screen'?screens:[]},
 window:{scrollTo(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 alert:m=>alerts.push(m),fetch:async url=>{requests.push(url);throw Error('No paid or network calls allowed')},
 createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}})
});
const run=code=>vm.runInContext(code,context);
run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));
run(source);
context.lesson=structuredClone(lesson);
run("authUser={id:'"+AUTHORED_OWNER+"'};loadedAccount=authUser.id;state.selected='guest';"+
 "renderAll=()=>{};renderReport=()=>{};renderExploration=()=>{};warmDailyQuestions=()=>{};localSave=()=>{};cloudSave=()=>Promise.resolve(true);"+
 "const prep=createPreparation({account:authUser.id,profile:'guest',plans:lesson.plans,baseCount:1,baseWords:[lesson.plans[0].w],newWords:[],deliveryPolicy:DELIVERY_POLICY,practicePool:[],key:'fixture',adopted:true},lesson.ready);"+
 "session={roundPolicy:studyHistory.ROUND_POLICY,readingPractice:prepareReadingExposure(['분석'],['관찰'],'fixture-3'),lessonId:'round-breadth',profile:'guest',account:authUser.id,mode:'daily',model:LEARNING_MODEL,difficulty:3,preparation:prep,queue:prep.queue,results:[{word:lesson.plans[0].w.w,type:'mc_usage',credit:1,contextSuccess:true,result:'○',band:3,studyDate:today(),answeredAt:Date.now()}],target:1,baseWords:[lesson.plans[0].w],newWords:[],completionPolicy:DAILY_POLICY,introWords:[],introDone:true,activeMs:24*60000,clockStarted:null,studyStartedAt:Date.now(),studyFallbackDay:today(),studyDays:{[today()]:{activeMs:24*60000,timeKnown:true}}};current=1;"+
 "studyHistory.organizeStudyRounds(child(),studyHistory.historyFor(child()),session);");
const oldAnswers=run('JSON.stringify(session.results)'),oldWords=run('JSON.stringify(child().words)'),oldEvidence=run('JSON.stringify(child().learningEvidence||[])');
run('finishSession()');
assert.equal(run("document.getElementById('reading').classList.contains('active')"),true,'the next screen is reading, not an endless sentence task');
assert.equal(node('readingOptions').children.length,5);
assert.equal(run('session.readingPractice.step'),0);
const firstQuestion=readingPassageById(run('session.readingPractice.id')).tasks[0];
run('answerReadingPractice('+firstQuestion.correct+')');
assert.equal(run('session.readingPractice.answers.length'),1);
assert.equal(node('readingNext').classList.contains('hidden'),false);
assert.equal(run('JSON.stringify(session.results)'),oldAnswers,'reading score never fabricates vocabulary grading');
assert.equal(run('JSON.stringify(child().words)'),oldWords,'reading never mutates mastery stats');
run('nextReadingPractice()');
assert.equal(run('session.readingPractice.step'),1);
assert.equal(node('readingOptions').children.length,5);
run('checkpointSession()');
assert.equal(run('child().activeLesson.readingPractice.step'),1,'second question survives checkpoint');
assert.equal(run('child().activeLesson.readingPractice.answers.length'),1);
const second=readingPassageById(run('session.readingPractice.id')).tasks[1];
run('answerReadingPractice('+second.correct+')');
run("session.activeMs=25*60000;session.studyDays={[today()]:{activeMs:25*60000,timeKnown:true}};session.clockStarted=null;");
run('nextReadingPractice()');
assert.equal(run('session.readingPractice.completed'),true);
assert.equal(run('session.completed'),true,'a fully understood round finishes after 25 minutes with no forced sentence');
assert.equal(run('child().sessions.length'),1);
assert.equal(run('child().sessions[0].readingAnswered'),2);
assert.equal(run('child().sessions[0].readingCorrect'),2);
assert.equal(run('child().activeLesson'),null);
assert.equal(run('JSON.stringify(child().words)'),oldWords,'the reading passage itself does not certify usage/mastery');
assert.equal(run('JSON.stringify(child().learningEvidence||[])'),oldEvidence);
assert.equal(Object.keys(run('child().readingExposure')).length,8);
assert.deepEqual(requests,[],'reading always uses the offline approved content and creates no paid calls');
console.log('Adaptive breadth PASS: 5/10 targets, no blanket own-sentence barrier, legacy preservation, 25–30 minute honest ending, 9 reviewed passages, two visible one-at-a-time questions, resume receipt, no false grading/mastery, eight exposure records, zero API requests.');
