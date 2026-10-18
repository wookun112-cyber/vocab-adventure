import assert from 'node:assert/strict';
import {
 MASTERY_LEDGER_POLICY,STABLE_BASELINE_POLICY,MIN_VOCABULARY_BAND,
 masteryConfirmed,vocabularyMasteryStatus,curriculumMasterySummary,
 lowerVocabularyBacklog,selectCoverageWords,selectDailyTargets,
 recordLearningEvidence,researchSchedule,dateAfter,learningDay,
 stableBaselineLevel,initRealtimeLevel,observeRealtimeLevel,updateLearningLevels
} from '../lib/learning-model.js';

const t=dayOffset=>dateAfter(learningDay(),dayOffset);
const word=(w,band)=>({w,band,d:'독립적인 어휘의 정확한 뜻',cat:'국어'});
assert.equal(MASTERY_LEDGER_POLICY,'complete-curriculum-recall-and-use-20261018');
assert.equal(STABLE_BASELINE_POLICY,'multi-day-evidence-baseline-20261018');
assert.equal(MIN_VOCABULARY_BAND,2);
const master={
 seen:9,useDays:[t(-25)],useSuccess:1,independentRecallDays:[t(-21),t(-13),t(-8)],
 retention7:{attempts:1,success:1},nextReviewAt:t(-1),lastExposureAt:t(-8),
 recallStage:6,lastIndependentRecallAt:t(-8)
};
const incomplete={seen:4,useDays:[t(-8)],useSuccess:1,nextReviewAt:t(-1),lastExposureAt:t(-8)};
const student={difficulty:7.4,words:{
 '기억할어휘':{...master},'되새길어휘':{...incomplete},
 '복습대기':{...incomplete,nextReviewAt:t(20)},'처음배울말':{},
 '기억흐림':{...master,masteryRefreshDue:true}
}};
const names=[word('기억할어휘',2),word('되새길어휘',3),word('복습대기',4),
 word('처음배울말',2),word('기억흐림',4),word('기준확인',7),word('새학습',8)];
const summary=curriculumMasterySummary(names,student);
assert.equal(summary.totals.total,names.length,'every distinct eligible word is kept in the mastery ledger');
assert.equal(summary.totals.mastered,1);
assert.equal(summary.totals.refresh,1);
assert.equal(summary.totals.used,2);
assert.equal(summary.totals.unseen,3);
assert.equal(summary.byBand['2'].total,2);
assert.equal(vocabularyMasteryStatus('기억할어휘',student).status,'mastered');
assert.equal(vocabularyMasteryStatus('기억흐림',student).status,'refresh');
assert.equal(vocabularyMasteryStatus('되새길어휘',student).status,'used');
assert.equal(vocabularyMasteryStatus('처음배울말',student).status,'unseen');
const lower=lowerVocabularyBacklog(names,student);
assert.ok(lower.some(w=>w.w==='되새길어휘'),'one correct usage must not erase an unfinished long-term word');
assert.ok(lower.some(w=>w.w==='처음배울말'),'previously unseen low-band words remain in the coverage queue');
assert.ok(lower.some(w=>w.w==='기억흐림'),'forgotten mastered word returns to coverage queue');
assert.ok(!lower.some(w=>w.w==='기억할어휘'),'real long-term mastery moves a word out of the incomplete backlog');
assert.ok(lower.some(w=>w.w==='복습대기'),'future-due words stay on the ledger without being assigned early');
const todayCoverage=selectCoverageWords(names,student,2,{newLimit:2});
assert.equal(todayCoverage.length,2);
assert.ok(todayCoverage.some(w=>w.w==='기억흐림'),'due relapse takes priority');
assert.ok(todayCoverage.some(w=>w.w==='처음배울말'),'one lower-band unseen word is introduced even with overdue words');
assert.ok(!todayCoverage.some(w=>w.w==='복습대기'),'not-due review is never prematurely repeated');
assert.ok(todayCoverage.every(w=>w.coverageOriginLevel===7.4));
assert.equal(selectCoverageWords(names,student,2,{unseenOnly:true,newLimit:0}).length,0);
assert.equal(selectCoverageWords(names,student,2,{unseenOnly:true,newLimit:2}).length,1);
const oldCount=curriculumMasterySummary(names,student).totals.total;
assert.equal(curriculumMasterySummary([...names,word('나중에검수된어휘',5)],student).totals.total,oldCount+1,'newly approved words enter the whole-curriculum goal without overwriting history');
const snapshot=JSON.stringify(student);
const selection=selectDailyTargets(names,student,learningDay(),{newCount:5,reviewCount:10});
assert.ok(selection.newWords.some(w=>w.w==='처음배울말'));
assert.ok(selection.reviewWords.some(w=>w.w==='기억흐림'));
assert.equal(JSON.stringify(student),snapshot,'choosing a future target must never mutate previous learner evidence');

