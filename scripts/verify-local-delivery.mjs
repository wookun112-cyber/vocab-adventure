import * as studyHistory from '../lib/study-history.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bundlePractice,approvedRemediation} from '../api/practice-pool.js';
import {prepare} from '../api/prepare-worker.js';
import {makePreparedPlan,passageKeys} from '../lib/prepared-plan.js';
import {authoredCurriculum} from '../api/authored-bank.js';
import {AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid} from '../lib/authored-policy.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {DELIVERY_POLICY,localPracticeQuestion,deliveryQuestionValid} from '../lib/local-delivery.js';
import {nextUsagePlan,usageLessonComplete,DAILY_POLICY} from '../lib/daily-practice.js';

const curriculum=authoredCurriculum(AUTHORED_OWNER);
const fixtures=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):[1.8,2.1,7.4].map((difficulty,i)=>{
 const eligible=curriculum.filter(w=>w.band===Math.round(difficulty));
 const learner={difficulty,words:Object.fromEntries(eligible.slice(0,10).map(w=>[w.word,{seen:1,wrong:1,streak:0,supportLevel:0}]))};
 return {id:'local-'+i,kind:'daily',profile:['inseong','ayoung','guest'][i],learner,catalog:{}};
});
const enriched=[];let count=0,totalAlternatives=0;
for(const fixture of fixtures){
 const learner=structuredClone(fixture.learner),before=JSON.stringify(learner);let generationCalls=0;
 const packet=await prepare({...fixture,account:AUTHORED_OWNER,learner},'test',async()=>{generationCalls++;throw Error('Unexpected generation')},async()=>true);
 enriched.push({...fixture,payload:packet});
 if(fixture.payload){assert.deepEqual(packet.ready,fixture.payload.ready);assert.deepEqual(packet.plans,fixture.payload.plans)}
 assert.equal(generationCalls,0);assert.equal(JSON.stringify(learner),before);assert.equal(packet.ready.length,packet.plans.length);assert.equal(packet.deliveryPolicy,DELIVERY_POLICY);
 totalAlternatives+=packet.practicePool.length;
 const ready=packet.ready.map(([,q])=>q),history=[],word=packet.baseWords.find(w=>packet.practicePool.some(q=>q.w.w===w.w&&q.type!=='subjective_use'));
 if(!word)continue;
 const original=packet.plans.find(p=>p.w.w===word.w),originalQuestions=JSON.stringify(ready),seen=new Set(ready.filter(q=>q.w.w===word.w).flatMap(q=>passageKeys(q.ctx,q.opts.map(o=>o.t))));
 let alternatives=0;
 for(let i=0;i<48;i++){
  const plan=nextUsagePlan(original,history,packet.plans.length+i,{supportLevel:i>3?1:0});
  const q=localPracticeQuestion(plan,learner,packet.practicePool,ready,AUTHORED_OWNER);assert.ok(q,'all retries are available synchronously');
  if(q.type!==plan.type){assert.equal(q.bankFallbackFrom,plan.type);plan.type=q.type}
  assert.ok(deliveryQuestionValid(q,plan,learner.difficulty,AUTHORED_OWNER));
  if(q.type!=='subjective_use'){
   alternatives++;for(const key of passageKeys(q.ctx,q.opts.map(o=>o.t))){assert.ok(!seen.has(key)||q.repeatedRemediation===true,'only exhausted approved remediation may repeat');seen.add(key)}
   assert.ok(!deliveryQuestionValid({...q,w:{...q.w,band:q.w.band===1?8:1}},plan,learner.difficulty,AUTHORED_OWNER));
   assert.ok(!deliveryQuestionValid({...q,bankReaderLevel:learner.difficulty+1},{...plan,coveragePolicy:null,realtimeLevelPolicy:null},learner.difficulty,AUTHORED_OWNER));
  }else {assert.equal(q.ctx,'');assert.deepEqual(q.acceptedAnswers,[]);assert.equal(q.semanticGraderRequired,true)}
  ready.push(q);history.push({word:word.w,type:q.type,credit:0,contextSuccess:false});
 }
 assert.ok(alternatives>0);assert.equal(JSON.stringify(ready.slice(0,packet.ready.length)),originalQuestions);
 assert.equal(usageLessonComplete([word],history),false,'exhaustion never awards completion');
 assert.equal(usageLessonComplete([word],[...history,{word:word.w,type:'subjective_use',credit:1,contextSuccess:true}]),true);
 // Run the actual app pump, with generation/network deliberately unavailable.
 const nodes=new Map(),storage=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',style:{},classList:{add(){},remove(){},toggle(){}}});return nodes.get(id)};
 const context=vm.createContext({studyHistory,AbortSignal,AUTHORED_OWNER,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,console,Map,Set,Date,Math,Promise,setTimeout,clearTimeout,
  document:{getElementById:node,querySelectorAll:()=>[]},window:{scrollTo(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  createClient:()=>({}),fetch:()=>{throw Error('Question network must not run')},alert(){}});
 vm.runInContext(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''),context);
 vm.runInContext(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''),context);
 vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0],context);
 context.packet=packet;context.learner=learner;context.word=word;context.original=original;
 vm.runInContext(`state.selected=packet.profile;state.users[packet.profile]=learner;authUser={id:AUTHORED_OWNER};localSave=()=>{};cloudSave=()=>{};
  globalThis.networkRequests=0;fetchValidatedQuestions=()=>{networkRequests++;throw Error('Unexpected question request')};
  globalThis.p=createPreparation({...packet,key:'local-test',adopted:true},packet.ready);
  globalThis.results=[];`,context);
 for(let i=0;i<48;i++){
  vm.runInContext(`globalThis.plan=nextUsagePlan(original,results,p.plans.length,{supportLevel:0});p.append([plan]);p.pump();globalThis.q=p.ready.get(p.plans.length-1);results.push({word:word.w,type:q.type,credit:0,contextSuccess:false})`,context);
 }
 assert.equal(vm.runInContext('networkRequests',context),0);assert.equal(vm.runInContext('p.ready.size',context),packet.plans.length+48);
 const saved=JSON.parse(vm.runInContext('JSON.stringify({plans:p.plans,ready:[...p.ready],practicePool:p.practicePool,deliveryPolicy:p.deliveryPolicy})',context));
 context.saved=saved;
 vm.runInContext(`globalThis.restarted=createPreparation({...packet,...saved,key:'restart',adopted:true},saved.ready);restarted.append([nextUsagePlan(original,results,restarted.plans.length,{supportLevel:0})]);restarted.pump()`,context);
 assert.equal(vm.runInContext('networkRequests',context),0);assert.equal(vm.runInContext('restarted.ready.size',context),saved.plans.length+1);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify([...restarted.ready].slice(0,saved.ready.length))',context)),saved.ready);
 vm.runInContext(`session={baseWords:[word],queue:restarted.queue,preparation:restarted};restarted.append(makeExtensionPlan(restarted.plans.length,6));restarted.pump()`,context);
 assert.equal(vm.runInContext('restarted.ready.size',context),saved.plans.length+7,'level-check extensions also use local variants');
 assert.equal(vm.runInContext('networkRequests',context),0);
 // Exhausted bank history still carries a canonical MC bridge, without mutation.
 const exhausted=structuredClone(learner),all=packet.practicePool.filter(q=>q.w.w===word.w);
 exhausted.words??={};exhausted.words[word.w]={...(exhausted.words[word.w]||{}),problemHistory:all.map(q=>({signature:q.signature,context:q.ctx,options:q.opts.map(o=>o.t)})),usedPassageKeys:all.flatMap(q=>passageKeys(q.ctx,q.opts.map(o=>o.t)))};
 const beforeExhausted=JSON.stringify(exhausted),remedial={...original,type:'mc_usage',stage:'bridge',review:true,firstLearning:false,needsCard:false,sentenceCyclePolicy:'sentence-first-7-30-20261021'};
 const bundled=bundlePractice({plans:[remedial],ready:[]},exhausted,AUTHORED_OWNER,[],all);
 assert.ok(bundled.practicePool.some(q=>q.type.startsWith('mc_')),'exhausted histories retain approved MC');
 assert.equal(JSON.stringify(exhausted),beforeExhausted);
 const replacement=approvedRemediation(remedial,exhausted,AUTHORED_OWNER);assert.ok(replacement);
 assert.equal(approvedRemediation({...remedial,w:{...word,d:'unapproved meaning'}},exhausted,AUTHORED_OWNER),null);
 // Legacy resume: answered prefix intact, missing MC, sentence-only pool, concurrent pumps.
 context.remedial=remedial;context.replacement=replacement;
 vm.runInContext(`globalThis.repairCalls=0;sb.auth={};sb.auth.getSession=async()=>({data:{session:{access_token:'test'}}});
  fetch=async()=>{repairCalls++;return {ok:true,json:async()=>({question:replacement})}};
  globalThis.legacy=createPreparation({...packet,plans:[...packet.plans,remedial],practicePool:packet.practicePool.filter(q=>q.type==='subjective_use'),key:'legacy',adopted:true},packet.ready);
  legacy.pump();legacy.pump();globalThis.wait=legacy.waitFor(packet.plans.length,true);`,context);
 await context.wait;
 assert.equal(vm.runInContext('repairCalls',context),1,'concurrent waits share one bank repair');
 assert.equal(vm.runInContext('legacy.ready.get(packet.plans.length).type',context),'mc_usage');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify([...legacy.ready].slice(0,packet.ready.length))',context)),packet.ready);
 vm.runInContext(`fetch=async()=>({ok:false});
  globalThis.failedRepair=createPreparation({...packet,plans:[remedial],practicePool:[],key:'failed-repair',adopted:true},[]);
  failedRepair.pump();globalThis.failedWait=failedRepair.waitFor(0,true);`,context);
 await assert.rejects(context.failedWait,/검수된 복습/);
 assert.equal(vm.runInContext('failedRepair.ready.size',context),0,'failed repair never fabricates completion');
 vm.runInContext(`fetch=async()=>({ok:true,json:async()=>({question:replacement})});globalThis.retryWait=failedRepair.waitFor(0,true)`,context);
 await context.retryWait;
 assert.equal(vm.runInContext('failedRepair.ready.size',context),1,'failed recovery can retry');
 count++;
}
assert.ok(count>0);
const route=fs.readFileSync(new URL('../api/questions.js',import.meta.url),'utf8').split('export default async function handler')[1];
assert.ok(!route.includes('buildValidated('),'interactive delivery never invokes AI generation');
console.log(`Local delivery verified: ${count} packets, ${totalAlternatives} bundled alternatives, 48 failed retries per packet and restart with zero question-network requests, no repeated bank passages, unchanged prepared prefix/learner and sentence-only completion.`);

if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(enriched),{mode:0o600});
