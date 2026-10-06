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
 globalThis.actualEnsureCatalog=ensureCatalog;ensureCatalog=async()=>{};chooseNew=()=>[word];chooseReview=()=>[word];
 globalThis.shown=[];renderIntro=()=>{throw new Error('Answer preview before quiz')};renderQuestion=()=>{};show=id=>shown.push(id);
 globalThis.actualPrefetch=prefetchQuestions;prefetchQuestions=()=>{};
`);
await run('buildSession()');
assert.equal(run('session.intros.length'),0);
assert.equal(run('shown[0]'),'learn');
assert.equal(run('session.queue.length'),1);
assert.equal(run('session.pendingPlans.length'),19);
assert.equal(run('session.target'),20);
assert.equal(run("plans.filter(p=>p.type.startsWith('mc_')).length"),10);
assert.equal(run('JSON.stringify(state.users)'),run('records'));
assert.equal(node('startDaily').disabled,false);
// One request at a time, even when prefetch and next-button requests overlap.
run(`globalThis.release=null;fetchValidatedQuestions=plans=>new Promise(resolve=>{calls.push(plans.length);release=()=>resolve(plans.map(p=>({w:p.w,type:p.type,signature:'s'+p.id})))})`);
const first=run('extendSessionQuestions()'),second=run('extendSessionQuestions()');
assert.equal(run('calls.length'),2);
run('release()');await Promise.all([first,second]);
assert.equal(run('session.queue.length'),5);
assert.equal(run('session.pendingPlans.length'),15);
// Failed batches retain plans and answered records, and can be retried.
run(`current=4;session.results=[{result:'◎',credit:1}];fetchValidatedQuestions=async()=>{throw new Error('timeout')}`);
await run('nextQuestion()');
assert.equal(run('current'),4);
assert.equal(run('session.target'),20);
assert.equal(run('session.pendingPlans.length'),15);
assert.equal(run('session.results.length'),1);
assert.equal(node('next').disabled,false);
run(`fetchValidatedQuestions=async plans=>plans.map(p=>({w:p.w,type:p.type,signature:'s'+p.id}))`);
await run('nextQuestion()');
assert.equal(run('current'),5);
assert.equal(run('session.queue.length'),9);
// Complete the initial 20, then load adaptive extensions in small batches.
await run('extendSessionQuestions()');await run('extendSessionQuestions()');await run('extendSessionQuestions()');
assert.equal(run('session.queue.length'),20);
assert.equal(run('session.pendingPlans.length'),0);
run('session.target=26');await run('extendSessionQuestions()');await run('extendSessionQuestions()');
assert.equal(run('session.queue.length'),26);
assert.equal(run('JSON.stringify(state.users)'),run('records'));
const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url)));
assert.equal(config.functions['api/questions.js'].maxDuration,300);
console.log('Question batching verified: initial 1, single-flight, failure retry, 20→26 extension, records preserved.');
// Refill continuously after the first question; stop once at least eight are ready.
run(`current=0;session.queue=session.queue.slice(0,1);session.target=20;session.pendingPlans=plans.slice(1);calls=[];prefetchQuestions=actualPrefetch;actualPrefetch();actualPrefetch();`);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(run('session.queue.length'),9);
assert.equal(run('session.pendingPlans.length'),11);
// Failed background refill stops and lets the learner retry, without a request loop.
run(`current=8;calls=[];fetchValidatedQuestions=async()=>{calls.push(4);throw new Error('timeout')};actualPrefetch()`);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(run('calls.length'),1);
assert.equal(run('session.queue.length'),9);
assert.equal(run('session.loadingQuestions'),null);
run('prefetchQuestions=()=>{}');
console.log('Prefetch verified: continuous refill, bounded buffer, no duplicate requests or failure loop.');
// Existing curriculum is reused, and only a depleted band is fetched again.
run(`authUser={id:'test'};FIXED_CACHE.clear();
 for(let b=1;b<=9;b++)for(let i=0;i<30;i++)FIXED_CACHE.set('cache'+b+'-'+i,{w:'cache'+b+'-'+i,d:'뜻',band:b,cat:'국어',source:'fixed'});
 rebuildCatalog();globalThis.catalogCalls=[];
 sb.rpc=async(name,args)=>{catalogCalls.push(args.p_band);return {data:Array.from({length:30},(_,i)=>({word:'fresh'+args.p_band+'-'+i,definition:'뜻',band:args.p_band,domain:'국어'}))}};
