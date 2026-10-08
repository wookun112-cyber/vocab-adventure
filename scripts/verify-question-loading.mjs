import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const storage=new Map();
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(seed,account='family',shared=storage,server=false){
 const nodes=new Map(),alerts=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:id,classList:{add(){},remove(){},toggle(){}},style:{}});return nodes.get(id)};
 const ctx=vm.createContext({console,setTimeout,clearTimeout,Map,Set,Date,Math,Promise,
   document:{getElementById:node,querySelectorAll:()=>[]},window:{scrollTo(){}},
   localStorage:{setItem:(k,v)=>shared.set(k,v),getItem:k=>shared.get(k)||null,removeItem:k=>shared.delete(k)},
   alert:m=>alerts.push(m),fetch:()=>{throw Error('Unexpected network')},
   createClient:()=>({rpc:async()=>({data:null,error:null}),auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}})
 });
 vm.runInContext(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''),ctx);vm.runInContext(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''),ctx);vm.runInContext(source,ctx);
 const run=code=>vm.runInContext(code,ctx);
 if(seed)run(`state=${JSON.stringify(seed)};rebuildCatalog()`);
 run(`state.selected='guest';authUser={id:${JSON.stringify(account)}};
   globalThis.word={w:'근거',d:'생각을 뒷받침하는 자료',band:2,cat:'국어',source:'seed'};
   wordState('근거');ensureCatalog=async()=>{};chooseNew=()=>[word];chooseReview=()=>[word];
   globalThis.shown=[];renderQuestion=()=>{};show=id=>shown.push(id);cloudSave=()=>{};
   globalThis.requests=[];
   globalThis.answerFor=plan=>({w:plan.w,type:plan.type,label:'문맥',q:'빈칸을 채우세요.',ctx:'탐험'+plan.id+'에서 새로운 기록을 찾아 자세히 살폈어요. 탐험'+plan.id+'의 기록이 생각을 뒷받침하는 ＿＿＿＿가 되었어요.',opts:[],signature:'시나리오'+plan.id,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}});
   fetchValidatedQuestions=(plans,recent,known,profile)=>new Promise((resolve,reject)=>requests.push({plans,recent,known,profile,resolve:()=>resolve(plans.map(answerFor)),reject}));
 `);
 if(!server)run("buildDailyPlan=(fresh,reviews,getState,level)=>buildLearningPlan(fresh,reviews,20,'daily',getState,{level});const actualGetPreparation=getPreparation,actualBuildSession=buildSession;getPreparation=mode=>actualGetPreparation(mode==='level'?'level':'review').then(p=>{p.model=undefined;p.completionPolicy=null;return p});buildSession=mode=>actualBuildSession(mode==='level'?'level':'review')");
 return {run,nodes,node,alerts,ctx};
}
const f=fixture();
const before=f.run('JSON.stringify(state.users)');
f.run('warmDailyQuestions()');await flush();
assert.equal(f.run('requests.length'),4,'four groups start before the first question completes');
assert.equal(f.run('requests.map(r=>r.plans.length).join(",")'),'1,4,4,4');
assert.equal(f.run('shown.length'),0,'preparing questions does not show definitions or start a lesson');
assert.equal(f.run('JSON.stringify(state.users)'),before,'preparing does not modify learning records');
// Later groups may finish first, but the lesson remains in planned order.
f.run('requests[2].resolve();requests[3].resolve()');await flush();
assert.equal(f.run('requests.length'),6);
assert.equal(f.run('preparations.values().next().value.queue.length'),0);
const starting=f.run('buildSession()');await flush();
assert.equal(f.run('requests.length'),6,'clicking start joins existing work');
f.run('requests[0].resolve()');await starting;
assert.equal(f.run('session.queue.length'),1);
assert.equal(f.run('session.intros.length'),0);
assert.equal(f.run('shown[0]'),'learn');
assert.equal(f.node('startDaily').disabled,false);
assert.equal(f.run('localStorage.getItem(session.preparation.key)'),null,'a started lesson cannot be replayed from its prepared cache');
// The next button joins the already-running group, rather than starting a new request.
f.run("session.results=[{word:'근거',credit:1,result:'◎'}]");
const next=f.run('nextQuestion()');await flush();
assert.equal(f.run('requests.length'),6);
f.run('requests[1].reject(new Error("timeout"))');await next;
assert.equal(f.run('current'),0);
assert.equal(f.run('session.results.length'),1);
assert.equal(f.node('next').disabled,false);
const retry=f.run('nextQuestion()');await flush();
assert.equal(f.run('requests.length'),7);
f.run('requests[6].resolve()');await retry;
assert.equal(f.run('current'),1);
assert.equal(f.run('session.queue.length'),13);
const requestCount=f.run('requests.length');
await f.run('nextQuestion()');
assert.equal(f.run('current'),2);
assert.equal(f.run('requests.length'),requestCount,'ready transitions make zero generation requests');
f.run('requests[4].resolve();requests[5].resolve()');await flush();
assert.equal(f.run('session.queue.length'),20);
assert.equal(f.run('session.pendingPlans.length'),0);
assert.equal(f.run('session.queue.map(q=>q.signature).join(",")'),Array.from({length:20},(_,i)=>'시나리오'+i).join(','));
assert.ok(f.run('session.queue.some(q=>q.type.startsWith("mc_"))'));assert.ok(f.run('session.queue.some(q=>q.type.startsWith("subjective_"))'));
// Adaptive extensions still get their own plans and can prepare before question 20.
f.run('session.target=26;prefetchQuestions()');await flush();
assert.equal(f.run('requests.length'),9);
f.run('requests[7].resolve();requests[8].resolve()');await flush();
assert.equal(f.run('session.queue.length'),26);
console.log('Loading verified: early concurrent requests, ordered delivery, next-button joins, ready transitions without network, retry preserves records, 20→26 extension.');
// Save unused prepared questions, then simulate a complete browser restart.
const cacheStorage=new Map();
const c=fixture(undefined,'family',cacheStorage);
const original=JSON.parse(c.run('JSON.stringify(state)'));
c.run('warmDailyQuestions()');await flush();
c.run('requests.slice().forEach(r=>r.resolve())');await flush();
c.run('requests.slice(4).forEach(r=>r.resolve())');await flush();
assert.equal(c.run('preparations.values().next().value.queue.length'),20);
const key=c.run("preparationKey('review')");
assert.ok(cacheStorage.has(key));
const restart=fixture(original,'family',cacheStorage);
restart.run("ensureCatalog=async()=>{throw Error('cached lesson must not wait for curriculum')}");
await restart.run('buildSession()');
assert.equal(restart.run('session.queue.length'),20);
assert.equal(restart.run('requests.length'),0,'cached start makes zero question requests');
for(let i=0;i<19;i++)await restart.run('nextQuestion()');
assert.equal(restart.run('current'),19);
assert.equal(restart.run('requests.length'),0,'all 19 ready transitions are local');
assert.equal(cacheStorage.has(key),false);
console.log('Persistent preparation verified: cached start and 19 next-button transitions make zero generation requests; cache is consumed once.');
// Different accounts, different profiles, changed progress and expired data must not reuse it.
const saved=c.run('JSON.stringify({completionPolicy:DAILY_POLICY,selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:PREPARATION_ENGINE,created:Date.now(),account:authUser.id,profile:state.selected,snapshot:preparationSnapshot(state.selected),mode:"review",difficulty:2,newWords:[word.w],baseWords:[word],plans:preparations.values().next().value.plans,ready:[...preparations.values().next().value.ready]})');
for(const kind of ['account','profile','progress','expired','unverified']){
 const bank=new Map([[key,saved]]),t=fixture(original,kind==='account'?'other':'family',bank);
 if(kind==='profile')t.run("state.selected='inseong'");
 if(kind==='progress')t.run("state.users.guest.words['근거'].seen++");
 if(kind==='expired')bank.set(key,JSON.stringify({...JSON.parse(saved),created:Date.now()-37*60*60*1000}));
 if(kind==='unverified'){const data=JSON.parse(saved);data.ready[0][1].validation=null;bank.set(key,JSON.stringify(data))}
 const p=await t.run('getPreparation()');
 assert.ok(t.run('requests.length')>0,kind+' must not reuse a stale or unverified first question');
 assert.equal(p.queue.length,0);
 p.cancel();
}
console.log('Cache isolation verified: account, profile, changed progress, expiry and missing verification invalidate prepared questions.');
// Duplicate sentences arriving from simultaneous groups cannot reach the learner.
const d=fixture(undefined,'family',new Map());
d.run('warmDailyQuestions()');await flush();
d.run('requests[0].resolve()');await flush();
d.run(`requests[1].resolve=()=>{requests[1].resolveOriginal?.()};
 globalThis.duplicateQuestions=requests[1].plans.map(answerFor);
 duplicateQuestions[0].ctx=answerFor(requests[0].plans[0]).ctx;
 requests[1].reject(new Error('network failure'));
`);await flush();
// Directly exercise the same scheduler with a response that repeats a saved sentence.
d.run('requests.slice(2).forEach(r=>r.resolve())');await flush();
const job=d.run('preparations.values().next().value.jobs[1]');job.error=null;
d.run(`fetchValidatedQuestions=async plans=>plans.map(plan=>({...answerFor(plan),ctx:plan.id==='1'?answerFor(requests[0].plans[0]).ctx:answerFor(plan).ctx}));preparations.values().next().value.pump()`);await flush();
assert.equal(d.run('preparations.values().next().value.ready.has(1)'),false);
assert.equal(d.run('preparations.values().next().value.ready.has(2)'),true,'valid peers are kept when only one repeats');
assert.equal(job.duplicateRetries,2,'a persistent duplicate gets one bounded retry');
assert.ok(job.error);
assert.equal(d.run('preparations.values().next().value.queue.length'),1);
console.log('Parallel repetition check verified: duplicates are withheld, valid peers retained, retries bounded.');

