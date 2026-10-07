import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {learningDay,daysBetween,studyBudget,buildLearningPlan,recordLearningEvidence,researchSchedule,updateLearningLevels,summarizeEvidence,masteryConfirmed} from '../lib/learning-model.js';
import {makePreparedPlan,browserQuestion} from '../lib/prepared-plan.js';
const day='2026-10-07',word={w:'협력',d:'같은 일을 위해 힘을 합침',band:2,source:'fixed',cat:'국어'};
assert.equal(learningDay(new Date('2026-10-06T15:00:00Z')),day);
assert.equal(daysBetween('2026-09-30',day),7);
assert.equal(studyBudget({words:{}},day).newCount,3);
assert.equal(studyBudget({words:{a:{introducedAt:day},b:{introducedAt:day},c:{introducedAt:day}}},day).newCount,0);
assert.equal(studyBudget({words:Object.fromEntries(Array.from({length:10},(_,i)=>[i,{seen:1,introducedAt:'2026-10-03',nextReviewAt:'2026-10-20'}]))},day).newCount,3);
assert.equal(studyBudget({words:Object.fromEntries(Array.from({length:12},(_,i)=>[i,{seen:1,nextReviewAt:day}]))},day).newCount,3);
assert.equal(studyBudget({words:{},learningEvidence:Array.from({length:4},()=>({kind:'recall',firstAttempt:true,lagDays:1,date:day,success:false}))},day).newCount,3);
const reviews=Array.from({length:8},(_,i)=>({...word,w:'복습'+i})),fresh=[{...word,w:'재사용'},word];
const plans=buildLearningPlan(fresh,reviews,20,'daily');
assert.equal(plans.length,20);assert.equal(plans.slice(0,6).every(p=>p.stage==='check'&&p.type.startsWith('subjective_')),true);
assert.equal(plans.filter(p=>p.needsCard).length,2);assert.equal(plans.slice(0,20).filter(p=>p.type==='subjective_use').length,2);
assert.ok(plans.findIndex(p=>p.stage==='recall'&&p.w.w==='재사용')>=9,'three intervening activities after teaching');
const emptyPlan=buildLearningPlan(fresh,[],20,'daily');
assert.equal(emptyPlan.slice(0,20).filter(p=>p.type==='subjective_use').length,2);
for(let k=0;k<=8;k++){
 const balanced=buildLearningPlan(fresh,reviews.slice(0,k),20,'daily');
 assert.equal(balanced.filter(p=>p.type.startsWith('mc_')).length,10,'each daily plan balances ten choices and ten written activities');
 assert.equal(balanced.filter(p=>p.type.startsWith('subjective_')).length,10);
}
let learner={difficulty:2,words:{},learningEvidence:[]},st={lastExposureAt:'2026-09-30',recallStage:3};
const good={credit:1,targetRecall:true,contextSuccess:true,practiceOnly:false,hintUsed:false,revealed:false};
let evidence=recordLearningEvidence(learner,st,{w:word,type:'mc_context',showTarget:false},good,day);
researchSchedule(st,evidence,good,day);
assert.equal(st.recallStage,3,'recognition cannot advance recall stage');assert.equal(st.nextReviewAt,'2026-10-08');assert.equal(st.retention7,undefined);
st={lastExposureAt:'2026-09-30'};
evidence=recordLearningEvidence(learner,st,{w:word,type:'subjective_use',showTarget:true},good,day);
researchSchedule(st,evidence,good,day);assert.equal(evidence.unpromptedRecall,false);assert.equal(st.independentRecallDays,undefined);assert.equal(st.useSuccess,1);assert.equal(st.retention7,undefined);
st={lastExposureAt:'2026-09-30'};
evidence=recordLearningEvidence(learner,st,{w:word,type:'subjective_context',showTarget:false},good,day);
researchSchedule(st,evidence,good,day);assert.equal(st.retention7.success,1);assert.equal(st.independentRecallDays.length,1);assert.equal(st.recallStage,1);
evidence=recordLearningEvidence(learner,st,{w:word,type:'subjective_context',showTarget:false},{...good,practiceOnly:true},day);
researchSchedule(st,evidence,{...good,practiceOnly:true},day);assert.equal(st.retention7.attempts,1);assert.equal(st.recallStage,1);
const hinted={...good,hintUsed:true,credit:.75};st={lastExposureAt:'2026-09-01'};
evidence=recordLearningEvidence(learner,st,{w:word,type:'subjective_context',showTarget:false},hinted,day);assert.equal(st.retention30.attempts,1);assert.equal(st.retention30.success,0);
assert.equal(masteryConfirmed({independentRecallDays:[1,2,3],retention7:{success:1},useDays:[1]}),true);
assert.equal(masteryConfirmed({streak:100,mastered:true}),false,'legacy counters cannot fabricate new delayed evidence');
learner={difficulty:2,words:{},learningEvidence:Array.from({length:6},(_,i)=>({kind:'recognition',date:day,word:'词'+i,success:true,lagDays:7,firstAttempt:true,band:2}))};
updateLearningLevels(learner,[],day);assert.equal(learner.difficulty,2);assert.equal(learner.leagueLevel,2);
learner.learningEvidence=Array.from({length:12},(_,i)=>({kind:'recall',date:['2026-10-05','2026-10-06',day][i%3],word:'어휘'+i,success:true,lagDays:7,firstAttempt:true,band:2}));
updateLearningLevels(learner,[],day);assert.equal(learner.leagueLevel,2.2);updateLearningLevels(learner,[],day);assert.equal(learner.leagueLevel,2.2,'no repeat daily promotions');
assert.equal(summarizeEvidence(learner).retention7.attempts,12);
assert.equal(studyBudget({words:Object.fromEntries(Array.from({length:8},(_,i)=>[i,{seen:1,introducedAt:'2026-10-03',nextReviewAt:'2026-10-20'}]))},day).newCount,3);
assert.deepEqual(plans.slice(18,20).map(p=>p.w.w).sort(),fresh.map(w=>w.w).sort());
const futureLearner={difficulty:2,levelTestCompleted:true,lastDate:learningDay(),words:{}};
for(let i=0;i<8;i++)futureLearner.words['복습'+i]={seen:1,introducedAt:learningDay(),nextReviewAt:'2099-01-01'};
const future=makePreparedPlan(futureLearner,{},reviews.map(w=>({word:w.w,definition:w.d,band:2,domain:'국어'})),'family','guest');
assert.equal(future.plannedFor,learningDay());assert.equal(future.newWords.length,0);assert.ok(future.plans.every(p=>p.w.w.startsWith('복습')&&p.practiceOnly),'early practice is allowed without delayed-recall credit');
assert.deepEqual([studyBudget({words:{}},day).minutes,studyBudget({words:{}},day).maxMinutes],[20,25]);
console.log('Learning rules verified: Seoul dates, daily/weekly/overdue/performance budgets, spaced new-word plan, recognition/use separated from recall, 7/30-day checks, independent mastery, multi-day bounded league changes.');
// Full client flow: new server packet, teaching screen, cursor checkpoint, resume,
// exact-form fast grading, semantic sentence grading, early completion, old lesson support.
const source=fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,'')+'\n'+fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const seed={difficulty:2,levelTestCompleted:false,words:Object.fromEntries(reviews.slice(0,6).map(w=>[w.w,{seen:1,correct:1,wrong:0,streak:1,lastFeedbackDate:'2026-09-20',lastExposureAt:'2026-09-20'}])),recentProblems:[]};
const curriculum=[...reviews,...fresh].map(w=>({word:w.w,definition:w.d,band:w.band,domain:'국어',example:''}));
const data=makePreparedPlan(seed,{},curriculum,'family','guest');
data.ready=data.plans.map((p,i)=>[i,browserQuestion({type:p.type,prompt:p.type==='subjective_use'?'이 말을 넣어 나만의 문장을 써 보세요.':'상황에 맞게 답하세요.',context:'새로운 탐험'+i+'에서 친구들과 함께 조사했어요. 기록'+i+'에서 ＿＿＿＿를 찾았어요.',answerForm:p.w.w,showTarget:p.type.startsWith('mc_')&&p.type!=='mc_context'||p.type==='subjective_use',options:p.type.startsWith('mc_')?[{text:p.w.w,correct:true},...[1,2,3,4].map(n=>({text:'다른말'+n,correct:false}))]:[],hints:['상황 단서를 살펴봐요.','행동과 결과를 살펴봐요.'],acceptedAnswers:[{text:p.w.w,credit:1}],learningCard:p.needsCard?{definition:p.w.d,example:p.w.w+'을 사용한 새로운 실제 예문이에요.',nonExample:'서로 따로 하는 상황은 해당하지 않아요.',structureNote:p.structureNote||''}:null,feedbackCorrect:'상황에 맞는 표현이에요.',signature:'상황'+i,validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}},p)]);
function fixture(saved=null){
 const nodes=new Map(),local=new Map(),alerts=[];let writes=0,gradeCalls=0;
 const node=id=>{if(!nodes.has(id)){const xs=new Set();nodes.set(id,{textContent:'',innerHTML:'',value:'',style:{},disabled:false,children:[],appendChild(x){this.children.push(x)},classList:{contains:x=>xs.has(x),add(...x){x.forEach(a=>xs.add(a))},remove(...x){x.forEach(a=>xs.delete(a))},toggle(x,on){if(on??!xs.has(x))xs.add(x);else xs.delete(x)}}})}return nodes.get(id)};
 const ctx=vm.createContext({Date,Math,Map,Set,Promise,console,setTimeout,clearTimeout,alert:x=>alerts.push(x),window:{scrollTo(){}},document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>node('new'+Math.random())},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},fetch:async(url,opts)=>{assert.equal(url,'/api/grade');gradeCalls++;assert.equal(JSON.parse(opts.body).taskType,'sentence_use');return {ok:true,json:async()=>({score:1,contextSuccess:true,targetRecall:false,feedback:'자연스럽게 사용했어요.'})}},createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},rpc:async(name)=>({data:name==='consume_prepared_lesson'?true:{id:'new-job',status:'ready',payload:data},error:null}),from:()=>({upsert:async()=>{writes++;return {error:null}}})})});
 const run=x=>vm.runInContext(x,ctx);run(source);run("state.selected='guest';authUser={id:'family'};warmDailyQuestions=()=>{}");
 if(saved)run('state=mergeState('+JSON.stringify(saved)+')');else run('state.users.guest=Object.assign(freshChild("게스트"),'+JSON.stringify(seed)+')');
 return {run,node,local,alerts,get gradeCalls(){return gradeCalls}};
}
const f=fixture();await f.run('buildSession()');if(!f.run('session'))throw Error(f.alerts.join(' | '));assert.equal(f.run('session.target'),20);assert.equal(f.run('session.introDone'),false);
for(let i=0;i<6;i++){f.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1,targetRecall:true,contextSuccess:true,independent:true})");await f.run('nextQuestion()')}
assert.equal(f.node('introCounter').textContent,'1번째 새 단어');assert.equal(f.run('current'),6);
f.run('nextIntro()');assert.equal(f.run('session.introCursor'),1);
const saved=JSON.parse(f.run('JSON.stringify(state)'));
const reopened=fixture(saved);await reopened.run('buildSession()');assert.equal(reopened.run('current'),6);assert.equal(reopened.run('session.introCursor'),1);assert.equal(reopened.node('introCounter').textContent,'2번째 새 단어');
reopened.run('nextIntro()');assert.equal(reopened.node('introCounter').textContent,'3번째 새 단어');reopened.run('nextIntro()');assert.equal(reopened.run('session.introDone'),true);
assert.equal(reopened.run('studyBudget(child()).newCount'),0,'all three teaching cards consume the daily allowance');
const beforeLevel=reopened.run('child().difficulty');
for(let i=6;i<18;i++){reopened.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1,targetRecall:true,contextSuccess:true,independent:true})");await reopened.run('nextQuestion()')}
assert.equal(reopened.run('child().difficulty'),beforeLevel,'no per-answer level boost');
assert.equal(reopened.run('session.queue[current].type'),'subjective_use');
reopened.node('answer').value=reopened.run('session.queue[current].w.w');await reopened.run('gradeCurrent(false)');
assert.equal(reopened.gradeCalls,1,'target alone still gets semantic sentence grading');assert.equal(reopened.run('session.results.at(-1).targetRecall'),false);
reopened.run('finishSession()');assert.equal(reopened.run('child().activeLesson'),null);assert.equal(reopened.run('child().sessions[0].total'),19);assert.equal(reopened.run('child().sessions[0].model'),'12.0.0');
assert.ok(reopened.run('Object.values(child().words).some(s=>s.retention7?.attempts||s.retention30?.attempts)'));
console.log('New lesson verified: pre-generated packet, six prior-word probes before teaching, teaching-cursor restart, delayed recall protection, target shown in sentence-use never counted as recall, zero rolling level boosts, early completion preserving all answers.');
// Finishing today's lesson must never disable another lesson. Once the three
// teaching cards have been used, future-due words become optional practice.
const completed=JSON.parse(reopened.run('JSON.stringify(state)'));
completed.users.guest.lastDate=learningDay();
for(const st of Object.values(completed.users.guest.words)){
 st.nextReviewAt='2099-01-01';st.lastFeedbackDate='2026-09-20';
}
const templates=data.ready.map(([,q])=>q);
Object.assign(data,makePreparedPlan(completed.users.guest,completed.catalog,curriculum,'family','guest'));
data.ready=data.plans.map((p,i)=>[i,{...templates[i],w:p.w,type:p.type,stage:p.stage,needsCard:false,practiceOnly:p.practiceOnly,answerForm:p.w.w,acceptedAnswers:[{text:p.w.w,credit:1}]}]);
assert.equal(data.newWords.length,0);assert.ok(data.plans.every(p=>p.practiceOnly));
const continued=fixture(completed);continued.run('renderResumeButton()');
assert.equal(continued.node('startDaily').disabled,false);
assert.equal(continued.node('startDaily').textContent,'계속 학습하기');
await continued.run('buildSession()');if(!continued.run('session'))throw Error(continued.alerts.join(' | '));
assert.equal(continued.run('session.introDone'),true);assert.equal(continued.run('session.target'),20);
const firstWord=continued.run('session.queue[0].w.w');
const delayedBefore=continued.run('JSON.stringify(child().words['+JSON.stringify(firstWord)+'].independentRecallDays||[])');
for(let i=0;i<20;i++){
 continued.run("applyResult(session.queue[current],'○','좋아요.','',{credit:1,targetRecall:true,contextSuccess:true,independent:true})");
 await continued.run('nextQuestion()');
}
assert.equal(continued.run('child().sessions[0].total'),20);
assert.equal(continued.run('child().activeLesson'),null);
assert.equal(continued.run('JSON.stringify(child().words['+JSON.stringify(firstWord)+'].independentRecallDays||[])'),delayedBefore);
assert.equal(continued.run('child().words['+JSON.stringify(firstWord)+'].nextReviewAt'),'2099-01-01');
assert.equal(continued.run('studyBudget(child()).newCount'),0);
assert.equal(continued.node('startDaily').disabled,false);
assert.equal(continued.node('startDaily').textContent,'계속 학습하기');
assert.equal(continued.gradeCalls,0);assert.deepEqual(continued.alerts.filter(x=>!x.startsWith('오늘 학습 완료')),[]);
console.log('Continued learning verified: completed-day start stays enabled, all 20 review transitions work, no extra new words or false delayed-recall credit, and completing another lesson still allows study.');
const selection=fixture();
selection.run("WORDS=[{w:'생활 정보 격차',band:2},{w:'생활정보격차',band:2},{w:'격차',band:2},{w:'탄소 중립',band:2}];child().words={'생활 정보 격차':{seen:2},'격차':{seen:2},'탄소 중립':{seen:1}}");
assert.equal(selection.run('chooseNew(20).some(w=>!isLearningTarget(w.w))'),false);
assert.equal(selection.run('chooseReview(20).some(w=>!isLearningTarget(w.w))'),false);
assert.equal(selection.run('child().words["생활 정보 격차"].seen'),2);
// A pending specialist question is skipped without grading or word mutations;
// answered records remain available at their original cursor positions.
const interruptedState=JSON.parse(reopened.run('JSON.stringify(state)'));
interruptedState.users.guest.activeLesson=JSON.parse(JSON.stringify(saved.users.guest.activeLesson));
interruptedState.users.guest.activeLesson.introDone=true;
interruptedState.users.guest.activeLesson.nextIndex=6;
interruptedState.users.guest.activeLesson.plans[6].w={w:'등비중항',d:'수학 전문 용어',band:7,cat:'수학·논리'};
interruptedState.users.guest.activeLesson.ready.find(([i])=>i===6)[1].w=interruptedState.users.guest.activeLesson.plans[6].w;
const originalAnswers=JSON.stringify(interruptedState.users.guest.activeLesson.results);
const skip=fixture(interruptedState);await skip.run('buildSession()');
assert.equal(skip.run('current'),7);assert.equal(skip.run('session.results[6].excludedFromVocabulary'),true);
assert.equal(skip.run('JSON.stringify(session.results.slice(0,6))'),originalAnswers);
assert.equal(skip.run('child().words["등비중항"]'),undefined);
assert.equal(skip.gradeCalls,0);
console.log('Interrupted lesson verified: specialist item skipped, no wrong answer or reward, original answers/cursor preserved.');
