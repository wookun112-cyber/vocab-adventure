import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const clone=value=>JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(local=new Map(),cloud=new Map(),account='family'){
 const nodes=new Map(),alerts=[],calls={reads:0,consumes:0,generation:0,writes:[]};
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},children:[],appendChild(x){this.children.push(x)},classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}});
  }
  return nodes.get(id);
 };
 let run;const deferred=[];let blockWrites=false;
 const ctx=vm.createContext({console,setTimeout,clearTimeout,Date,Math,Map,Set,Promise,
  document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>node('element-'+Math.random())},window:{scrollTo(){}},alert:x=>alerts.push(x),
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
  fetch:()=>{calls.generation++;throw Error('Resuming saved base questions must not use AI')},
  createClient:()=>({
   auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
   from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{calls.reads++;return {data:cloud.has(account)?{state:clone(cloud.get(account))}:null,error:null}}})}),upsert:async row=>{
    calls.writes.push(clone(row));if(blockWrites)await new Promise(resolve=>deferred.push(resolve));
    cloud.set(row.user_id,clone(row.state));return {error:null};
   }}),
   rpc:async(name,args)=>{
    if(name==='consume_prepared_lesson'){calls.consumes++;return {data:true,error:null}}
    if(!['get_prepared_lesson','ensure_prepared_lesson'].includes(name))throw Error('Unexpected RPC '+name);
    calls.reads++;return {data:run('typeof recoveryRemote==="undefined"?makeRemoteLesson():recoveryRemote'),error:null};
   }
  })
 });
 run=code=>vm.runInContext(code,ctx);run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));run(source);
 run(`state.selected='guest';authUser={id:${JSON.stringify(account)}};loadedAccount=authUser.id;
  globalThis.makeRemoteLesson=()=>{
   const newWords=SEED_WORDS.slice(0,5),plans=assignScenarios(makeQuestionPlan(newWords,[],20,'daily'));
   const ready=plans.map((p,i)=>[i,{w:p.w,type:p.type,label:'문맥',q:'빈칸을 채우세요.',ctx:'기록'+i+'를 읽고 새로운 상황'+i+'의 ＿＿＿＿를 살폈어요.',open:p.type.startsWith('subjective_'),hideWord:true,showTarget:false,
    opts:p.type.startsWith('mc_')?[{t:p.w.w,ok:true},...['가나다','라마바','사아자','차카타'].map(t=>({t,ok:false}))]:[],acceptedAnswers:[p.w.w],hints:['상황의 단서를 살펴보세요.','앞뒤 문장을 함께 살펴보세요.'],feedbackCorrect:'문맥에 맞는 말이에요.',signature:'새 상황'+i,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}}]);
   return {id:'job-'+state.selected,status:'ready',payload:{selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:PREPARATION_ENGINE,created:Date.now(),account:authUser.id,profile:state.selected,mode:'daily',snapshot:preparationSnapshot(state.selected),difficulty:child().difficulty,newWords:newWords.map(w=>w.w),baseWords:newWords,plans,ready}};
  };
 `);
 return {run,ctx,node,alerts,calls,local,cloud,block(){blockWrites=true},release(){blockWrites=false;deferred.splice(0).forEach(resolve=>resolve())}};
}
const f=fixture();
await f.run('buildSession()');await flush();
assert.equal(f.run('session.queue.length'),20);
assert.equal(f.calls.consumes,1);
const signatures=f.run('JSON.stringify(session.queue.map(q=>q.signature))');
for(let i=0;i<9;i++){
 f.run("applyResult(session.queue[current],'◎','좋아요.','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})");
 if(i<8)await f.run('nextQuestion()');
}
f.run("selectCharacter('fox')");
const earnedXp=f.run('exploration(child()).xp');
assert.equal(earnedXp,f.run('session.results.reduce((n,r)=>n+r.xp,0)'),"new-profile XP comes only from awarded answers, without double migration credit");
await f.run('cloudSave()');
assert.equal(f.run('current'),8,'the ninth feedback is still on screen when the app closes');
assert.equal(f.run('child().activeLesson.nextIndex'),9,'a graded ninth question resumes at question ten without needing Next');
const stats="JSON.stringify(child().words,(key,value)=>['__v','usedPassageKeys','problemHistory'].includes(key)?undefined:value)";
const wordStats=f.run(stats);
const restarted=fixture(f.local,f.cloud);
await restarted.run('cloudLoad()');
assert.equal(restarted.node('startDaily').textContent,'이어서 학습 · 10번째 문제');
await restarted.run('buildSession()');
assert.equal(restarted.run('current'),9);
assert.equal(restarted.run('child().characterId'),'fox');
assert.equal(restarted.run('exploration(child()).xp'),earnedXp,'resuming preserves XP without re-awarding previous answers');
assert.equal(restarted.node('counter').textContent,'10번째 문제');
assert.equal(restarted.run('session.results.length'),9);
assert.ok(restarted.run(stats)===wordStats,'restoring cannot change answer counters or mastery evidence');
assert.equal(restarted.run('JSON.stringify(session.queue.map(q=>q.signature))'),signatures);
assert.equal(restarted.calls.consumes,0,'resume never consumes a lesson again');
assert.equal(restarted.calls.generation,0);
// Closing on an unanswered question restores that question; hints remain used.
restarted.run('showHint()');await restarted.run('cloudSave()');
const hinted=fixture(restarted.local,restarted.cloud);
await hinted.run('cloudLoad()');await hinted.run('buildSession()');
assert.equal(hinted.run('current'),9);
assert.equal(hinted.run('hintLevel'),1);
assert.ok(hinted.node('hintBox').textContent.startsWith('힌트 1:'));
hinted.run("applyResult(session.queue[current],'◎','좋아요.','',{credit:1,contextSuccess:true,targetRecall:true,independent:false,hintUsed:hintLevel>0})");
assert.equal(hinted.run('session.results.at(-1).hintUsed'),true);
assert.equal(hinted.run('session.results.at(-1).credit'),.75);
assert.equal(hinted.calls.generation,0);
console.log('Restart verified: nine graded answers → question ten, unchanged word statistics and question order, no re-consumption or AI calls, unanswered question and hint use preserved.');
// A fresh device restores the synchronized lesson from the cloud.
await hinted.run('cloudSave()');
const otherDevice=fixture(new Map(),hinted.cloud);
await otherDevice.run('cloudLoad()');await otherDevice.run('buildSession()');
assert.equal(otherDevice.run('current'),10);
assert.equal(otherDevice.run('session.results.length'),10);
assert.equal(otherDevice.calls.consumes,0);
assert.equal(otherDevice.calls.generation,0);
// Account and child checkpoints are independent.
const otherAccount=fixture(hinted.local,hinted.cloud,'another-family');
await otherAccount.run('cloudLoad()');
assert.equal(otherAccount.run('savedLesson()'),null);
assert.equal(otherAccount.run('Object.values(child().words).reduce((n,w)=>n+w.seen,0)'),0);
otherDevice.run("checkpointSession();session.preparation.cancel();session=null;state.selected='inseong';renderAll()");
assert.equal(otherDevice.run('savedLesson()'),null);
await otherDevice.run('buildSession()');
otherDevice.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1});checkpointSession();session.preparation.cancel();session=null;state.selected='guest'");
await otherDevice.run('buildSession()');
assert.equal(otherDevice.run('current'),10);
assert.equal(otherDevice.run('session.results.length'),10);
assert.equal(otherDevice.run('state.users.inseong.activeLesson.nextIndex'),1);
console.log('Cloud and isolation verified: fresh-device resume, separate child progress, another account cannot import local lessons or word statistics.');
// A local checkpoint newer than an in-flight cloud write restores result AND statistics.
const slow=fixture();
await slow.run('buildSession()');await slow.run('cloudSave()');
slow.block();
slow.run("applyResult(session.queue[current],'◎','좋아요.','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})");
await slow.run('nextQuestion()');
slow.run("applyResult(session.queue[current],'◎','좋아요.','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})");
const cloudBehind=clone(slow.cloud.get('family'));
assert.equal(cloudBehind.users.guest.activeLesson.nextIndex,0);
const recovered=fixture(slow.local,new Map([['family',cloudBehind]]));
await recovered.run('cloudLoad()');await recovered.run('buildSession()');
assert.equal(recovered.run('current'),2);
assert.equal(recovered.run('session.results.length'),2);
assert.equal(recovered.run('Object.values(child().words).reduce((n,w)=>n+w.seen,0)'),2);
assert.equal(recovered.cloud.get('family').users.guest.activeLesson.nextIndex,2);
slow.release();await slow.run('cloudSave()');
// Adaptive lessons retain the original extended plans and ready questions.
recovered.run('session.target=26;prefetchQuestions()');
await flush();
const planned=recovered.run('JSON.stringify(session.preparation.plans)');
await recovered.run('cloudSave()');
const adaptive=fixture(recovered.local,recovered.cloud);
await adaptive.run('cloudLoad()');await adaptive.run('buildSession()');
assert.equal(adaptive.run('session.target'),26);
assert.equal(adaptive.run('JSON.stringify(session.preparation.plans)'),planned);
console.log('Durability verified: closing during a pending cloud save recovers results with their word counters; adaptive target and original plans survive restart.');
// Last answer saved before the completion screen finishes once on restart.
const finish=fixture();await finish.run('buildSession()');
finish.run('warmDailyQuestions=()=>{}');
for(let i=0;i<20;i++){
 finish.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1})");
 if(i<19)await finish.run('nextQuestion()');
}
await finish.run('cloudSave()');
assert.equal(finish.run('child().sessions.length'),0);
const last=fixture(finish.local,finish.cloud);
await last.run('cloudLoad()');last.run('warmDailyQuestions=()=>{}');await last.run('buildSession()');await last.run('cloudSave()');
assert.equal(last.run('child().sessions.length'),1);
assert.equal(last.run('child().activeLesson'),null);
last.run('finishSession()');
assert.equal(last.run('child().sessions.length'),1);
// An older cloud response cannot resurrect the local completion tombstone.
const stale=clone(finish.cloud.get('family'));
const completed=fixture(last.local,new Map([['family',stale]]));
await completed.run('cloudLoad()');
assert.equal(completed.run('savedLesson()'),null);
assert.equal(completed.run('child().sessions.length'),1);
console.log('Completion verified: final-answer restart finishes once, clears the checkpoint, and an older cloud state cannot revive a completed lesson.');

