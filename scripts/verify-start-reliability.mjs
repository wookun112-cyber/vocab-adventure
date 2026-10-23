import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {learningDay,dateAfter,vocabularyUsageConfirmed,masteryConfirmed,selectCoverageWords} from '../lib/learning-model.js';
import {prepare} from '../api/prepare-worker.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
const effectiveSource=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
const fixtureUrl=new URL('./verify-grading-reliability.mjs',import.meta.url);
let harness=fs.readFileSync(fixtureUrl,'utf8').split('\nconst f=fixture();')[0].replace(/^import[^\n]+\n/gm,'').replaceAll('import.meta.url','fixtureUrl');
const a=harness.indexOf('const source='),b=harness.indexOf('\n',a);
harness=harness.slice(0,a)+`const source=effectiveSource.replace(/^import[^\\n]+\\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];`+harness.slice(b);
harness=harness.replace(' run("getPreparation=async', ' run("globalThis.originalGetPreparation=getPreparation");\n run("getPreparation=async');
const fixture=new Function('effectiveSource','fs','vm','URL','fixtureUrl','studyHistory','DELIVERY_POLICY','localPracticeQuestion','sentenceUseQuestionValid','authoredPolicy','DAILY_POLICY','MINIMUM_STUDY_POLICY',harness+'\n;return fixture;')(
 effectiveSource,fs,vm,URL,fixtureUrl,studyHistory,DELIVERY_POLICY,localPracticeQuestion,sentenceUseQuestionValid,authoredPolicy,DAILY_POLICY,MINIMUM_STUDY_POLICY);
const make=()=>{const f=fixture();f.run("$('home').classList.add('active');globalThis.scrollCount=0;window.scrollTo=()=>scrollCount++;warmDailyQuestions=()=>{};getPreparation=originalGetPreparation;const previousMake=makeRemoteLesson;makeRemoteLesson=()=>{const r=previousMake();Object.assign(r.payload,{roundPolicy:studyHistory.ROUND_POLICY,coveragePolicy:COVERAGE_POLICY,reviewPolicy:REVIEW_POLICY,completionPolicy:DAILY_POLICY,baseCount:r.payload.plans.length,plannedFor:today(),budget:{policy:DAILY_POLICY}});return r};renderResumeButton();preparationSnapshot(state.selected);");return f};
// Failed start must keep the already-visible home card/scroll, unlock buttons,
// retain the error and every learner record instead of silently navigating.
const failed=make(),before=failed.run('JSON.stringify(child())');
failed.run("globalThis.recoveryRemote={id:'failed-job',status:'failed',payload:null}");
await failed.run("buildSession('daily')");
assert.equal(failed.run('scrollCount'),0);assert.equal(failed.run('preparingSession'),false);
assert.equal(failed.node('startDaily').disabled,false);assert.equal(failed.node('startReview').disabled,false);
assert.ok(failed.node('learningStartStatus').textContent);assert.equal(failed.node('cloudPill').textContent,'학습 시작 확인 필요');
assert.equal(failed.run('JSON.stringify(child())'),before);assert.equal(failed.run('session'),null);
// A manual start joining a failed warm-up must still issue its own deliberate
// retry once. It must not reuse the old failure or start browser generation.
const retry=make();let release;retry.ctx.releaseWait=new Promise(r=>release=r);
retry.run("globalThis.rpcRetries=[];serverLesson=async(profile,id,explicit)=>{rpcRetries.push(!!explicit);if(rpcRetries.length===1){await releaseWait;return {id:'job',status:'failed',payload:null}}return makeRemoteLesson()};");
const warm=retry.run("getPreparation('daily')").catch(e=>e);
const start=retry.run("buildSession('daily')");release();await warm;await start;
assert.deepEqual(JSON.parse(retry.run('JSON.stringify(rpcRetries)')),[false,true]);
assert.ok(retry.run('session'));assert.equal(retry.calls.consumes,1);assert.equal(retry.calls.generation,0);
assert.ok(retry.run('scrollCount')>=1,'successful screen transition still scrolls to the question');
// Repeated starts and old failures never consume the same lesson twice.
assert.equal(retry.run('preparingSession'),false);assert.equal(retry.run('preparationLoads.size'),0);
// This exact mixed historical state caused production's rejected coverage plan:
// a successful old sentence, no nextReviewAt, and no long-term mastery yet.
const day=learningDay(),w={w:'예외',d:'정해진 규칙이나 보통의 경우와 다른 일이다.',band:2,cat:'수학·논리'};
const learner={difficulty:3.2,words:{예외:{seen:3,useSuccess:1,useDays:[dateAfter(day,-14)],nextReviewAt:null,lastExposureAt:dateAfter(day,-2)}}};
assert.equal(vocabularyUsageConfirmed(learner,w.w),true);assert.equal(masteryConfirmed(learner.words.예외),false);
assert.equal(selectCoverageWords([w],learner,2,{day})[0].w,w.w);
const packet=await prepare({id:'historical-state',account:authoredPolicy.AUTHORED_OWNER,profile:'ayoung',learner,catalog:{}},'synthetic',async()=>{throw Error('No paid generation')},async()=>true);
assert.ok(packet.plans.some(p=>p.w.w===w.w&&p.coveragePolicy));assert.equal(packet.ready.length,packet.plans.length);
assert.equal(packet.newWords.length,5);assert.ok(packet.plans.filter(p=>p.review).length<=10);
const sql=fs.readFileSync(new URL('../database/coverage-mastery-start-reliability.sql',import.meta.url),'utf8');
assert.ok(sql.includes('not vocab_private.mastery_confirmed')&&sql.includes('not vocab_private.correct_word_blocked'));
assert.ok(sql.includes("c.definition=x#>>'{w,d}'")&&sql.includes('c.quality_status'));
console.log('Start reliability PASS: effective browser failure stays at current scroll, visible status and retry unlock; failed warm-up→one explicit retry→one consume; mixed historical usage/unfinished mastery builds a full offline packet; ownership/curriculum/cooldown guards retained.');
