import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(){
 const nodes=new Map(),local=new Map(),signIns=[],reads=[],writes=[],writeResponses=[],fetches=[],timers=new Map();
 const node=id=>{
  if(!nodes.has(id)){
   const classes=new Set();
   nodes.set(id,{value:'',disabled:false,textContent:'',innerHTML:'',style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,v){if(v??!classes.has(x))classes.add(x);else classes.delete(x)}}});
  }
  return nodes.get(id);
 };
 const ctx=vm.createContext({studyHistory,AbortController,AbortSignal,URL,Request,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,authoredQuestionValid:authoredPolicy.authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,console,Date,Math,Map,Set,Promise,
  setTimeout(fn,delay){if(delay===12000){const id=Symbol('login-deadline');timers.set(id,fn);return id}return setTimeout(fn,delay)},
  clearTimeout(id){if(timers.has(id))timers.delete(id);else clearTimeout(id)},
  fetch:(input,options)=>new Promise((resolve,reject)=>fetches.push({input,options,resolve,reject})),
  alert(){},window:{scrollTo(){}},document:{getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)},
  createClient:(_url,_key,config)=>({
   auth:{signInWithPassword:credentials=>new Promise((resolve,reject)=>signIns.push({credentials,resolve,reject})),signUp(){throw Error('Unexpected account creation')},resend(){throw Error('Unexpected email')}},
   from:()=>({select:()=>({eq:(_key,account)=>({maybeSingle:()=>new Promise(resolve=>reads.push({account,resolve}))})}),upsert:async row=>{writes.push(row);return writeResponses.shift()||{error:null}}}),
   config
  })
 });
 const run=x=>vm.runInContext(x,ctx);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));
 run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));
 run(source);
 run('ensureCatalog=async()=>{};warmDailyQuestions=()=>{};curriculumStatus=async()=>null');
 node('email').value=' family@example.test ';node('password').value=' test-password ';
 return {ctx,run,node,local,signIns,reads,writes,writeResponses,fetches,timers};
}