for(const mode of ['review','level']){
 const test=fixture();await test.run('buildSession()');
 test.run(`session.mode='${mode}';session.ability=6.5;checkpointSession();localSave()`);
 await test.run('cloudSave()');
 const restore=fixture(new Map(),test.cloud);await restore.run('cloudLoad()');await restore.run('buildSession()');
 assert.equal(restore.run('session.mode'),mode);assert.equal(restore.run('session.ability'),6.5);
 assert.equal(restore.calls.consumes,0);assert.equal(restore.calls.generation,0);
}
console.log('Modes verified: review and level-check lessons resume with their mode and adaptive ability intact.');

// The reported failure: first question graded, only eight questions saved,
// consumed old server lesson. Recover the original remaining questions in the cloud.
const broken=fixture();await broken.run('buildSession()');
broken.run("applyResult(session.queue[0],'○','좋아요.','',{credit:1});checkpointSession()");
const fullLesson=JSON.parse(broken.run('JSON.stringify(child().activeLesson)'));
broken.run('session.preparation.ready=new Map([...session.preparation.ready].filter(([i])=>i===0||i>=13));session.preparation.queue.splice(1);checkpointSession();localSave()');
await broken.run('cloudSave()');
assert.equal(broken.run('child().activeLesson.ready.length'),8);
const repair=fixture(broken.local,broken.cloud);await repair.run('cloudLoad()');
repair.run(`globalThis.recoveryRemote=${JSON.stringify({id:'recovery-job',status:'ready',payload:{...fullLesson,resumeId:fullLesson.id}})}`);
await repair.run('buildSession()');
assert.equal(repair.run('current'),1);assert.equal(repair.node('counter').textContent,'2번째 문제');
assert.equal(repair.run('session.results.length'),1);assert.equal(repair.run('session.queue.length'),20);
assert.equal(repair.run('session.queue[0].signature'),fullLesson.ready[0][1].signature);
assert.equal(repair.run('Object.values(child().words).reduce((n,w)=>n+w.seen,0)'),1);
assert.equal(repair.calls.consumes,0);assert.equal(repair.calls.generation,0);
repair.run('session.preparation.cancel()');
// A missing stored lesson cannot silently start browser generation again.
const missing=fixture();missing.run("sb.rpc=async()=>({data:null,error:null});ensureCatalog=async()=>{throw Error('No daily live generation fallback')}");
await missing.run('buildSession()');
assert.equal(missing.run('session'),null);assert.equal(missing.calls.generation,0);assert.equal(missing.node('startDaily').disabled,false);
console.log('Reported failure regression verified: eight-question partial lesson repaired from the cloud, first result kept, resumes at question two without re-consumption or live generation; missing stored lessons cannot fall back.');