// Switching children while the next question is pending cannot move the new child.
const switcher=fixture(undefined,'family',new Map());
switcher.run('warmDailyQuestions()');await flush();
switcher.run('requests[0].resolve()');await flush();
await switcher.run('buildSession()');
const switching=switcher.run('nextQuestion()');await flush();
switcher.run(`session.preparation.cancel();session={profile:'inseong',queue:[],results:[],target:20};state.selected='inseong';current=0`);
await switching;
assert.equal(switcher.run('current'),0);
assert.equal(switcher.run('session.profile'),'inseong');
assert.equal(switcher.alerts.length,0);
console.log('Profile switch verified: pending responses cannot move another child or show an old-session error.');

// A server-prepared daily lesson starts directly, including on a fresh device.
const remote=fixture(undefined,'family',new Map(),true);
remote.run(`state.selected='inseong';globalThis.remoteReads=0;globalThis.consumes=0;
 const plans=assignScenarios(makeQuestionPlan([word],[word],20,'daily'));
 globalThis.serverPayload={completionPolicy:DAILY_POLICY,selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:PREPARATION_ENGINE,created:Date.now(),account:'family',profile:'inseong',snapshot:preparationSnapshot('inseong'),mode:'daily',difficulty:2,newWords:[word.w],baseWords:[word],plans,ready:plans.map((p,i)=>[i,answerFor(p)])};
 sb.rpc=async(name,args)=>{if(name==='consume_prepared_lesson'){consumes++;return {data:consumes===1,error:null}}remoteReads++;return {data:{id:'server-job',status:'ready',payload:serverPayload},error:null}};
`);
await remote.run('buildSession()');
assert.equal(remote.run('session.queue.length'),20);
assert.equal(remote.run('requests.length'),0);
assert.equal(remote.run('consumes'),1);
for(let i=0;i<19;i++)await remote.run('nextQuestion()');
assert.equal(remote.run('requests.length'),0);
assert.equal(remote.run('remoteReads'),1,'ready server lesson needs one storage read');
assert.equal(remote.run('current'),19);
// Another device that won the consumption race cannot replay the same lesson.
remote.run('session=null;current=0');
await remote.run('buildSession()');
assert.equal(remote.run('session'),null);
assert.equal(remote.run('requests.length'),0);
assert.equal(remote.alerts.length,1);
// Partial preparation polls saved results; it never calls the generation API again.
const partialRemote=fixture(undefined,'family',new Map(),true);
partialRemote.run(`state.selected='ayoung';globalThis.completed=false;
 const plans=assignScenarios(makeQuestionPlan([word],[word],20,'daily'));
 globalThis.remotePayload={completionPolicy:DAILY_POLICY,selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:PREPARATION_ENGINE,created:Date.now(),account:'family',profile:'ayoung',snapshot:preparationSnapshot('ayoung'),mode:'daily',difficulty:2,newWords:[word.w],baseWords:[word],plans,ready:[[0,answerFor(plans[0])]]};
 sb.rpc=async(name)=>name==='consume_prepared_lesson'?{data:true,error:null}:{data:{id:'partial-job',status:completed?'consumed':'working',payload:{...remotePayload,ready:completed?plans.map((p,i)=>[i,answerFor(p)]):remotePayload.ready}},error:null};
`);
const partialStart=partialRemote.run('buildSession()');await flush();
assert.equal(partialRemote.run('session'),null,'a cloud lesson waits for all 20 questions before consumption');
partialRemote.run('completed=true;preparations.values().next().value.pump()');
await partialStart;
assert.equal(partialRemote.run('session.queue.length'),20);
assert.equal(partialRemote.run('requests.length'),0);
partialRemote.run('session.preparation.cancel()');
console.log('Server loading verified: fresh-device start and 19 transitions require zero generation requests; single-use ownership, partial polling, and consumption races are enforced.');

