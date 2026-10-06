import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',classList:{add(){},remove(){},toggle(){}},style:{}});return nodes.get(id)};
const alerts=[];
const ctx=vm.createContext({console,setTimeout,clearTimeout,Map,Set,Date,Math,Promise,
 document:{getElementById:node,querySelectorAll:()=>[]},window:{scrollTo(){}},
 localStorage:{setItem(){}},alert:m=>alerts.push(m),fetch:()=>{throw new Error('unexpected network')},
 createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}})
});
let source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
source=source.slice(0,source.indexOf("window.addEventListener('beforeinstallprompt'"));
vm.runInContext(source,ctx);
const run=code=>vm.runInContext(code,ctx);
// Keep records distinct and fail if the question loader changes them.
run(`state.selected='guest'; state.users.guest.words['근거'].seen=7;
 wordState('근거');globalThis.records=JSON.stringify(state.users);
 globalThis.word={w:'근거',d:'생각의 까닭',band:2,cat:'국어'};
 globalThis.plans=makeQuestionPlan([word],[word],20);
 globalThis.calls=[];
 fetchValidatedQuestions=async plans=>{calls.push(plans.length);return plans.map(p=>({w:p.w,type:p.type,signature:'s'+p.id}))};
 ensureCatalog=async()=>{};chooseNew=()=>[word];chooseReview=()=>[word];
 globalThis.shown=[];renderIntro=()=>{throw new Error('Answer preview before quiz')};renderQuestion=()=>{};show=id=>shown.push(id);
 prefetchQuestions=()=>{};
`);
await run('buildSession()');
assert.equal(run('session.intros.length'),0);
assert.equal(run('shown[0]'),'learn');
assert.equal(run('session.queue.length'),4);
assert.equal(run('session.pendingPlans.length'),16);
assert.equal(run('session.target'),20);
assert.equal(run("plans.filter(p=>p.type.startsWith('mc_')).length"),10);
assert.equal(run('JSON.stringify(state.users)'),run('records'));
assert.equal(node('startDaily').disabled,false);
// One request at a time, even when prefetch and next-button requests overlap.
run(`globalThis.release=null;fetchValidatedQuestions=plans=>new Promise(resolve=>{calls.push(plans.length);release=()=>resolve(plans.map(p=>({w:p.w,type:p.type,signature:'s'+p.id})))})`);
const first=run('extendSessionQuestions()'),second=run('extendSessionQuestions()');
assert.equal(run('calls.length'),2);
run('release()');await Promise.all([first,second]);
assert.equal(run('session.queue.length'),8);
assert.equal(run('session.pendingPlans.length'),12);
// Failed batches retain plans and answered records, and can be retried.
run(`current=7;session.results=[{result:'◎',credit:1}];fetchValidatedQuestions=async()=>{throw new Error('timeout')}`);
await run('nextQuestion()');
assert.equal(run('current'),7);
assert.equal(run('session.target'),20);
assert.equal(run('session.pendingPlans.length'),12);
assert.equal(run('session.results.length'),1);
assert.equal(node('next').disabled,false);
run(`fetchValidatedQuestions=async plans=>plans.map(p=>({w:p.w,type:p.type,signature:'s'+p.id}))`);
await run('nextQuestion()');
assert.equal(run('current'),8);
assert.equal(run('session.queue.length'),12);
// Complete the initial 20, then load adaptive extensions in small batches.
await run('extendSessionQuestions()');await run('extendSessionQuestions()');
assert.equal(run('session.queue.length'),20);
assert.equal(run('session.pendingPlans.length'),0);
run('session.target=26');await run('extendSessionQuestions()');await run('extendSessionQuestions()');
assert.equal(run('session.queue.length'),26);
assert.equal(run('JSON.stringify(state.users)'),run('records'));
const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url)));
assert.equal(config.functions['api/questions.js'].maxDuration,300);
console.log('Question batching verified: initial 4, single-flight, failure retry, 20→26 extension, records preserved.');
// A comparison situation is valid; asking learners to compare two target words is not.
const backend=vm.createContext({console,process,Map,Set});
const api=fs.readFileSync(new URL('../api/questions.js',import.meta.url),'utf8')
 .replace('export async function buildValidated','async function buildValidated')
 .replace('export default async function handler','async function handler');
vm.runInContext(api,backend);
const compare=s=>vm.runInContext(`hasCompare(${JSON.stringify(s)})`,backend);
assert.equal(compare('차이점이라는 말을 쓰기에 알맞은 상황을 고르세요.'),false);
assert.equal(compare('두 단어의 차이를 설명하세요.'),true);
assert.equal(compare('“원인”과 “결과”의 차이를 고르세요.'),true);
console.log('Validation regression verified: comparison vocabulary allowed; two-target comparison rejected.');

// Feedback comes after the attempt; same-day repeats are practice, not mastery evidence.
run(`cloudSave=()=>{};session.results=[];current=0;
 globalThis.q={w:{w:'새표제어',d:'새 단어 뜻',band:2},type:'subjective_context',signature:'새 상황'};
 applyResult(q,'◎','문맥 해설','',{credit:1,contextSuccess:true,targetRecall:true,independent:true});`);
assert.equal(run("wordState('새표제어').independentCorrect"),1);
const due=run("wordState('새표제어').nextReviewAt");
run(`applyResult(q,'◎','문맥 해설','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})`);
assert.equal(run("wordState('새표제어').correct"),2);
assert.equal(run("wordState('새표제어').independentCorrect"),1);
assert.equal(run("wordState('새표제어').streak"),1);
assert.equal(run("wordState('새표제어').nextReviewAt"),due);
assert.equal(run('session.results.at(-1).practiceOnly'),true);
assert.ok(node('feedback').innerHTML.includes('새 단어 뜻'));
run(`session.results=[];applyResult(q,'◎','문맥 해설','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})`);
assert.equal(run("wordState('새표제어').independentCorrect"),1);
run(`wordState('새표제어').lastFeedbackDate=dayOffset(-1);session.results=[];
 applyResult(q,'◎','다른 문맥 해설','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})`);
assert.equal(run("wordState('새표제어').independentCorrect"),2);
assert.equal(run("wordState('새표제어').streak"),2);
console.log('Learning flow verified: no pre-answer definition; same-day repetitions preserve scores without inflating mastery or review intervals.');
