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
const f=fixture();
f.run("globalThis.originalGetPreparation=getPreparation;getPreparation=async(...args)=>{const p=await originalGetPreparation(...args);p.roundPolicy=studyHistory.LEGACY_ROUND_POLICY;p.serverId='round-packet-'+(child().sessions.length+1);return p};");
for(let n=1;n<=4;n++){
 await f.run("buildSession('daily')");
 assert.equal(f.run('session.mode'),'daily');assert.equal(f.run('session.roundNumber'),n);
 f.run("session.results=session.baseWords.map(w=>({word:w.w,type:'subjective_use',result:'○',credit:1,contextSuccess:true,hintUsed:false,revealed:false,answeredAt:Date.now(),studyDate:today()}));session.activeMs=20*60000;session.clockStarted=null;session.studyDays={[today()]:{activeMs:20*60000,timeKnown:true}};session.studyTimeInitialized=true;finishSession()");
 await f.run('cloudSave()');
 assert.equal(f.run('session.completed'),true);assert.equal(f.run('child().sessions.length'),n);
 assert.match(f.node('startDaily').textContent,new RegExp((n+1)+'회차 시작하기'));
 assert.match(f.alerts.at(-1),new RegExp(n+'회차 완료'));
}
assert.equal(f.calls.consumes,4);assert.equal(f.calls.generation,0);
assert.equal(f.run('studyHistory.dailyStudyTime(child())'),80*60000,'four actual rounds sum honestly beyond a daily 30-minute cap');
console.log('Same-day rounds PASS: production main button starts/consumes four independent server packets, numbers advance, 20-minute completion each, exact daily total and no paid generation.');
// Earlier rounds must not turn a resumable current round into an archived
// legacy daily-cap lesson just because the day's total exceeds 25 minutes.
const resumed=fixture();await resumed.run('buildSession()');
resumed.run("session.roundPolicy=studyHistory.LEGACY_ROUND_POLICY;session.roundNumber=2;session.activeMs=20*60000;session.clockStarted=null;session.studyDays={[today()]:{activeMs:session.activeMs,timeKnown:true}};child().sessions.push({lessonId:'earlier-round',date:today(),mode:'daily',activeMinutes:20,total:5,good:5,wrong:0});child().studyRounds.entries[session.lessonId].number=2;child().studyRounds.entries['earlier-round']={number:1,day:today()};checkpointSession();globalThis.resumedId=session.lessonId;session.preparation.cancel();session=null");
const consumedBefore=resumed.calls.consumes;
await resumed.run("buildSession('daily')");
assert.ok(resumed.run('session'),'unfinished round resumes even after 40 cumulative minutes');
assert.equal(resumed.run('session.lessonId'),resumed.run('resumedId'));
assert.equal(resumed.run('session.roundNumber'),2);
assert.equal(resumed.run('session.completed'),undefined);
assert.equal(resumed.calls.consumes,consumedBefore,'resume consumes no replacement lesson');
console.log('Same-day unfinished resume PASS: previous 20m plus current 20m stays in round two without archiving or consuming round three.');
