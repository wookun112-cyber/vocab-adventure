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
const writes=f.calls.writes.length;
f.run("globalThis.originalSet=localStorage.setItem;localStorage.setItem=()=>{const e=Error('full');e.name='QuotaExceededError';throw e};child().quotaTest='saved remotely'");
assert.equal(await f.run('cloudSave()'),true,'device quota failure cannot block server save');
assert.ok(f.calls.writes.length>writes);assert.equal(f.cloud.get('family').users.guest.quotaTest,'saved remotely');
assert.ok(f.node('cloudPill').textContent.includes('기기 저장 확인'));
f.run("globalThis.originalRpc=sb.rpc;sb.rpc=async()=>({error:{code:'57014',message:'timeout'}});child().quotaTest='keep in memory'");
assert.equal(await f.run('cloudSave()'),false);assert.equal(f.run('cloudSavePending'),true);
assert.ok(f.node('cloudPill').textContent.includes('창을 닫지'));
assert.ok(!f.node('cloudPill').textContent.includes('기기에 보관됨'),'do not claim failed local write was durable');
f.run('sb.rpc=originalRpc;localStorage.setItem=originalSet');
assert.equal(await f.run('cloudSave()'),true);assert.equal(f.run('deviceStoreError'),null);
assert.equal(f.cloud.get('family').users.guest.quotaTest,'keep in memory');
const recover=fixture(f.local,f.cloud);await recover.run('cloudLoad()');
assert.equal(recover.run('child().quotaTest'),'keep in memory');
const job={id:'received-before-close',payload:{taskType:'sentence_use',answer:'stored'},receivedGrade:{score:1,contextSuccess:true,targetRecall:false,feedback:'saved'}};
recover.ctx.recoveredJob=job;
assert.equal((await recover.run('requestGrade(recoveredJob)')).score,1,'received grade never requests another provider');
assert.equal(recover.calls.generation,0);
console.log('Storage safety PASS: quota does not block cloud write, both failures retain retry state and honest warning, recovery survives reload, saved grade reuse makes zero provider calls.');

// Cache reconciliation runs only after device-only changes have reached cloud.
const archived=fixture();await archived.run('cloudSave()');
archived.run("child().pausedLessonIndex=[{id:'old',pendingGrades:1}];child().unsentDraftMarker='keep';storeLearnerCheckpoint(state.selected);localSave();session=null");
let recoveredCalls=0,flushedMarker;
archived.ctx.fetch=async url=>{
 assert.equal(url,'/api/recover-grades');recoveredCalls++;
 const remote=archived.cloud.get('family');
 flushedMarker=remote.users.guest.unsentDraftMarker;
 remote.users.guest.recoveredGradeMarker='ready';remote.users.guest.daySwitchSequence=(remote.users.guest.daySwitchSequence||0)+1;
 return {ok:true};
};
await archived.run('cloudLoad()');
assert.equal(recoveredCalls,1);assert.equal(flushedMarker,'keep');assert.equal(archived.run('child().recoveredGradeMarker'),'ready');
assert.equal(archived.run('child().unsentDraftMarker'),'keep');
console.log('Load-boundary archived recovery: flush unsynced draft first, read committed recovery, keep learner state.');
