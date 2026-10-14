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
await next.run('buildSession()');
assert.equal(next.run('archiveCalls'),1);assert.equal(next.run('JSON.stringify(archiveCopy)'),previous);
assert.equal(next.run('session.results.length'),0,'new day starts without fabricated past answers');
assert.ok(next.run('session.activeMs')<1000,'new day has its own study clock');
const keep=fixture();await keep.run('buildSession()');await keep.run('cloudSave()');
keep.run("child().activeLesson.studyFallbackDay=dateAfter(today(),-1);globalThis.archiveCalls=0;switchSavedLearning=async()=>{archiveCalls++;throw Error('Must not archive explicit resume')};resumePreviousRequested=true");
await keep.run('buildSession()');assert.equal(keep.run('archiveCalls'),0);
assert.equal(keep.alerts.length,0,'explicit previous-day resume remains available');
const failure=fixture();await failure.run('buildSession()');await failure.run('cloudSave()');
const id=failure.run('savedLesson().id');failure.run('cloudSave=async()=>false');
await assert.rejects(failure.run('switchSavedLearning(savedLesson())'),/저장/);
assert.equal(failure.run('savedLesson().id'),id);assert.equal(failure.run('daySwitchBusy'),false);
assert.equal(failure.calls.generation,0,'failed transition never generates replacement content');
console.log('Production recovery verified: no-op save, retry, Seoul day boundary, stale-device guard, new-day archive, explicit resume, unsaved-work protection; no paid calls.');