for(const error of [{status:504,code:'invalid_credentials'},{status:503},{code:'request_timeout'}]){
 const f=fixture(),before=f.run('JSON.stringify(state)');
 const pending=f.run('login()');assert.equal(f.node('signIn').disabled,true);
 await f.run('login()');assert.equal(f.signIns.length,1,'repeated click/Enter shares the pending attempt');
 assert.equal(f.signIns[0].credentials.email,'family@example.test');
 assert.equal(f.signIns[0].credentials.password,' test-password ','password whitespace is preserved');
 f.signIns[0].resolve({data:null,error});await pending;
 assert.match(f.node('authMsg').textContent,/서버 연결이 지연/);
 assert.doesNotMatch(f.node('authMsg').textContent,/비밀번호/);
 assert.equal(f.node('password').value,' test-password ');
 assert.equal(f.node('signIn').disabled,false);
 assert.equal(f.run('JSON.stringify(state)'),before);
 assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);assert.equal(f.local.size,0);
}
for(const [error,expected] of [
 [{status:400,code:'invalid_credentials'},/이메일 또는 비밀번호가 일치하지/],
 [{status:429},/요청이 많아/],
 [{code:'email_not_confirmed'},/이메일 확인이 필요/],
 [{status:400,code:'unexpected_failure'},/완료하지 못/]
]){
 const f=fixture(),pending=f.run('login()');f.signIns[0].resolve({data:null,error});await pending;
 assert.match(f.node('authMsg').textContent,expected);assert.equal(f.node('signIn').disabled,false);
}
{
 const f=fixture(),pending=f.run('login()');f.signIns[0].reject(new TypeError('Failed to fetch'));await pending;
 assert.match(f.node('authMsg').textContent,/서버에 연결하지 못/);
 assert.equal(f.node('email').disabled,false);assert.equal(f.node('password').disabled,false);
 f.node('password').value='';await f.run('login()');assert.equal(f.signIns.length,1,'blank fields never call the server');
}
{
 const f=fixture();
 const remote=JSON.parse(f.run('JSON.stringify(initial())'));
 remote.users.ayoung.difficulty=4;remote.users.ayoung.words['근거'].seen=9;
 remote.users.ayoung.sessions=[{id:'saved-session',score:80}];
 f.ctx.remote=remote;f.run("state=mergeState(remote);authUser={id:'family',email:'family@example.test'}");
 const before=f.run('JSON.stringify(state)'),pending=f.run('login()');
 f.signIns[0].resolve({data:{session:{user:{id:'family',email:'family@example.test'}}},error:null});await tick();
 const duplicate=f.run("applyAuth({user:{id:'family'}})");await tick();
 assert.equal(f.reads.length,1,'sign-in result and Auth event share a single record read');
 f.reads[0].resolve({data:null,error:{status:504,message:'upstream timed out'}});await pending;await duplicate;
 assert.match(f.node('authMsg').textContent,/로그인은 확인됐지만/);
 assert.doesNotMatch(f.node('authMsg').textContent,/비밀번호/);
 assert.equal(f.node('retryRecords').classList.contains('hidden'),false);
 assert.equal(f.node('retryRecords').disabled,false);
 assert.equal(f.run('JSON.stringify(state)'),before,'failed hydration preserves owned records');
 assert.equal(f.run('loadedAccount'),null);assert.equal(f.writes.length,0);
 const retry=f.run('retryRecords()');await tick();
 await f.run('retryRecords()');assert.equal(f.reads.length,2,'record retries are coalesced');
 assert.equal(f.signIns.length,1,'record retry does not submit credentials again');
 f.reads[1].resolve({data:{state:remote},error:null});await retry;
 assert.equal(f.run('canSaveLearning()'),true);assert.equal(f.run('child().difficulty'),4);
 assert.equal(f.run("child().words['근거'].seen"),9);
 assert.equal(f.node('authGate').classList.contains('hidden'),true);
 assert.equal(f.node('retryRecords').classList.contains('hidden'),true);
 assert.equal(f.node('signIn').disabled,false);
}
{
 const f=fixture();
 assert.equal(f.run('sb.config.global.fetch===authFetch'),true);
 const pending=f.run("authFetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST'})");
 const call=f.fetches[0];
 call.options.signal.addEventListener('abort',()=>call.reject(Object.assign(new Error('Aborted'),{name:'AbortError'})),{once:true});
 assert.equal(f.timers.size,1);for(const callback of f.timers.values())callback();
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(call.options.signal.aborted,true);assert.equal(f.timers.size,0,'timeout cancels the underlying request and clears its timer');
 const plain=f.run("authFetch(SUPABASE_URL+'/rest/v1/app_state',{method:'GET'})");
 assert.equal(f.timers.size,0);assert.equal(f.fetches[1].options.signal,undefined,'record and API requests keep their existing behavior');
 f.fetches[1].resolve({ok:true});await plain;
 f.ctx.externalController=new AbortController();
 const cancelled=f.run("authFetch(new Request(SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',signal:externalController.signal}))");
 const third=f.fetches[2];third.options.signal.addEventListener('abort',()=>third.reject(Object.assign(new Error('Cancelled'),{name:'AbortError'})),{once:true});
 f.ctx.externalController.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(f.timers.size,0);
}
// A failed server write during login must not be reported as a successful
// cloud sync. The account's latest local state survives the failed attempt.
{
 const f=fixture();
 f.writeResponses.push({error:{message:'canceling statement due to statement timeout',code:'57014'}});
 const pending=f.run("applyAuth({user:{id:'family',email:'family@example.test'}})");
 await tick();
 f.reads[0].resolve({data:null,error:null});
 await pending;
 assert.equal(f.run('loadedAccount'),null,'a failed initial state flush cannot unlock cloud learning');
 assert.equal(f.node('authGate').classList.contains('hidden'),false);
 assert.equal(f.node('retryRecords').classList.contains('hidden'),false);
 assert.equal(f.writes.length,1);
 assert.ok(f.local.has('vocab-account-family'),'local history remains on the device');
 const retry=f.run('retryRecords()');await tick();
 f.reads[1].resolve({data:null,error:null});await retry;
 assert.equal(f.run('canSaveLearning()'),true,'retry recovers without changing credentials');
 assert.equal(f.node('authGate').classList.contains('hidden'),true);
}
// A hung Supabase getSession during pending-grade recovery must not keep the
// family on the 'checking records' overlay indefinitely. Grade recovery can
// retry later without altering the already-loaded learning records.
{
 const f=fixture(),remote=JSON.parse(f.run('JSON.stringify(initial())'));
 remote.users.ayoung.pausedLessonIndex=[{pendingGrades:1}];
 f.ctx.remote=remote;
 f.run('sb.auth.getSession=()=>new Promise(()=>{})');
 const nativeTimeout=f.ctx.setTimeout;
 f.ctx.setTimeout=(fn,ms)=>nativeTimeout(fn,ms===10000?1:ms);
 const pending=f.run("applyAuth({user:{id:'family',email:'family@example.test'}})");
 await tick();
 assert.equal(f.reads.length,1);
 f.reads[0].resolve({data:{state:remote},error:null});
 await pending;
 assert.equal(f.run('canSaveLearning()'),true);
 assert.equal(f.node('authGate').classList.contains('hidden'),true);
 assert.equal(f.run('child().pausedLessonIndex.length'),1,'unrecovered grade metadata is preserved');
}
// A previous background cloud save may stall independently of login. Bound
// the wait and enable an explicit record retry without creating another login.
{
 const f=fixture();
 f.run("authUser={id:'family',email:'family@example.test'};cloudSaveTask=new Promise(()=>{});");
 const nativeTimeout=f.ctx.setTimeout;
 f.ctx.setTimeout=(fn,ms)=>nativeTimeout(fn,ms===10000?1:ms);
 await f.run("applyAuth({user:{id:'family',email:'family@example.test'}})");
 assert.match(f.node('authMsg').textContent,/학습 기록을 불러오지 못/);
 assert.equal(f.run('loadedAccount'),null);
 assert.equal(f.node('retryRecords').disabled,false);
 assert.equal(f.reads.length,0,'blocked previous save cannot start a competing record read');
}
assert.match(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),/withDeadline\(sb\.auth\.getSession\(\),12000/,'initial session hydration has a deadline');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(html,/id="retryRecords"/);assert.match(html,/autocomplete="current-password"/);
console.log('Auth recovery verified: server/credential/network errors distinguished, duplicate login prevented, credentials retained, transport timeout aborted, record retries reuse login and protect saved progress.');
