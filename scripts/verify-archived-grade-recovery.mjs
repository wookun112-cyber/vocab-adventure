import assert from 'node:assert/strict';
import {reconcileArchivedGrade} from '../lib/server/archived-grade-recovery.js';
import {createArchivedRecovery} from '../api/recover-grades.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const stamp=Date.parse('2026-10-14T10:00:00+09:00');
const word={w:'의견',d:'어떤 일에 대한 생각',band:2};
const job={id:'old:0',word:'의견',index:0,status:'pending',submittedDay:'2026-10-14',submittedAt:stamp,answer:'친구의 의견을 들었어요.',payload:{taskType:'sentence_use',targetWord:'의견',question:'문장 쓰기',answer:'친구의 의견을 들었어요.',previousExamples:[]}};
const plan={w:word,type:'subjective_use'};
const learner={difficulty:4,leagueLevel:4,words:{의견:{seen:1}},activeLesson:{id:'today',pendingAnswer:'지금 쓰는 답'},sessions:[],unfinishedUsage:{의견:{word,day:'2026-10-13',assignedAt:stamp-86400000}}};
const lesson={id:'old',mode:'daily',studyStartedAt:stamp-30000,studyFallbackDay:'2026-10-14',activeMs:30000,studyDays:{'2026-10-14':{activeMs:30000}},baseWords:[word],results:[{word:'의견',gradingPending:true,excludedFromVocabulary:true,gradingJobId:job.id}],gradingQueue:[job]};
const snapshot={learner,lesson,plan,job,expected:'fixture'};
const grade={score:1,contextSuccess:true,feedback:'알맞게 썼어요.',exampleAnswer:job.answer};
const r=reconcileArchivedGrade(snapshot,grade,stamp+86400000);
assert.equal(r.record.studyDate,'2026-10-14');assert.equal(r.learner.words.의견.usageConfirmedAt,'2026-10-14');
assert.equal(r.learner.unfinishedUsage.의견,undefined);assert.deepEqual(r.learner.activeLesson,learner.activeLesson);
assert.equal(r.learner.difficulty,4);assert.equal(r.learner.leagueLevel,4);
assert.equal(r.learner.studyHistory.entries.old.days['2026-10-14'].activeMs,30000);
assert.equal(r.learner.studyHistory.entries.old.days['2026-10-14'].good,1);
assert.equal(snapshot.lesson.results[0].gradingPending,true,'pure reconciliation never mutates its input');
const newer=structuredClone(snapshot);Object.assign(newer.learner.words.의견,{lastExposureAt:'2026-10-15',lastFeedbackDate:'2026-10-15',usageConfirmedAt:'2026-10-15',usageConfirmedStamp:stamp+86400000,nextReviewAt:'2026-11-15',recallStage:5,streak:5});
const lateWrong=reconcileArchivedGrade(newer,{score:0,contextSuccess:false},stamp+86400000);
assert.equal(lateWrong.learner.words.의견.nextReviewAt,'2026-11-15');assert.equal(lateWrong.learner.words.의견.streak,5);
const lateRight=reconcileArchivedGrade(newer,grade,stamp+86400000);
assert.equal(lateRight.learner.words.의견.usageConfirmedAt,'2026-10-15');
const sameDay=structuredClone(newer);sameDay.learner.words.의견.lastExposureAt='2026-10-14';sameDay.learner.words.의견.lastFeedbackDate='2026-10-14';sameDay.learner.words.의견.usageConfirmedStamp=stamp+3600000;
assert.equal(reconcileArchivedGrade(sameDay,{score:0,contextSuccess:false}).learner.words.의견.nextReviewAt,'2026-11-15','late error cannot undo a later success on the same day');
const pendingToday=structuredClone(snapshot);pendingToday.learner.unfinishedUsage.의견.assignedAt=stamp+86400000;
assert.ok(reconcileArchivedGrade(pendingToday,grade).learner.unfinishedUsage.의견,'old grade cannot complete a later assignment');
assert.equal(reconcileArchivedGrade({...snapshot,job:{...job,status:'applied'}},grade),null);
let cached=grade,commits=0,conflict=false,other=false;
const handler=createArchivedRecovery({verify:async()=>({id:other?'other-family':AUTHORED_OWNER}),rpc:async(auth,name,args)=>{
 if(name==='read_paused_grade_recovery')return args.p_profile==='ayoung'&&!args.p_skip.includes(job.id)?snapshot:null;
 if(name==='read_saved_vocab_grade')return cached;
 if(name==='commit_paused_grade_recovery'){commits++;return !conflict}
 throw Error('Unapproved RPC '+name);
}});
const call=async()=>{let code,value;await handler({method:'POST',headers:{authorization:'Bearer fixture'}},{setHeader(){},status(n){code=n;return this},json(v){value=v}});return {code,value}};
assert.equal((await call()).value.recovered,1);assert.equal(commits,1);
cached=null;assert.equal((await call()).value.waiting,1);assert.equal(commits,1,'missing cached grade never causes generation or mutation');
cached=grade;conflict=true;assert.equal((await call()).value.conflicts,1);
other=true;assert.equal((await call()).code,403);
console.log('Archived recovery: cached-only delivery, original date/time, current draft and later progress preserved, idempotent applied job, owner isolation, CAS conflict and no paid calls.');

// A closed request has a job, but the catch/placeholder has not run yet.
const beforePlaceholder=structuredClone(snapshot);beforePlaceholder.lesson.results=[];
const recoveredEarly=reconcileArchivedGrade(beforePlaceholder,grade,stamp+86400000);
assert.equal(recoveredEarly.record.gradingJobId,job.id);
assert.equal(recoveredEarly.learner.studyHistory.entries.old.days['2026-10-14'].good,1);
assert.deepEqual(beforePlaceholder.lesson.results,[]);
for(const bad of [
 {...beforePlaceholder,job:{...job,index:1}},
 {...beforePlaceholder,job:{...job,word:'다른 단어'}},
 {...snapshot,lesson:{...lesson,results:[{...r.record,gradingPending:false}]}}
])assert.equal(reconcileArchivedGrade(bad,grade),null,'never insert out of order, mismatched, or already graded jobs');
console.log('Pre-placeholder recovery: cached answer appended only at its original cursor; gaps, mismatches and duplicates rejected.');