// Guest uses its own cloud lesson at its own difficulty, without curriculum or AI requests.
const guest=fixture(undefined,'family',new Map(),true);
guest.run(`state.users.guest.difficulty=7.4;word.band=7;globalThis.guestReads=[];
 ensureCatalog=async()=>{throw Error('Guest start must use prepared server questions')};
 const plans=assignScenarios(makeQuestionPlan([word],[word],20,'daily'));
 globalThis.guestPayload={completionPolicy:DAILY_POLICY,selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:PREPARATION_ENGINE,created:Date.now(),account:'family',profile:'guest',snapshot:preparationSnapshot('guest'),mode:'daily',difficulty:7.4,newWords:[word.w],baseWords:[word],plans,ready:plans.map((p,i)=>[i,answerFor(p)])};
 sb.rpc=async(name,args)=>{guestReads.push({name,profile:args.p_profile});return {data:name==='consume_prepared_lesson'?true:{id:'guest-job',status:'ready',payload:guestPayload},error:null}};
`);
const guestBefore=guest.run('JSON.stringify(state.users)');
await guest.run('buildSession()');
assert.equal(guest.run('session.profile'),'guest');
assert.equal(guest.run('session.difficulty'),7.4);
for(let i=0;i<19;i++)await guest.run('nextQuestion()');
assert.equal(guest.run('current'),19);
assert.equal(guest.run('requests.length'),0);
assert.equal(guest.run('guestReads.every(r=>r.profile==="guest")'),true);
assert.equal(guest.run('JSON.stringify(state.users)'),guestBefore);
// An unresolved storage read releases every start button and can be retried.
const stuck=fixture(undefined,'family',new Map(),true);
stuck.ctx.setTimeout=(fn,ms)=>setTimeout(fn,ms===15000||ms===10000?1:ms);
stuck.run('state.users.guest.difficulty=7.4;sb.rpc=()=>new Promise(()=>{})');
await stuck.run('buildSession()');
assert.equal(stuck.run('preparingSession'),false);
for(const id of ['startDaily','startReview','levelTest'])assert.equal(stuck.node(id).disabled,false);
assert.equal(stuck.run('session'),null);
assert.equal(stuck.alerts.length,1);
await flush();
stuck.run(`sb.rpc=async name=>({data:name==='consume_prepared_lesson'?true:{id:'guest-job',status:'ready',payload:${guest.run('JSON.stringify(guestPayload)')}},error:null})`);
await stuck.run('buildSession()');
assert.equal(stuck.run('session.profile'),'guest');
assert.equal(stuck.run('requests.length'),0);
// Waiting for a missing next question is bounded and does not change recorded answers.
stuck.run("session.queue=session.queue.slice(0,1);session.results=[{word:'근거',credit:1}];current=0;session.preparation.waitFor=()=>new Promise(()=>{});prepareExtensions=()=>{}");
await stuck.run('nextQuestion()');
assert.equal(stuck.run('current'),0);
assert.equal(stuck.run('session.results.length'),1);
assert.equal(stuck.node('next').disabled,false);
// A failed server preparation never duplicates the job with browser generation.
const failedRemote=fixture(undefined,'family',new Map(),true);
failedRemote.run("sb.rpc=async()=>({data:{id:'failed-job',status:'failed'},error:null})");
await failedRemote.run('buildSession()');
assert.equal(failedRemote.run('requests.length'),0);
assert.equal(failedRemote.node('startDaily').disabled,false);
console.log('Guest regression verified: personalized cloud lesson, 19 instant transitions without AI calls, unchanged records, storage timeout/retry, bounded next wait, no duplicate generation on server failure.');

const consumeTimeout=fixture(undefined,'family',new Map(),true);
consumeTimeout.ctx.setTimeout=(fn,ms)=>setTimeout(fn,ms===10000?1:ms);
consumeTimeout.run(`state.users.guest.difficulty=7.4;sb.rpc=async(name)=>name==='consume_prepared_lesson'?new Promise(()=>{}):{data:{id:'guest-job',status:'ready',payload:${guest.run('JSON.stringify(guestPayload)')}},error:null}`);
await consumeTimeout.run('buildSession()');
assert.equal(consumeTimeout.run('session'),null);
assert.equal(consumeTimeout.node('startDaily').disabled,false);
assert.equal(consumeTimeout.alerts.length,1);
console.log('Start confirmation verified: an unresolved consumption request cannot leave the start button locked.');