`);
await run("actualEnsureCatalog(3,'daily');actualEnsureCatalog(3,'diagnostic')");
assert.equal(run('catalogCalls.length'),0);
run(`for(const [key,w] of FIXED_CACHE)if(w.band===3)FIXED_CACHE.delete(key);rebuildCatalog()`);
await run("actualEnsureCatalog(3,'daily')");
assert.equal(run('catalogCalls.length'),1);
assert.equal(run('catalogCalls[0]'),3);
assert.equal(run('JSON.stringify(state.users)'),run('records'));
console.log('Curriculum verified: cached words avoid network wait; depleted bands refill; records preserved.');
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
// The independent second call finalizes alternatives and still rejects faulty questions.
const back=code=>vm.runInContext(code,backend);
back(`globalThis.item={id:'1',type:'subjective_context',word:'원인',answerSlot:0};
 globalThis.sample={id:'1',type:'subjective_context',prompt:'빈칸을 채우세요.',context:'비가 내렸어요. 물이 고인 원인은 많은 비였어요.',partOfSpeech:'명사',options:[],acceptedAnswers:[{text:'원인',credit:1,rationale:'목표어'}],hints:['까닭을 생각해요.','어떤 일이 생기게 한 까닭이에요.'],signature:'비 때문에 고인 물',feedbackCorrect:'비가 물이 고이게 했어요.'};
 globalThis.flags={id:'1',valid:true,sufficientClues:true,oneClearAnswer:false,samePartOfSpeechChoices:true,naturalKorean:true,coherentSituation:true,ageAppropriate:true,noBackgroundBurden:true,noAnswerLeak:true,naturalAlternativesConsidered:true,notTooSimilarToRecent:true,issues:[],acceptedAnswers:[{text:'원인',credit:1,rationale:'목표어'},{text:'이유',credit:1,rationale:'자연스러운 대체 답'}]};
 globalThis.aiCalls=[];ask=async(prompt,schema,name)=>{aiCalls.push(name);return name==='validated_vocab_questions'?{questions:[sample]}:{reviews:[flags]}};
`);
const reviewed=await back('buildValidated([item],[])');
assert.equal(back('aiCalls.length'),2);
assert.equal(reviewed[0].acceptedAnswers[1].text,'이유');
assert.equal(reviewed[0].validation.aiVerified,true);
back('flags.noAnswerLeak=false;flags.valid=false;flags.issues=["answer_leak"];');
await assert.rejects(back('buildValidated([item],[])'),/QUESTION_VALIDATION_FAILED/);
back('flags.noAnswerLeak=true;flags.valid=true;flags.issues=[];flags.acceptedAnswers=[{text:"이유",credit:1,rationale:"대체어"}];');
await assert.rejects(back('buildValidated([item],[])'),/target_missing_from_accepted_answers/);
console.log('Independent verification: two calls, final alternatives used, leaks and missing target answers rejected.');
// Sentence fingerprints survive punctuation changes; guidance text may repeat.
const memoryKeys=run("passageKeys('밤새 많은 비가 내렸어요. 운동장 곳곳에 물이 고였어요.',[])");
const apiKeys=back("passageKeys('밤새 많은 비가 내렸어요. 운동장 곳곳에 물이 고였어요.',[])");
assert.equal(JSON.stringify(memoryKeys),JSON.stringify(apiKeys));
back(`flags.acceptedAnswers=[{text:'원인',credit:1,rationale:'목표어'}];item.previousContexts=[{context:sample.context.replace('원인','＿＿＿＿'),options:[]}];`);
await assert.rejects(back('buildValidated([item],[])'),/previous_sentence_reused/);
back(`item.previousContexts=[];flags.coherentSituation=false;`);
await assert.rejects(back('buildValidated([item],[])'),/QUESTION_VALIDATION_FAILED/);
assert.equal(back("normalizeCandidate({context:'사진을 비교해 봤어요. 이런 변화을 기록했어요.',options:[]},{word:'변화',type:'subjective_context'}).context"),'사진을 비교해 봤어요. 이런 ＿＿＿＿를 기록했어요.');
assert.equal(back("expectedParticle('관찰','로')"),'로');
assert.equal(back("expectedParticle('원인','로')"),'으로');
assert.equal(back("expectedParticle('근거','으로')"),'로');
back(`globalThis.obj={...sample,type:'mc_context',context:'비가 내렸어요. 물이 고인 ＿＿＿＿은 많은 비였어요.',options:['원인','결과','이유','순서','경험'].map((text,i)=>({text,correct:i===0}))};`);
assert.ok(back("deterministic(obj,{word:'원인',type:'mc_context',answerSlot:0}).includes('choice_particle_mismatch')"));
back(`globalThis.repaired=normalizeCandidate(obj,{word:'원인',type:'mc_context',answerSlot:0});`);
assert.ok(back("repaired.context.includes('＿＿＿＿(은/는)')"));
assert.equal(back("completeContext(repaired.context,'결과')"),'비가 내렸어요. 물이 고인 결과는 많은 비였어요.');
assert.equal(back("completeContext(repaired.context,'원인')"),'비가 내렸어요. 물이 고인 원인은 많은 비였어요.');
assert.equal(back("deterministic(repaired,{word:'원인',type:'mc_context',answerSlot:0}).includes('choice_particle_mismatch')"),false);
console.log('Sentence quality verified: prior sentences blocked, incoherent situations rejected, target particles corrected, and grammar clues in choices rejected.');


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
assert.equal(run("wordState('새표제어').problemHistory.length"),1);
run(`session.results=[];applyResult(q,'◎','문맥 해설','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})`);
assert.equal(run("wordState('새표제어').independentCorrect"),1);
run(`wordState('새표제어').lastFeedbackDate=dayOffset(-1);session.results=[];
 applyResult(q,'◎','다른 문맥 해설','',{credit:1,contextSuccess:true,targetRecall:true,independent:true})`);
assert.equal(run("wordState('새표제어').independentCorrect"),2);
assert.equal(run("wordState('새표제어').streak"),2);
console.log('Learning flow verified: no pre-answer definition; same-day repetitions preserve scores without inflating mastery or review intervals.');
