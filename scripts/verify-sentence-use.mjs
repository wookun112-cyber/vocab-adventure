import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {authoredQuestionValid,AUTHORED_REVISION} from '../lib/authored-policy.js';
import {sentenceUseQuestion,sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import {browserQuestion,makePreparedPlan} from '../lib/prepared-plan.js';
import {prepare} from '../api/prepare-worker.js';
import questionsHandler from '../api/questions.js';
import {authoredQuestion} from '../api/authored-bank.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';

const targets=[{w:'추산',d:'짐작으로 수나 양을 계산함',band:5,cat:'국어'},
 {w:'예측',d:'근거나 정보를 바탕으로 앞으로를 미리 판단함',band:3,cat:'사고'}];
const itemFor=(w,i=0)=>({id:String(i),word:w.w,definition:w.d,domain:w.cat,band:w.band,readerLevel:w.band,type:'subjective_use',review:true,needsCard:false});
const client=vm.createContext({studyHistory,AUTHORED_REVISION,authoredQuestionValid,sentenceUseQuestionValid,DELIVERY_POLICY,localPracticeQuestion,AbortSignal,console,setTimeout,clearTimeout,
 document:{getElementById:()=>({classList:{add(){},remove(){},toggle(){}},style:{}}),querySelectorAll:()=>[]},
 window:{scrollTo(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})});
vm.runInContext(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''),client);
vm.runInContext(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''),client);
vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0],client);
vm.runInContext('authUser={id:'+JSON.stringify(AUTHORED_OWNER)+'}',client);
for(const w of targets){
 const item=itemFor(w),plan={id:item.id,w,type:'subjective_use',stage:'use',review:true,needsCard:false,taskDemand:'standard',supportLevel:0};
 assert.equal(authoredQuestion(item,AUTHORED_OWNER),null,'legacy target is outside the authored archive');
 const raw=sentenceUseQuestion(item),q=browserQuestion(raw,plan);
 client.question=q;client.plan=plan;assert.ok(vm.runInContext('validPreparedQuestion(question,plan)',client),'actual app accepts the fixed template');
 assert.equal(raw.validation.aiVerified,false,'fixed templates do not claim AI review');
 assert.ok(sentenceUseQuestionValid(q,plan));assert.equal(q.ctx,'');assert.deepEqual(q.opts,[]);assert.equal(q.semanticGraderRequired,true);
 for(const patch of [{q:q.q+' 예문입니다.'},{ctx:'모범 문장을 미리 보여 줍니다.'},{acceptedAnswers:[w.w]},{semanticGraderRequired:false},
  {showTarget:false},{opts:[{t:'답',ok:true}]},{hints:['모범 문장']},{signature:'unverified'},
  {validation:{...q.validation,aiVerified:true}},{validation:{...q.validation,sourceRevision:'old'}},{w:{...q.w,d:'다른 뜻'}}]){
  assert.equal(sentenceUseQuestionValid({...q,...patch},plan),false,'tampered instruction or target must be rejected');
 }
 for(const patch of [{type:'mc_usage'},{type:'subjective_recall'},{needsCard:true},{band:7.4},{word:'상징적 장치'}])assert.equal(sentenceUseQuestion({...item,...patch}),null);
 const learner={difficulty:w.band,words:{[w.w]:{seen:2,correct:1,wrong:1,streak:1}}};
 const packet=makePreparedPlan(learner,{[w.w]:w},[],AUTHORED_OWNER,'test',{reviewOnly:true});
 packet.plans=[plan];packet.ready=[];packet.budget.target=1;packet.budget.availableReviews=1;packet.budget.waitingForReviews=false;
 let generations=0;
 const before=JSON.stringify(learner),originalPlans=JSON.stringify(packet.plans);
 const completed=await prepare({id:'template-test',account:AUTHORED_OWNER,profile:'test',kind:'reserve',slot:1,learner,catalog:{[w.w]:w},payload:packet},'local',async()=>{generations++;throw Error('Unexpected AI generation')},async(_name,args)=>{assert.ok(sentenceUseQuestionValid(args.p_payload.ready[0][1],plan));return true});
 assert.equal(generations,0);assert.equal(completed.ready.length,1);assert.equal(JSON.stringify(completed.plans),originalPlans);assert.equal(JSON.stringify(learner),before);
}

// Requests during unlimited practice get the same fixed instruction without
// needing a generation key. Grading remains a separate submitted-answer API.
const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
let networkCalls=0;
try{
 delete process.env.OPENAI_API_KEY;
 globalThis.fetch=async url=>{networkCalls++;assert.ok(String(url).endsWith('/auth/v1/user'),'only the login check may access the network');return new Response(JSON.stringify({id:AUTHORED_OWNER}),{status:200})};
 const response={status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await questionsHandler({method:'POST',headers:{authorization:'Bearer local-test'},body:{items:targets.map(itemFor)}},response);
 assert.equal(response.code,200);assert.equal(response.body.questions.length,2);assert.equal(networkCalls,1);
 assert.ok(response.body.questions.every(q=>q.validation.source==='sentence_use_template'&&q.semanticGraderRequired));
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey}

// Optional private production fixtures are read locally, never committed.
if(process.argv[2]){
 const fixtures=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(const f of fixtures){
  const packet=structuredClone(f.payload),learner=structuredClone(f.learner);
  const initialReady=new Map(structuredClone(packet.ready)),beforeLearner=JSON.stringify(learner),beforePlans=JSON.stringify(packet.plans);
  assert.equal(packet.plans.length,10);assert.equal(initialReady.size,9);
  let generations=0;
  const completed=await prepare({id:f.id,account:AUTHORED_OWNER,profile:f.profile,kind:f.kind,slot:1,learner,catalog:f.catalog,payload:packet},'local',async()=>{generations++;throw Error('Unexpected production-fixture AI generation')},async()=>true);
  assert.equal(generations,0);assert.equal(completed.ready.length,10);assert.equal(JSON.stringify(completed.plans),beforePlans);assert.equal(JSON.stringify(learner),beforeLearner);
  const finalReady=new Map(completed.ready);
  for(const [i,q] of initialReady)assert.deepEqual(finalReady.get(i),q,'each of nine already prepared questions stays byte-equivalent');
  const missing=completed.ready.find(([i])=>!initialReady.has(i));assert.ok(sentenceUseQuestionValid(missing[1],completed.plans[missing[0]]));
 }
 console.log('Private production fixtures verified: four 9/10 packets become 10/10 with zero generation requests; every existing question, plan and learner record preserved.');
}
console.log('Own-sentence templates verified: legacy targets, exact prompts, no examples or answer leaks, tamper rejection, no generation key, and semantic grading required.');
