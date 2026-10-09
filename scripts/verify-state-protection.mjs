import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const clone=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(r=>setTimeout(r,0));
function fixture(){
 const nodes=new Map(),local=new Map(),reads=[],writes=[];
 const node=id=>{
  if(!nodes.has(id)){const classes=new Set();nodes.set(id,{value:'',textContent:'',innerHTML:'',style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,v){if(v??!classes.has(x))classes.add(x);else classes.delete(x)}}})}
  return nodes.get(id);
 };
 const ctx=vm.createContext({AbortSignal,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,authoredQuestionValid:authoredPolicy.authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,console,Date,Math,Map,Set,Promise,setTimeout,clearTimeout,alert(){},window:{scrollTo(){}},document:{getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)},createClient:()=>({from:()=>({select:()=>({eq:(_k,account)=>({maybeSingle:()=>new Promise(resolve=>reads.push({account,resolve}))})}),upsert:async row=>{writes.push(clone(row));return {error:null}}})})});
 const run=x=>vm.runInContext(x,ctx);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 run('ensureCatalog=async()=>{};warmDailyQuestions=()=>{};curriculumStatus=async()=>null');
 return {run,node,local,reads,writes};
}
const f=fixture();
const remote=JSON.parse(f.run("JSON.stringify(initial())"));
remote.users.ayoung.difficulty=7.4;remote.users.ayoung.words['근거'].seen=9;
remote.users.ayoung.sessions=[{score:80}];remote.users.ayoung.levelTestCompleted=true;
const load=f.run("applyAuth({user:{id:'family'}})");
await tick();
assert.equal(f.reads.length,1);
assert.equal(f.node('authGate').classList.contains('hidden'),false,'account stays locked until records load');
f.run('renderExploration();storeLearnerCheckpoint("ayoung");localSave()');await f.run('cloudSave()');
assert.equal(f.writes.length,0,'render awards, explicit saves and checkpoints cannot write unloaded defaults');
assert.equal(f.local.size,0);
const duplicate=f.run("applyAuth({user:{id:'family'}})");await tick();
assert.equal(f.reads.length,1,'concurrent initial-session callbacks share one cloud read');
f.reads[0].resolve({data:{state:remote},error:null});await load;await duplicate;
assert.equal(f.run('child().difficulty'),7.4);assert.equal(f.run("child().words['근거'].seen"),9);
assert.equal(f.node('authGate').classList.contains('hidden'),true);
assert.ok(f.writes.every(r=>r.state.users.ayoung.words['근거'].seen===9));
await f.run("applyAuth({user:{id:'family'}})");
assert.equal(f.reads.length,1,'same-account sign-in or token refresh cannot reload an active lesson');

const failed=fixture();failed.local.set('vocab-adventure-v8',JSON.stringify(remote));
const failure=failed.run("applyAuth({user:{id:'another'}})");await tick();
failed.reads[0].resolve({data:null,error:{message:'offline'}});await failure;
await failed.run('cloudSave();renderExploration();storeLearnerCheckpoint("ayoung")');
assert.equal(failed.writes.length,0,'load failure never imports shared cache and never saves');
assert.equal(failed.run('loadedAccount'),null);
assert.equal(failed.node('authGate').classList.contains('hidden'),false);
assert.notEqual(failed.run('child().difficulty'),7.4,'another account cannot load unowned legacy cache');

const switched=fixture();const first=switched.run("applyAuth({user:{id:'first'}})");await tick();
const second=switched.run("applyAuth({user:{id:'second'}})");await tick();
switched.reads[1].resolve({data:{state:remote},error:null});await second;
const obsolete=clone(remote);obsolete.users.ayoung.difficulty=2;
switched.reads[0].resolve({data:{state:obsolete},error:null});await first;
assert.equal(switched.run('authUser.id'),'second');assert.equal(switched.run('child().difficulty'),7.4);
assert.ok(switched.writes.every(r=>r.user_id==='second'),'late prior-account response cannot save');

const corrupt=fixture();corrupt.run("authUser={id:'family'}");
const blank=JSON.parse(corrupt.run('JSON.stringify(initial().users.ayoung)'));
corrupt.local.set('vocab-lesson-family-ayoung',JSON.stringify({account:'family',profile:'ayoung',savedAt:Date.now()+60000,learner:blank}));
const recovery=corrupt.run('cloudLoad()');await tick();corrupt.reads[0].resolve({data:{state:remote},error:null});await recovery;
assert.equal(corrupt.run("child().words['근거'].seen"),9,'newer empty checkpoint cannot erase recovered cloud progress');
assert.equal(corrupt.run('child().difficulty'),7.4);
assert.ok(corrupt.writes.every(r=>r.state.users.ayoung.words['근거'].seen===9));
const retro=fixture(),retroState=clone(remote);
retroState.users.ayoung.difficulty=1.8;retroState.users.ayoung.leagueLevel=1.8;
retroState.users.ayoung.gradeBackfill={id:'today-backfill',date:'2026-10-07'};
retroState.users.ayoung.levelAdjustmentHistory=[];
const staleLearner=clone(retroState.users.ayoung);staleLearner.difficulty=1.2;staleLearner.leagueLevel=1.2;delete staleLearner.gradeBackfill;
staleLearner.words['근거'].seen=10;
retro.local.set('vocab-lesson-family-ayoung',JSON.stringify({account:'family',profile:'ayoung',savedAt:Date.now()+60000,learner:staleLearner}));
const retroLoad=retro.run("applyAuth({user:{id:'family'}})");await tick();retro.reads[0].resolve({data:{state:retroState},error:null});await retroLoad;
assert.equal(retro.run('child().difficulty'),1.8,'a newer device checkpoint cannot undo today’s retroactive grade');
assert.equal(retro.run("child().words['근거'].seen"),10,'local unsynchronized answers survive grade reconciliation');
assert.equal(retro.run('child().gradeBackfill.id'),'today-backfill');
console.log('State protection verified: no saves or reward checkpoints before hydration, single initial load, no refresh reload, failed reads locked, owned caches, stale-account responses discarded, empty local checkpoints rejected.');
