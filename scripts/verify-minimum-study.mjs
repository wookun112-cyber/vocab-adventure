import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY,MINIMUM_STUDY_MS,buildDailyPlan} from '../lib/daily-practice.js';
import {calibratedWord,inTargetBand,learningDay} from '../lib/learning-model.js';
import {authoredCurriculum,authoredEntry} from '../api/authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {prepare} from '../api/prepare-worker.js';
import topupHandler,{buildStudyTopups} from '../api/study-topups.js';

for(const difficulty of [1.8,3.5,7.4,9]){
 const learner={difficulty,words:{}},before=JSON.stringify(learner);
 const base=await prepare({id:'min-'+difficulty,lease:'test',account:AUTHORED_OWNER,profile:'guest',learner},'test',async()=>{throw Error('No AI generation')},async()=>true);
 assert.equal(JSON.stringify(learner),before);
 assert.equal(base.newWords.length,5);assert.equal(base.ready.length,base.plans.length);
 assert.equal(base.studyTopups.policy,MINIMUM_STUDY_POLICY);assert.equal(base.studyTopups.targets.length,5);
 for(const t of base.studyTopups.targets){
  assert.ok(inTargetBand(t.plan.w,difficulty));assert.ok(!base.baseWords.some(w=>w.w===t.plan.w.w));
  assert.equal(t.plan.firstLearning,true);assert.ok(t.question.learningCard.example);
  assert.ok(authoredQuestionValid(t.question,AUTHORED_OWNER));
  assert.ok(t.practicePool.some(q=>q.type==='subjective_use'&&q.semanticGraderRequired&&q.ctx===''));
 }
}
const level=3.5;
const w=authoredCurriculum(AUTHORED_OWNER).map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,source:'fixed'})).find(w=>inTargetBand(w,level));
const learner={difficulty:level,words:{[w.w]:{seen:1,introducedAt:'2026-10-01'}}};
const topups=buildStudyTopups(learner,AUTHORED_OWNER,[w.w],'client');
const basePlan={...buildDailyPlan([w],[],()=>({}),level)[0],type:'subjective_use',stage:'use',firstLearning:false,needsCard:false,review:true,taskDemand:'standard'};
const packet={account:AUTHORED_OWNER,plans:[basePlan],ready:[]};
assert.equal(hydrateFromBank(packet,learner,[authoredEntry(basePlan,learner,AUTHORED_OWNER)]),1);
const correct={word:w.w,type:'subjective_use',credit:1,contextSuccess:true,hintUsed:false,revealed:false,result:'○',band:w.band,answeredAt:Date.now(),studyDate:learningDay()};
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture(elapsed=MINIMUM_STUDY_MS-1000,saved=null){
 let now=Date.parse('2026-10-12T14:44:00+09:00');
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const nodes=new Map(),alerts=[],requests=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,textContent:'',innerHTML:'',value:'',disabled:false,style:{},appendChild(){},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const screens=['learn','intro','home','report'].map(node);
 const context=vm.createContext({studyHistory,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,AbortSignal,structuredClone,console,Date:ClockDate,Math,Promise,Map,Set,setTimeout,clearTimeout,window:{scrollTo(){}},
  document:{hidden:false,getElementById:node,createElement:()=>node('option'),querySelectorAll:s=>s==='.screen'?screens:[]},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:x=>alerts.push(x),
  createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}})});
 const run=code=>vm.runInContext(code,context);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 context.packet=structuredClone(packet);context.topups=structuredClone(topups);context.correct=correct;
 run(`authUser={id:${JSON.stringify(AUTHORED_OWNER)}};loadedAccount=authUser.id;state.selected='ayoung';child().difficulty=${level};wordState(${JSON.stringify(w.w)}).seen=1;
  renderAll=()=>{};renderReport=()=>{};renderExploration=()=>{};warmDailyQuestions=()=>{};localSave=()=>{};cloudSave=()=>Promise.resolve();
  globalThis.prep=createPreparation({account:authUser.id,profile:'ayoung',plans:packet.plans,baseWords:[packet.plans[0].w],newWords:[],key:'fixture',deliveryPolicy:DELIVERY_POLICY,practicePool:[],adopted:true},packet.ready);
  session={lessonId:'duration-fixture',profile:'ayoung',account:authUser.id,mode:'daily',model:LEARNING_MODEL,difficulty:${level},preparation:prep,queue:prep.queue,results:[correct],target:1,baseWords:[packet.plans[0].w],newWords:[],completionPolicy:DAILY_POLICY,introWords:[],introCursor:0,introDone:true,activeMs:${elapsed},clockStarted:Date.now(),studyTopups:topups,timeAddedWords:[]};
  current=1;document.getElementById('learn').classList.add('active');`);
 const f={run,node,alerts,requests,advance:ms=>{now+=ms},setFetch:fn=>{context.fetch=async(...args)=>{requests.push(args[0]);return fn(...args)}}};
 f.setFetch(()=>{throw Error('Unexpected network')});
 if(saved){context.saved=saved;run('state=mergeState(saved);session=null');}
 return f;
}

