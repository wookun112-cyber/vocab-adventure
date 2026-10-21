import assert from 'node:assert/strict';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {authoredCurriculum} from '../api/authored-bank.js';
import {calibratedWord,selectDailyTargets,learningDay,initRealtimeLevel,observeRealtimeLevel,updateLearningLevels,stableBaselineLevel,masteryConfirmed} from '../lib/learning-model.js';
import {recordStudySession,dailyStudyRows} from '../lib/study-history.js';

const day=learningDay(),curriculum=authoredCurriculum(AUTHORED_OWNER)
 .map(r=>calibratedWord({w:r.word,d:r.definition,band:r.band,cat:r.domain,source:'fixed'}));
const unique=(band,count)=>[...new Map(curriculum.filter(w=>w.band===band).map(w=>[w.w,w])).values()].slice(0,count);
const basic=unique(2,9),upper=unique(3,6);
assert.ok(basic.length>=9&&upper.length>=6,'verified authored bank supports two neighboring bands');
const fresh=selectDailyTargets([...basic,...upper],{difficulty:2,words:{}},day,{reviewCount:0});
assert.equal(fresh.newWords.length,5);
assert.equal(fresh.newWords.filter(w=>w.band===3).length,3,'offer three higher-band words within the unchanged five-new budget');
assert.equal(new Set(fresh.newWords.map(w=>w.w)).size,5);

const makeLearner=(previous=true)=>({difficulty:2,leagueLevel:2,baselineDifficulty:2,words:{},learningEvidence:[],
 sessions:previous?[{mode:'daily',date:'2026-10-01',total:10,score:60}]:[]});
const rec=(w,credit=1,extra={})=>({word:w.w,band:w.band,type:'subjective_recall',credit,result:credit?'○':'×',
 contextSuccess:credit===1,targetRecall:credit===1,levelEligible:true,...extra});
function simulate({baseCorrect=4,upperCorrect=2,upperCount=3,previous=true,id='lesson'}={}){
 const learner=makeLearner(previous),active={mode:'daily',lessonId:id,results:[]};
 initRealtimeLevel(learner,active);
 active.results.push(...basic.slice(0,3).map(w=>rec(w)));
 assert.ok(observeRealtimeLevel(learner,active)?.change>0,'fast current task level should respond immediately');
 const lower=basic.slice(3,3+7-upperCount).map((w,i)=>rec(w,i<baseCorrect-3?1:0));
 const high=upper.slice(0,upperCount).map((w,i)=>rec(w,i<upperCorrect?1:0));
 active.results.push(...lower,...high);
 observeRealtimeLevel(learner,active);
 const beforeWords=JSON.stringify(learner.words),beforeEvidence=JSON.stringify(learner.learningEvidence);
 const a=updateLearningLevels(learner,active.results,day,{lessonId:id,active});
 assert.equal(JSON.stringify(learner.words),beforeWords,'promotion must never grant vocabulary mastery');
 assert.equal(JSON.stringify(learner.learningEvidence),beforeEvidence,'promotion must not invent delayed recall');
 assert.equal(updateLearningLevels(learner,active.results,day,{lessonId:id,active}),a,'session finalization remains idempotent');
 return {learner,a,active};
}
let x=simulate({baseCorrect:5,upperCorrect:2,id:'seventy'});
assert.equal(x.a.independentAccuracy,70);assert.equal(x.a.upperAttempts,3);assert.equal(x.a.upperCorrect,2);
assert.equal(x.learner.leagueLevel,2.1,'70% with successful upper-band challenge earns +0.1');
x=simulate({baseCorrect:6,upperCorrect:2,id:'eighty'});
assert.equal(x.a.independentAccuracy,80);assert.equal(x.learner.leagueLevel,2.1);
x=simulate({baseCorrect:6,upperCorrect:3,id:'ninety'});
assert.equal(x.a.independentAccuracy,90);assert.equal(x.learner.leagueLevel,2.3,'90% plus upper mastery promotes faster');
x=simulate({baseCorrect:6,upperCorrect:4,upperCount:4,id:'exceptional'});
assert.equal(x.a.independentAccuracy,100);assert.equal(x.learner.leagueLevel,2.4,'excellent upper-band performance earns maximum +0.4 per day');
x=simulate({baseCorrect:7,upperCorrect:0,upperCount:0,id:'no-upper'});
assert.equal(x.learner.leagueLevel,2,'even perfect easy-only answers cannot certify upper ability');
x=simulate({baseCorrect:6,upperCorrect:3,previous:false,id:'new-child'});
assert.equal(x.learner.leagueLevel,2,'prior-day evidence is still required for stable promotion');
assert.equal(stableBaselineLevel(x.learner),2);

const reviewLearner=makeLearner(),reviewActive={mode:'daily',lessonId:'review-assessment',results:[]};
initRealtimeLevel(reviewLearner,reviewActive);
reviewActive.results=basic.slice(0,3).map(w=>rec(w,1,{practiceOnly:true,assessmentEligible:true}));
assert.equal(observeRealtimeLevel(reviewLearner,reviewActive).change,.3,'first unassisted due reviews count without being reintroduced');

const records={difficulty:2,words:{},sessions:[]},now=Date.now();
recordStudySession(records,{lessonId:'history-evidence',mode:'daily',studyStartedAt:now,studyDays:{[day]:{activeMs:60000,timeKnown:true}},results:[
 {...rec(basic[0]),assessmentEligible:true,assessedUpper:false,studyDate:day,practiceOnly:true},
 {...rec(upper[0]),assessmentEligible:true,assessedUpper:true,studyDate:day,practiceOnly:true},
 {...rec(upper[1],0),assessmentEligible:true,assessedUpper:true,studyDate:day,practiceOnly:true}
]},now,true);
const todayRow=dailyStudyRows(records)[0];
assert.equal(todayRow.assessmentAttempts,3);assert.equal(todayRow.assessmentCorrect,2);
assert.equal(todayRow.assessmentAccuracy,67);assert.equal(todayRow.upperAttempts,2);assert.equal(todayRow.upperCorrect,1);
assert.equal(todayRow.independentAttempts,3,'first assessment is distinct from remedial practice');
assert.equal(masteryConfirmed(records.words[basic[0].w]),false,'report counters never confer 7/30-day mastery');
console.log('Promotion policy verified: upper-band selection, 70/80/90/100 promotion, no easy-score inflation, independent due reviews, spaced mastery preserved and report accounting.');
