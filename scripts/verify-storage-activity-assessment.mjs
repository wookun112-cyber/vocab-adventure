import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as clock from '../lib/study-history.js';
import {buildDailyPlan} from '../lib/daily-practice.js';
import {initRealtimeLevel,observeRealtimeLevel,calibratedWord} from '../lib/learning-model.js';
import {authoredCurriculum} from '../api/authored-bank.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const patch=vm.runInNewContext(app.slice(app.indexOf('function learningPatch('),app.indexOf('async function cloudSave('))+';learningPatch');
const before={users:{ayoung:{words:{근거:{seen:1}},activeLesson:{results:[],ready:Array.from({length:50},(_,i)=>[i,{ctx:'긴 지문'.repeat(200)}])}},inseong:{difficulty:2,words:{}}}};
const after=structuredClone(before);after.users.ayoung.words.근거.seen=2;after.users.ayoung.activeLesson.results.push({word:'근거',credit:1});
const changes=patch(before,after);assert.ok(JSON.stringify(changes).length<500);assert.equal(before.users.ayoung.words.근거.seen,1);
assert.ok(changes.every(op=>op.path[1]==='ayoung'));assert.equal(patch(after,structuredClone(after)).length,0);
const start=Date.parse('2026-10-13T12:00:00Z');
const active={activeMs:0,clockStarted:start};clock.beginStudyWindow(active,'question:0',start);
for(let seconds=10;seconds<=90;seconds+=10)clock.recordStudyActivity(active,start+seconds*1000);
assert.equal(clock.activeStudyTime(active,start+90000),90000,'continued writing counts the full 90 seconds');
clock.captureStudyClock(active,start+690000);assert.equal(active.activeMs,100000,'abandoned window adds at most 10 seconds');
clock.recordStudyActivity(active,start+700000);assert.equal(active.activeMs,100000,'resuming never fills the idle gap');
assert.equal(clock.activeStudyTime(active,start+710000),110000);
const words=authoredCurriculum(AUTHORED_OWNER).map(w=>calibratedWord({w:w.word,d:w.definition,cat:w.domain,band:w.band})).filter(w=>w.band===4).slice(0,5);
assert.equal(words.length,5);
const plans=buildDailyPlan(words,[],()=>({}),4),learner={difficulty:4,words:{}},lesson={mode:'daily',results:[]};initRealtimeLevel(learner,lesson);
assert.ok(plans.every(p=>p.type==='subjective_recall'&&p.realtimeProbe&&!p.needsCard));
for(const p of plans.slice(0,3)){
 lesson.results.push({word:p.w.w,band:4,type:p.type,result:'○',credit:1,contextSuccess:true,targetRecall:true,levelEligible:true});observeRealtimeLevel(learner,lesson);
}
assert.equal(lesson.adaptation.rows.length,3);assert.ok(learner.difficulty>4,'daily-plan questions actually supply promotion evidence');
const uncertain={difficulty:4,words:{}},unknownLesson={mode:'daily',results:[]};initRealtimeLevel(uncertain,unknownLesson);
for(const p of plans.slice(0,3)){
 unknownLesson.results.push({word:p.w.w,band:4,type:p.type,result:'×',credit:0,contextSuccess:false,targetRecall:false,levelEligible:true,revealed:true,meaningUnknown:true});observeRealtimeLevel(uncertain,unknownLesson);
}
assert.equal(unknownLesson.adaptation.rows.length,3);assert.equal(uncertain.difficulty,3.7,'unassisted explicit unknown answers are meaning failures before feedback');
console.log('Storage/activity/assessment verified: small child-only patches, no-op saves, 90-second writing, bounded idle gaps, and real daily-plan evaluation.');