// Fast completion introduces a real, unseen, matched target immediately.
let f=fixture();const original=f.run('JSON.stringify(session.results)');
f.run('finishSession()');
assert.equal(f.run('session.completed'),undefined);assert.equal(f.run('child().sessions.length'),0);
assert.equal(f.run('session.baseWords.length'),2);assert.equal(f.run('session.timeAddedWords.length'),1);
assert.equal(f.run('JSON.stringify(session.results)'),original);assert.equal(f.requests.length,0);
assert.ok(f.node('introWord').textContent);assert.ok(f.run('inTargetBand(session.baseWords[1],child().difficulty)'));
f.run('nextIntro()');
f.run("selectedOption=session.queue[current].opts.findIndex(o=>o.ok)");await f.run('gradeCurrent(false)');await f.run('nextQuestion()');
assert.equal(f.run('session.queue[current].type'),'subjective_use');assert.equal(f.node('qContext').textContent,'');
assert.ok(f.node('qText').textContent.includes(f.run('session.baseWords[1].w')));

// The extra target, draft, prefix, and downloaded alternatives survive restart.
f.node('answer').value='새 단어를 넣어 쓰던 문장';f.run('checkpointSession()');
const saved=JSON.parse(f.run('JSON.stringify(state)')),answers=f.run('JSON.stringify(session.results)'),next=f.run('current');
f=fixture(0,saved);f.advance(3600000);await f.run('buildSession()');
assert.equal(f.run('current'),next);assert.equal(f.run('JSON.stringify(session.results)'),answers);
assert.equal(f.node('answer').value,'새 단어를 넣어 쓰던 문장');assert.equal(f.run('activeTime()'),MINIMUM_STUDY_MS-1000);
assert.equal(f.run('session.timeAddedWords.length'),1);assert.equal(f.run('session.studyTopups.targets.length'),4);

// Reaching 25 minutes alone cannot bypass the added word's meaningful use.
f.advance(2000);f.run('finishSession()');assert.equal(f.run('child().sessions.length'),0);
f.run("show('learn');renderQuestion();applyResult(session.queue[current],'○','뜻에 맞는 문장이에요.','',{credit:1,contextSuccess:true,hintUsed:false,revealed:false})");
await f.run('nextQuestion()');
assert.equal(f.run('session.completed'),true);assert.equal(f.run('child().sessions.length'),1);
assert.ok(f.run('child().sessions[0].activeMinutes')>=25);f.run('finishSession()');assert.equal(f.run('child().sessions.length'),1);

