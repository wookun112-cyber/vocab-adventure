import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDailyPlan,usageLessonComplete,usageCompleted,nextUsagePlan,DAILY_POLICY} from '../lib/daily-practice.js';
import {studyBudget,learningDay,updateLearningLevels} from '../lib/learning-model.js';
import {makePreparedPlan,browserQuestion} from '../lib/prepared-plan.js';
const day=learningDay(),fresh=Array.from({length:5},(_,i)=>({w:'새어휘'+i,d:'일을 함께 살펴보는 뜻',band:2,cat:'국어'}));
const reviews=Array.from({length:10},(_,i)=>({w:'복습어휘'+i,d:'생각이나 행동을 나타내는 뜻',band:i%3===0?1:2,cat:'국어'}));
const learner={difficulty:2,words:Object.fromEntries(reviews.map(w=>[w.w,{seen:1,correct:0,wrong:1,streak:0,introducedAt:'2026-09-01',nextReviewAt:day}])),recentProblems:[]};
const original=JSON.stringify(learner),plans=buildDailyPlan(fresh,reviews,w=>learner.words[w]||{},2);
assert.equal(plans.length,15);assert.equal(new Set(plans.map(p=>p.w.w)).size,15);assert.equal(plans.filter(p=>p.needsCard).length,5);assert.equal(plans.filter(p=>p.review).length,10);
assert.equal(studyBudget(learner).limit,null);assert.equal(studyBudget(learner).newCount,5);
assert.equal(studyBudget({words:Object.fromEntries(fresh.map(w=>[w.w,{introducedAt:day}]))}).newCount,0);
const result=(p,credit=1)=>({word:p.w.w,type:p.type,credit,contextSuccess:credit===1,hintUsed:false,revealed:false,band:p.w.band,remedial:!!p.remedial});
assert.equal(usageLessonComplete(fresh,fresh.map(w=>({word:w.w,type:'mc_usage',credit:1,contextSuccess:true}))),false,'recognition never completes a word');
let p={...plans[4],type:'subjective_use'},history=[];
for(let i=0;i<120;i++){history.push(result(p,0));const next=nextUsagePlan(p,history,i+15);assert.notEqual(next.type,p.type);assert.equal(next.w.w,p.w.w);p=next;}
history.push({...result({...p,type:'subjective_use'}),hintUsed:true});assert.equal(usageCompleted(history).size,0);
history.push(result({...p,type:'subjective_use'}));assert.equal(nextUsagePlan(p,history,200),null);
const first=[...fresh,...reviews].map(w=>({word:w.w,type:'mc_usage',credit:0,band:w.band}));
const retries=[...fresh,...reviews].map(w=>({word:w.w,type:'subjective_use',credit:1,contextSuccess:true,band:w.band,remedial:true}));
const a=updateLearningLevels({difficulty:2,words:{}},first),b=updateLearningLevels({difficulty:2,words:{}},[...first,...retries]);assert.equal(b.score,a.score);assert.equal(b.to,a.to,'eventual correction must not erase the original errors');
const catalog=[...fresh,...reviews].map(w=>({word:w.w,definition:w.d,band:w.band,domain:w.cat}));
const packet=makePreparedPlan(learner,{},catalog,'family','guest');assert.equal(packet.plans.length,15);assert.equal(packet.newWords.length,5);assert.equal(packet.baseCount,15);assert.equal(packet.completionPolicy,DAILY_POLICY);assert.equal(JSON.stringify(learner),original);
function answerFor(p){return browserQuestion({type:p.type,prompt:'검수된 과제',context:p.type==='subjective_use'?'':'서로 다른 탐험 기록 '+p.id+'에서 뜻에 맞는 행동을 살펴보았어요.',showTarget:p.type!=='subjective_recall',options:p.type.startsWith('mc_')?Array.from({length:5},(_,i)=>({text:'다른 상황 '+p.id+' 보기 '+i,correct:i===p.answerSlot})):[],hints:[],learningCard:p.needsCard?{definition:p.w.d,example:'뜻을 확인하는 새 학습 자료 '+p.id,nonExample:'다른 뜻의 상황'}:null,signature:'검수-'+p.id,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}},p)}
packet.ready=packet.plans.map((p,i)=>[i,answerFor(p)]);
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
function fixture(saved){
 const nodes=new Map(),alerts=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,style:{},appendChild(){},classList:{add(...x){x.forEach(v=>classes.add(v))},remove(...x){x.forEach(v=>classes.delete(v))},contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x)}}})}return nodes.get(id)};
 const ctx=vm.createContext({AbortSignal,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,authoredQuestionValid:authoredPolicy.authoredQuestionValid,sentenceUseQuestionValid,console,Date,Math,Promise,Map,Set,setTimeout,clearTimeout,window:{scrollTo(){}},document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>node('option')},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert:x=>alerts.push(x),createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},rpc:async name=>({data:name==='consume_prepared_lesson'?true:{id:'packet',status:'ready',payload:{...packet,snapshot:vm.runInContext('preparationSnapshot(state.selected)',ctx)}}}),from:()=>({upsert:async()=>({error:null})})})});
 const run=s=>vm.runInContext(s,ctx);
 run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);
 ctx.answerFor=answerFor;run("authUser={id:'family'};loadedAccount=authUser.id;state.selected='guest';warmDailyQuestions=()=>{};fetchValidatedQuestions=async plans=>plans.map(answerFor)");
 run('state.users.guest=Object.assign(freshChild("게스트"),'+JSON.stringify(learner)+')');if(saved)run('state=mergeState('+JSON.stringify(saved)+')');return {run,node,alerts};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
