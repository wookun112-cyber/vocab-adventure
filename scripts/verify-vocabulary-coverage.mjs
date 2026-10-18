import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../lib/learning-model.js';
import * as studyHistory from '../lib/study-history.js';
import {DAILY_POLICY,buildDailyPlan,usageCompleted,nextUsagePlan} from '../lib/daily-practice.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {authoredCurriculum} from '../api/authored-bank.js';
import {prepare} from '../api/prepare-worker.js';
import {buildRealtimePool,buildStudyTopups} from '../api/study-topups.js';

const {COVERAGE_POLICY,calibratedWord,isCoveragePlan,lowerVocabularyBacklog,selectDailyTargets,vocabularyUsageConfirmed,recordLearningEvidence,learningDay}=model;
const day=learningDay(),word=(w,band)=>({w,band,d:'독립된 어휘의 뜻',cat:'국어'});
const small=[...Array.from({length:12},(_,i)=>word('누락어'+i,i<6?2:3)),...Array.from({length:25},(_,i)=>word('상위새말'+i,8)),word('아기',1)];
const l={difficulty:7.4,words:{}};
const before=JSON.stringify(l),first=selectDailyTargets(small,l,day);
assert.equal(JSON.stringify(l),before);assert.equal(first.newWords.length,5);assert.equal(first.coverage.words.length,2);
assert.equal(first.coverage.remaining,12);assert.ok(first.newWords.slice(0,2).every(w=>w.band===2));
l.difficulty=8.9;assert.equal(lowerVocabularyBacklog(small,l).length,12,'rapid promotion retains every lower target');
let batches=0;const completed=new Set();
while(completed.size<12){
 const selection=selectDailyTargets(small,l,model.dateAfter(day,batches)),targets=selection.newWords.filter(w=>w.coveragePolicy===COVERAGE_POLICY);
 assert.ok(targets.length>=1&&targets.length<=2,'each day introduces missed lower-band vocabulary while due reviews share slots');
 for(const w of targets){
  assert.ok(!completed.has(w.w));l.words[w.w]={seen:5,correct:5,introducedAt:day};
  assert.equal(vocabularyUsageConfirmed(l,w.w),false,'cards and choice answers are not completion');
  recordLearningEvidence(l,l.words[w.w],{w,type:'subjective_use',showTarget:true},{credit:1,contextSuccess:true,hintUsed:true});
  assert.equal(vocabularyUsageConfirmed(l,w.w),false,'hinted writing is not completion');
  recordLearningEvidence(l,l.words[w.w],{w,type:'subjective_use',showTarget:true},{credit:1,contextSuccess:false});
  assert.equal(vocabularyUsageConfirmed(l,w.w),false,'the sentence must convey the intended meaning');
  recordLearningEvidence(l,l.words[w.w],{w,type:'subjective_use',showTarget:true},{credit:1,contextSuccess:true});
  assert.equal(vocabularyUsageConfirmed(l,w.w),true);completed.add(w.w);
 }
 assert.ok(++batches<=12,'one new lower-band word daily eventually reaches every missed word');
}
assert.equal(completed.size,12);assert.ok(!completed.has('아기'));
assert.equal(lowerVocabularyBacklog(small,l).length,12,'a single correct sentence still needs long-term recall for mastery');
const started={difficulty:7.4,words:{누락어0:{seen:2,introducedAt:'2026-09-01',nextReviewAt:'2099-01-01'},누락어1:{seen:1,introducedAt:'2026-09-02'}}};
const selection=selectDailyTargets(small,started,day);
assert.equal(selection.newWords.length,5);assert.deepEqual(selection.coverage.words,['누락어1','누락어2'],'future-due old vocabulary is deferred while an unseen lower word begins');
const pending=buildDailyPlan(selection.newWords,selection.reviewWords,w=>started.words[w],started.difficulty).filter(isCoveragePlan);
assert.equal(pending.length,2);assert.ok(pending.every(p=>p.levelEligible===false&&!p.needsCard&&p.type==='subjective_use'));
assert.ok(pending.every(p=>nextUsagePlan(p,[{word:p.w.w,type:'subjective_use',credit:0}],20).coveragePolicy===COVERAGE_POLICY));
assert.equal(usageCompleted([{word:'누락어0',type:'mc_usage',credit:1,contextSuccess:true}]).size,0);
const reserve=selectDailyTargets(small,started,day,{reviewOnly:true});assert.equal(reserve.newWords.length,0);assert.equal(reserve.reviewWords.length,1,'review-only does not prematurely introduce unseen words');