// A former master who cannot remember a word the next week gets a due
// refresher without losing the dated original achievement record.
const old=JSON.parse(JSON.stringify(master));
assert.equal(masteryConfirmed(old),true);
const q={w:word('기억할어휘',2),type:'subjective_recall',showTarget:false};
const miss={word:'기억할어휘',type:'subjective_recall',credit:0,practiceOnly:false,hintUsed:false,revealed:false,contextSuccess:false,answeredAt:Date.parse(t(0)+'T09:00:00+09:00')};
const failed=recordLearningEvidence(student,old,q,miss,t(0));
assert.equal(failed.unpromptedRecall,true);
assert.equal(failed.success,false);
assert.equal(old.masteryRefreshDue,true);
assert.equal(masteryConfirmed(old),false);
researchSchedule(old,failed,miss,t(0));
assert.equal(old.nextReviewAt,t(1));
assert.deepEqual(old.independentRecallDays,master.independentRecallDays,'failed recall must not erase past proof');
const again={...miss,credit:1,contextSuccess:true,answeredAt:Date.parse(t(1)+'T09:00:00+09:00')};
const regained=recordLearningEvidence(student,old,q,again,t(1));
assert.equal(regained.success,true);
assert.equal(old.masteryRefreshDue,false);
assert.equal(masteryConfirmed(old),true);
old.recallStage=6;old.lastIndependentRecallAt=t(-1);
researchSchedule(old,regained,again,t(1));
assert.equal(old.nextReviewAt,t(121),'mature review interval should eventually reach 120 days');

// Fast task level and multi-day stable baseline are independent.
const makeProfile=()=>({
 difficulty:4,leagueLevel:4,words:{},sessions:[{date:t(-2),mode:'daily',score:80},{date:t(-1),mode:'review',score:85}]
});
const newLesson=(id)=>({mode:'daily',lessonId:id,results:[]});
const answer=(i,band=5,credit=1)=>({word:'검사어'+i,band,type:'subjective_recall',credit,result:credit?'○':'×',targetRecall:credit===1,contextSuccess:credit===1,practiceOnly:false,hintUsed:false,revealed:false});
const learner=makeProfile(),first=newLesson('first');
initRealtimeLevel(learner,first);
for(let i=0;i<9;i+=3){first.results.push(answer(i),answer(i+1),answer(i+2));observeRealtimeLevel(learner,first)}
assert.ok(learner.difficulty>=4.5,'task complexity reacts promptly');
assert.equal(learner.leagueLevel,4,'ranking remains stable until session completion');
const levelAtEnd=learner.difficulty;
const recorded=updateLearningLevels(learner,first.results,learningDay(),{lessonId:first.lessonId,active:first});
assert.equal(recorded.policy,'realtime-level-12.16.18');
assert.equal(recorded.baselinePolicy,STABLE_BASELINE_POLICY);
assert.equal(recorded.taskLevelAfter,levelAtEnd);
assert.equal(learner.leagueLevel,4.2,'multi-day baseline gains at most 0.2 in one day');
assert.equal(learner.baselineDifficulty,4.2);
assert.equal(recorded.change,.2);
assert.ok(learner.difficulty<=5.0,'following lesson is bounded near the stable baseline');
const second=newLesson('second');
learner.difficulty=4.8;initRealtimeLevel(learner,second);
for(let i=9;i<18;i+=3){second.results.push(answer(i),answer(i+1),answer(i+2));observeRealtimeLevel(learner,second)}
updateLearningLevels(learner,second.results,learningDay(),{lessonId:second.lessonId,active:second});
assert.equal(learner.baselineDifficulty,4.2,'same-day extra sessions cannot rapidly raise ranking');
const saved=JSON.parse(JSON.stringify(learner));
assert.equal(stableBaselineLevel(saved),4.2);
updateLearningLevels(saved,second.results,learningDay(),{lessonId:second.lessonId,active:second});
assert.equal(saved.baselineDifficulty,4.2,'idempotent completion survives reload');
assert.equal(saved.levelAdjustmentHistory.length,2);

// Parent backfill is authoritative even if an earlier automatic anchor exists.
const adjusted={...saved,gradeBackfill:{id:'parent-reset',date:learningDay()},leagueLevel:6.3,difficulty:6.3};
assert.equal(stableBaselineLevel(adjusted),6.3,'manual level change must not be reversed by an old baseline anchor');
assert.equal(curriculumMasterySummary(names,student).totals.mastered,1);
console.log('Complete mastery PASS: cumulative approved vocabulary, no missed lower stages, due-only revisits, long-term lapse repair, 120-day recall, stable 0.2/day baseline, safe restart, parent override.');
