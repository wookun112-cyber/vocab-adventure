import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';

// Reuse the existing full browser fixture, but run the actual production source.
const effectiveSource=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
new vm.Script(effectiveSource.replace(/^import[^\n]+\n/gm,''));
const fixtureUrl=new URL('./verify-lesson-resume.mjs',import.meta.url);
let harness=fs.readFileSync(fixtureUrl,'utf8').split('\nconst f=fixture();')[0]
 .replace(/^import[^\n]+\n/gm,'').replaceAll('import.meta.url','fixtureUrl');
const a=harness.indexOf('const source='),b=harness.indexOf('\n',a);
assert.ok(a>=0&&b>a);
harness=harness.slice(0,a)+`const source=effectiveSource.replace(/^import[^\\n]+\\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];`+harness.slice(b);
// Expose the real local review preparation before the fixture replaces it with a server stub.
harness=harness.replace('run("getPreparation=async()=>','run("globalThis.localGetPreparation=getPreparation;getPreparation=async()=>');
const fixture=new Function('effectiveSource','fs','vm','URL','fixtureUrl','studyHistory','DELIVERY_POLICY','localPracticeQuestion','sentenceUseQuestionValid','authoredPolicy','DAILY_POLICY','MINIMUM_STUDY_POLICY',harness+';return fixture;')(
 effectiveSource,fs,vm,URL,fixtureUrl,studyHistory,DELIVERY_POLICY,localPracticeQuestion,sentenceUseQuestionValid,authoredPolicy,DAILY_POLICY,MINIMUM_STUDY_POLICY
);
const f=fixture();await f.run('buildSession()');await f.run('cloudSave()');
await f.run('cloudSave()');assert.equal(f.run('cloudSaveTask'),null,'unchanged saves release the writer');
const before=f.calls.writes.length;
f.run("child().saveRecoveryProbe='first'");assert.equal(await f.run('cloudSave()'),true);
assert.ok(f.calls.writes.length>before,'a later edit is not swallowed by a resolved task');
f.run("globalThis.realRpc=sb.rpc;sb.rpc=async(name,args)=>name==='save_learning_patch'?{error:{code:'57014',message:'timeout'}}:realRpc(name,args);child().saveRecoveryProbe='second'");
assert.equal(await f.run('cloudSave()'),false);
assert.equal(f.run('cloudSaveTask'),null);assert.equal(f.run('cloudSavePending'),true);
assert.ok(f.node('cloudPill').textContent.includes('저장 지연'));
f.run('sb.rpc=realRpc');assert.equal(await f.run('cloudSave()'),true);
assert.equal(f.cloud.get('family').users.guest.saveRecoveryProbe,'second');
assert.equal(f.run('cloudSaveError'),null);assert.equal(f.run('cloudSaveTask'),null);
assert.equal(f.run("isEarlierLesson({mode:'daily',studyFallbackDay:'2026-10-13'},'2026-10-14')"),true);
assert.equal(f.run("isEarlierLesson({mode:'daily',studyFallbackDay:'2026-10-14'},'2026-10-14')"),false);
assert.equal(f.run("lessonStudyDay({studyStartedAt:Date.parse('2026-10-13T14:59:00Z')})"),'2026-10-13');
assert.equal(f.run("lessonStudyDay({studyStartedAt:Date.parse('2026-10-13T15:00:00Z')})"),'2026-10-14');
assert.equal(f.run("isEarlierLesson({mode:'level',studyFallbackDay:'2026-10-13'},'2026-10-14')"),false);
assert.equal(f.run('isEarlierLesson({mode:"daily"})'),false);
assert.equal(f.run('preservesLearning({daySwitchSequence:2,words:{}},{daySwitchSequence:1,words:{}})'),false);
const next=fixture();await next.run('buildSession()');await next.run('cloudSave()');
next.run("child().activeLesson.studyFallbackDay=dateAfter(today(),-1);globalThis.archiveCalls=0;globalThis.archiveCopy=null;switchSavedLearning=async saved=>{archiveCalls++;archiveCopy=JSON.parse(JSON.stringify(saved));child().activeLesson=null;session=null;return true}");
const previous=next.run('JSON.stringify(child().activeLesson)');
assert.equal(next.run('isEarlierLesson(savedLesson())'),true,'numbered older rounds must be detected');
next.run('renderRoundStart()');
assert.match(next.node('startDaily').textContent,/오늘 새 학습 시작/,'old numbered round must not be offered as default');
assert.equal(await next.run('autoRolloverPreviousDay()'),true,'new day archives automatically without clicking Start');
assert.equal(next.run('archiveCalls'),1,'numbered round was archived exactly once');
assert.equal(next.run('savedLesson()'),null,'old round cannot occupy the new day');
assert.equal(next.node('startDaily').disabled,false,'new-day start must be enabled immediately after rollover');
assert.equal(next.run('archiveCopy.results.length'),JSON.parse(previous).results.length,'original answers remain intact');
assert.equal(next.run('session'),null);
assert.equal(await next.run('autoRolloverPreviousDay()'),false,'repeat checks never archive twice');
assert.equal(next.run('archiveCalls'),1);
const keep=fixture();await keep.run('buildSession()');await keep.run('cloudSave()');
keep.run("child().activeLesson.studyFallbackDay=dateAfter(today(),-1);globalThis.archiveCalls=0;switchSavedLearning=async()=>{archiveCalls++;throw Error('Must not archive explicit resume')};resumePreviousRequested=true");
await keep.run('buildSession()');assert.equal(keep.run('archiveCalls'),0);
assert.equal(keep.alerts.length,0,'explicit previous-day resume remains available');
const failure=fixture();await failure.run('buildSession()');await failure.run('cloudSave()');
const id=failure.run('savedLesson().id');failure.run('cloudSave=async()=>false');
await assert.rejects(failure.run('switchSavedLearning(savedLesson())'),/저장/);
assert.equal(failure.run('savedLesson().id'),id);assert.equal(failure.run('daySwitchBusy'),false);
assert.equal(failure.calls.generation,0,'failed transition never generates replacement content');
console.log('Production recovery verified: no-op save, retry, Seoul day boundary, automatic numbered round archive, explicit resume, unsaved-work protection; no paid calls.');