// The actual worker supplies a fully bank-backed packet, and extra study can
// keep covering lower gaps without generating passages or changing records.
const catalog=authoredCurriculum(AUTHORED_OWNER).map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,source:'fixed'})).filter(model.isLearningTarget);
const base={difficulty:4,leagueLevel:4,words:Object.fromEntries(catalog.filter(w=>w.band===4).slice(0,10).map(w=>[w.w,{seen:1,introducedAt:'2026-09-01',nextReviewAt:'2026-09-02',useSuccess:1}]))};
const baseBefore=JSON.stringify(base),packet=await prepare({id:'coverage',lease:'fixture',account:AUTHORED_OWNER,profile:'ayoung',learner:base},'fixture',async()=>{throw Error('No passage generation')},async()=>true);
assert.equal(JSON.stringify(base),baseBefore);assert.equal(packet.coveragePolicy,COVERAGE_POLICY);assert.equal(packet.plans.length,15);assert.equal(packet.ready.length,15);
assert.equal(packet.newWords.length,5);assert.equal(packet.plans.filter(p=>p.review).length,10);assert.equal(packet.plans.filter(isCoveragePlan).length,2);
const expanded=buildStudyTopups({...base,difficulty:8.5},AUTHORED_OWNER,packet.baseWords.map(w=>w.w),'coverage',5,{coverage:true});
assert.equal(expanded.targets.filter(t=>isCoveragePlan(t.plan)).length,2);assert.ok(expanded.targets.every(t=>authoredQuestionValid(t.question,AUTHORED_OWNER)));

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture(saved=null){
 const nodes=new Map(),alerts=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},appendChild(){},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const context=vm.createContext({studyHistory,AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,structuredClone,AbortSignal,console,Date,Math,Promise,Map,Set,setTimeout,clearTimeout,
  document:{hidden:false,getElementById:node,createElement:()=>node('option'),querySelectorAll:()=>[]},window:{scrollTo(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:x=>alerts.push(x),createClient:()=>({}),fetch:()=>{throw Error('No question network') }});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 context.packet=structuredClone(packet);context.base=structuredClone(base);context.highPool=buildRealtimePool({...base,difficulty:8.5},AUTHORED_OWNER,packet.baseWords.map(w=>w.w));
 run(`authUser={id:AUTHORED_OWNER};loadedAccount=authUser.id;state.selected='ayoung';state.users.ayoung=Object.assign(freshChild('아영'),base);
  localSave=()=>{};cloudSave=()=>Promise.resolve();warmDailyQuestions=()=>{};renderAll=()=>{};renderReport=()=>{};renderExploration=()=>{};
  const p=createPreparation({...packet,key:'coverage-fixture',adopted:true},packet.ready);
  session={lessonId:'coverage-client',profile:'ayoung',account:AUTHORED_OWNER,mode:'daily',model:LEARNING_MODEL,completionPolicy:DAILY_POLICY,reviewPolicy:REVIEW_POLICY,difficulty:4,
   preparation:p,queue:p.queue,results:[],target:15,baseWords:packet.baseWords,newWords:packet.newWords,introWords:packet.newWords.slice(),introAt:4,introCursor:0,introDone:false,activeMs:25*60000,clockStarted:null,adaptivePool:highPool};
  current=0;initRealtimeLevel(child(),session);show('learn');renderQuestion();`);
 if(saved){context.saved=saved;run('pauseLearningClock();state=mergeState(saved);session=null')}
 return {run,node,alerts};
}
let f=fixture();
for(let i=0;i<4;i++){f.run("applyResult(session.queue[current],'○','확인','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})");if(i<3)await f.run('nextQuestion()')}
const prefix=f.run('JSON.stringify(session.results)'),lowerTargets=f.run('JSON.stringify(session.preparation.plans.filter(isCoveragePlan))');
f.run("child().difficulty=8.5;session.adaptation.currentLevel=8.5;session.adaptation.estimate=100;session.adaptation.selectionKey=null");
await f.run('nextQuestion()');
assert.equal(f.run('JSON.stringify(session.results)'),prefix);assert.equal(f.run('JSON.stringify(session.preparation.plans.filter(isCoveragePlan))'),lowerTargets);
assert.ok(f.run('session.preparation.plans.slice(4,9).some(p=>p.realtimeLevelPolicy===REALTIME_LEVEL_POLICY&&p.w.band>=8)'),'upper candidates move while coverage slots remain fixed');
let steps=4,restarted=false,failedCoverage=false;
while(!f.run('session.completed')){
 while(f.run('!session.introDone'))f.run('nextIntro()');
 const type=f.run('session.queue[current].type'),covered=f.run('isCoveragePlan(session.preparation.plans[current])');
 if(type==='subjective_use'&&covered&&!restarted){
  f.node('answer').value='계속 작성하던 문장';f.run('checkpointSession()');
  const saved=JSON.parse(f.run('JSON.stringify(state)')),answers=f.run('JSON.stringify(session.results)'),plan=f.run('JSON.stringify(session.preparation.plans[current])');
  f=fixture(saved);await f.run('buildSession()');assert.equal(f.run('JSON.stringify(session.results)'),answers);assert.equal(f.run('JSON.stringify(session.preparation.plans[current])'),plan);assert.equal(f.node('answer').value,'계속 작성하던 문장');restarted=true;
 }
 const fail=type==='subjective_use'&&covered&&!failedCoverage,credit=fail?0:1;
 if(fail)failedCoverage=true;
 const name=f.run('session.queue[current].w.w');
 f.run(`applyResult(session.queue[current],${JSON.stringify(credit?'○':'×')},'확인','내가 작성한 문장',{credit:${credit},contextSuccess:${!!credit},targetRecall:true,independent:true})`);
 if(covered){assert.equal(f.run('session.results.at(-1).levelEligible'),false);if(type!=='subjective_use'||!credit)assert.equal(f.run(`vocabularyUsageConfirmed(child(),${JSON.stringify(name)})`),false)}
 await f.run('nextQuestion()');assert.ok(++steps<60);
}
assert.ok(restarted&&failedCoverage);assert.equal(f.run('child().sessions.length'),1);assert.equal(f.run('child().activeLesson'),null);
for(const p of packet.plans.filter(isCoveragePlan))assert.equal(f.run(`vocabularyUsageConfirmed(child(),${JSON.stringify(p.w.w)})`),true);
assert.ok(!f.alerts.some(x=>x.includes('준비하지 못')));
const sql=fs.readFileSync(new URL('../database/lower-vocabulary-coverage-runtime.sql',import.meta.url),'utf8');
assert.ok(sql.includes('coverage_count<=2'));assert.ok(sql.includes('new_count<=5 and review_count<=10'));
assert.ok(sql.includes('lower_count*4<=near_count'));assert.ok(sql.includes('coverage_usage_confirmed'));
assert.ok(sql.includes("b.status='authored_draft'"));assert.ok(sql.includes('band between 2 and floor'));
assert.ok(!/update public\.app_state/i.test(sql));
console.log('Lower vocabulary coverage verified: finite complete backlog, 5-new/10-review allocation, interrupted-use priority, no stage-one revival, correct unassisted sentences required, fixed-bank topups, protected slots during 4→8.5 promotion, no grade evidence, exact answer/draft restart and completion.');