let f=fixture();await f.run('buildSession()');assert.ok(f.run('session'),f.alerts.join(' | '));assert.equal(f.run('session.target'),15);assert.equal(f.run('session.max'),null);
let steps=0,resumed=false;
while(!f.run('session.completed')){
 if(f.run('!session.introDone&&current>=session.introAt')){while(f.run('!session.introDone'))f.run('nextIntro()');}
 const type=f.run('session.queue[current].type'),word=f.run('session.queue[current].w.w');
 if(type==='subjective_use'){assert.equal(f.node('qContext').textContent,'');assert.ok(f.node('qText').textContent.includes(word));assert.ok(f.node('qText').textContent.endsWith('뜻이 드러나는 문장 하나를 만들어 보세요.'));}
 // Keep every sentence incorrect until after the old 30-question ceiling.
 const credit=type==='subjective_use'&&steps<65?0:1;
 f.run("applyResult(session.queue[current],"+JSON.stringify(credit?'○':'×')+",'피드백','',{credit:"+credit+",contextSuccess:"+!!credit+",targetRecall:false,independent:true})");steps++;await flush();
 if(steps===9||steps===42){const saved=JSON.parse(f.run('JSON.stringify(state)'));const before=f.run('JSON.stringify(session.results)');f=fixture(saved);await f.run('buildSession()');assert.equal(f.run('current'),steps);assert.equal(f.run('JSON.stringify(session.results)'),before);resumed=true;continue;}
 if(steps===35){f.run('finishSession()');assert.equal(f.run('session.completed'),undefined);assert.ok(f.run('child().activeLesson'));assert.equal(f.run('child().sessions.length'),0,'pausing cannot claim completion');}
 await f.run('nextQuestion()');
 assert.ok(steps<180,'eventually all words must finish');
}
assert.ok(resumed&&steps>65);assert.equal(f.run('usageCompleted(session.results).size'),15);assert.equal(f.run('child().activeLesson'),null);assert.equal(f.run('child().sessions.length'),1);assert.ok(f.run('child().sessions[0].wrong')>0);assert.equal(f.run('studyBudget(child()).newCount'),0);
assert.ok(f.alerts.some(x=>x.startsWith('문장 사용 확인 완료')));assert.ok(!f.alerts.some(x=>x.includes('준비하지 못')));
console.log('Unlimited usage verified: 5 new + 10 distinct review targets; 120 failed attempts alternate types; only meaningful unhinted sentences complete words; original grades retained; actual client continues beyond 65 tasks, resumes after answers 9 and 42, pauses without completion, and finishes exactly once after 15 usage confirmations.');