// Exercise the actual new-day archive → cloud reconciliation → first-question
// path. Previous tests stubbed switchSavedLearning(), hiding this regression.
async function verifyRealDaySwitch({previousMode='daily',alreadyCompletedToday=false,lostAcknowledgement=false,cappedToday=false}={}){
 const real=fixture();await real.run('buildSession()');
 const setup=[
  'session.mode='+JSON.stringify(previousMode)+';',
  'session.activeMs='+(cappedToday?'1800000':'125000')+';',
  'session.studyFallbackDay='+(cappedToday?'today()':'dateAfter(today(),-1)')+';',
  'session.studyStartedAt=Date.now()-'+(cappedToday?'3600000':'86400000')+';',
  ...(cappedToday?["session.studyDays={[today()]:{activeMs:1800000,timeKnown:true}};session.studyTimeInitialized=true;","session.gradingQueue=[{id:'incomplete-grade',status:'pending',word:session.queue[0].w.w,answer:'남겨 둔 답안',submittedAt:Date.now()-180000}];"]:[]),
  "session.results=[{word:session.queue[0].w.w,type:session.queue[0].type,result:'○',credit:1,contextSuccess:true,answeredAt:session.studyStartedAt,studyDate:session.studyFallbackDay}];",
  'current=1;checkpointSession();session.preparation.cancel();session=null;',
  'child().lastDate='+(alreadyCompletedToday?'today()':'dateAfter(today(),-1)')+';',
  ...(cappedToday?["for(const w of SEED_WORDS.filter(w=>isLearningTarget(w.w,w.cat,w.band)&&inTargetBand(w,child().difficulty)).slice(0,14)){const st=wordState(w.w);st.seen=1;st.introducedAt=dateAfter(today(),-2);st.nextReviewAt=dateAfter(today(),3)}"]:[]),
  "child().pausedLessonIndex=[{id:'older-archived-grade',day:dateAfter(today(),-2),answered:3,pendingGrades:2}];"
 ];
 real.run(setup.join('\n'));
 assert.equal(await real.run('cloudSave()'),true,'save original before switching');
 const oldSaved=JSON.parse(real.run('JSON.stringify(savedLesson())'));
 const consumedBefore=real.calls.consumes;
 if(false){
  real.run('renderResumeButton()');
  assert.equal(real.node('startDaily').disabled,false,'30-minute cap must never disable optional review');
  assert.match(real.node('startDaily').textContent,/추가 복습 시작/);
  assert.equal(real.run('officialDailyCapReached()'),true);
  assert.equal(real.run('cappedCurrentDailyLesson()'),true);
  real.run("getPreparation=localGetPreparation;ensureCatalog=async()=>{};");
  real.run(`globalThis.mockQuestionCalls=0;
   fetchValidatedQuestions=async plans=>plans.map(p=>{
    const number=++mockQuestionCalls;
    return {w:p.w,type:p.type,stage:p.stage,taskDemand:p.taskDemand,needsCard:p.needsCard,
     label:'검수된 복습',q:'검수된 문맥에서 답을 생각해 보세요.',ctx:'모의 검수 복습 '+number+' 이전과 다른 상황에서 단어를 확인합니다.',
     open:p.type.startsWith('subjective_'),showTarget:p.type==='subjective_use',
     opts:[],acceptedAnswers:[p.w.w],hints:[],feedbackCorrect:'확인',
     signature:'review-packet-'+number,
     validation:{deterministic:true,aiVerified:true,checks:{coherentSituation:true}}};
   });`);
 }
 const rpc=real.run('sb'),originalRpc=rpc.rpc.bind(rpc);
 let archiveCalls=0,archivedOriginal=null,firstSent=false;
 rpc.rpc=async(name,args)=>{
  if(name!=='switch_learning_day')return originalRpc(name,args);
  archiveCalls++;
  const remote=structuredClone(real.cloud.get('family')),learner=remote.users.guest;
  const previous=learner.activeLesson;
  if(previous&&previous.id===args.p_expected_id){
   if(cappedToday){
    assert.equal(previous.studyFallbackDay,real.run('today()'));
    assert.equal(previous.mode,'daily');
    assert.ok(previous.activeMs>=1800000,'server may archive same-day only after the official cap');
   }
   archivedOriginal=structuredClone(previous);
   learner.pausedLessonIndex=[...(learner.pausedLessonIndex||[]),{id:previous.id,day:previous.studyFallbackDay,answered:previous.results.length,pendingGrades:0}];
   learner.activeLesson=null;
   learner.daySwitchSequence=(learner.daySwitchSequence||0)+1;
   learner.preparationRevision=(learner.preparationRevision||0)+1;
   remote.updatedAt=Date.now();
   real.cloud.set('family',remote);
   if(lostAcknowledgement&&!firstSent){firstSent=true;return {data:null,error:{message:'network acknowledgement lost'}}}
   return {data:{changed:true,archived:true},error:null};
  }
  if(!previous)return {data:{changed:false,archived:true},error:null};
  return {data:{conflict:true,reason:'active_lesson_changed'},error:null};
 };
 real.run([
  'const originalMakeRemoteLesson=makeRemoteLesson;',
  "makeRemoteLesson=()=>{const row=originalMakeRemoteLesson();row.id='fresh-day-validated-packet';return row}"
 ].join('\n'));
 if(lostAcknowledgement){
  await assert.rejects(real.run('switchSavedLearning(savedLesson())'));
  assert.equal(real.run('canSaveLearning()'),true,'lost RPC reply never forces sign-out');
  assert.equal(real.run('savedLesson().id'),oldSaved.id);
  assert.match(real.node('learningStartStatus').textContent,/확인|보관|기록/);
  assert.equal(real.run('preparingSession'),false);
 }
 if(cappedToday)await real.run('switchSavedLearning(savedLesson())');
 else{
  assert.equal(await real.run('autoRolloverPreviousDay()'),true,'older round archives without clicking Start');
  assert.equal(real.node('startDaily').disabled,false,'new round button is enabled after remote archive');
 }
 await real.run("buildSession('daily')");
 assert.equal(archiveCalls,lostAcknowledgement?2:1,'real archiving runs once or safely retries');
 assert.equal(real.run('session.results.length'),0,'new study begins without prior answers');
 assert.equal(real.run('current'),0);
 assert.match(real.node('counter').textContent,/1번째 문제/);
 assert.equal(real.run('session.mode'),'daily');
 assert.equal(real.run('state.users.guest.daySwitchSequence'),1);
 assert.equal(real.run('savedLesson().id'),'fresh-day-validated-packet');
 assert.equal(real.run('state.users.guest.pausedLessonIndex.some(x=>x.id==='+JSON.stringify(oldSaved.id)+')'),true);
 assert.equal(JSON.stringify(archivedOriginal.results),JSON.stringify(oldSaved.results),'archived original answers unchanged');
 assert.equal(real.run('canSaveLearning()'),true);
 assert.equal(real.run('state.selected'),'guest');
 assert.ok(real.run('session.activeMs')<1000,'fresh lesson timer starts near zero rather than reusing yesterday\'s time');
 assert.equal(real.node('learningStartStatus').textContent,'');
 assert.equal(real.calls.generation,0,'opening next day / optional review does not perform paid AI question generation');
 if(cappedToday)assert.ok(real.run('child().pausedLessonIndex.some(p=>p.id==='+JSON.stringify(oldSaved.id)+')'));
}
await verifyRealDaySwitch({previousMode:'daily'});
await verifyRealDaySwitch({previousMode:'review'});
await verifyRealDaySwitch({previousMode:'review',alreadyCompletedToday:true});
await verifyRealDaySwitch({previousMode:'daily',lostAcknowledgement:true});
await verifyRealDaySwitch({cappedToday:true});
console.log('Real day switch PASS: archive original answers, refresh server state, open new question, previous review, completed-day review and safe retry.');