// Exact threshold and later completion use no surplus word.
for(const elapsed of [MINIMUM_STUDY_MS,MINIMUM_STUDY_MS+60000]){
 const done=fixture(elapsed);done.run('finishSession()');assert.equal(done.run('session.completed'),true);assert.equal(done.run('session.timeAddedWords.length'),0);assert.equal(done.requests.length,0);
}
// Still too fast after one added target: introduce another, rather than padding time.
const again=fixture(20*60000);again.run('finishSession();nextIntro()');
again.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1,contextSuccess:true})");await again.run('nextQuestion()');
again.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1,contextSuccess:true})");await again.run('nextQuestion()');
assert.equal(again.run('session.timeAddedWords.length'),2);assert.equal(again.run('child().sessions.length'),0);assert.equal(again.requests.length,0);

// AI grading wall time is excluded; its correct answer does not complete <25m.
const grading=fixture(24*60000);grading.run('current=0;session.results=[];renderQuestion()');
grading.node('answer').value='뜻이 드러나는 나의 문장';
grading.setFetch(url=>{assert.equal(url,'/api/grade');grading.advance(180000);return {ok:true,json:async()=>({score:1,contextSuccess:true,feedback:'정확한 쓰임입니다.'})}});
await grading.run('gradeCurrent(false)');assert.equal(grading.run('activeTime()'),24*60000);
await grading.run('nextQuestion()');assert.equal(grading.run('session.timeAddedWords.length'),1);assert.equal(grading.run('child().sessions.length'),0);

// Legacy packets prefetch without generation; a failed download is not completion.
const failed=fixture();failed.run('session.studyTopups=null;finishSession()');await failed.run('session.topupBoundary');
assert.equal(failed.run('session.completed'),undefined);assert.equal(failed.run('child().sessions.length'),0);
assert.ok(failed.node('next').textContent.includes('다시 불러오기'));failed.advance(600000);assert.equal(failed.run('activeTime()'),MINIMUM_STUDY_MS-1000);
const loading=fixture();loading.run('session.studyTopups=null');let release;
loading.setFetch(url=>{assert.equal(url,'/api/study-topups');return new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>structuredClone(topups)})})});
loading.run('finishSession()');await new Promise(resolve=>setTimeout(resolve,0));loading.advance(300000);release();await loading.run('session.topupBoundary');
assert.equal(loading.run('activeTime()'),MINIMUM_STUDY_MS-1000);assert.equal(loading.run('session.timeAddedWords.length'),1);

// Placement keeps its existing completion rule.
const diagnostic=fixture(1000);diagnostic.run('session.mode="level";session.ability=3.5;finishSession()');assert.equal(diagnostic.run('session.completed'),true);assert.equal(diagnostic.run('session.timeAddedWords.length'),0);

// Only the authenticated owner can retrieve bank candidates for a known profile.
function response(){return {headers:{},code:0,body:null,setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(x){this.body=x;return this}}}
let res=response();await topupHandler({method:'POST',headers:{},body:{profile:'ayoung',level}},res);assert.equal(res.code,401);
const originalFetch=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async url=>{calls++;return url.endsWith('/auth/v1/user')?{ok:true,json:async()=>({id:AUTHORED_OWNER})}:{ok:true,json:async()=>[{state:{users:{ayoung:learner}}}]}};
 res=response();await topupHandler({method:'POST',headers:{authorization:'Bearer fixture'},body:{profile:'ayoung',level,excluded:[w.w]}},res);
 assert.equal(res.code,200);assert.equal(calls,2);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.body.targets.length,5);
 assert.ok(res.body.targets.every(t=>t.plan.w.w!==w.w&&inTargetBand(t.plan.w,level)));
 calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({id:'other-owner'})}};
 res=response();await topupHandler({method:'POST',headers:{authorization:'Bearer fixture'},body:{profile:'ayoung',level}},res);assert.equal(res.code,403);assert.equal(calls,1);
}finally{globalThis.fetch=originalFetch}
console.log('Minimum study verified: 4 matched server packets; 24:59 adds one fresh word immediately, repeated additions until 25m, exact/later threshold stops, sentence use remains mandatory, draft/restart preserved, breaks/grading/download waits excluded, legacy retry and owner-only bank delivery.');
