import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
import {createSafeUpdate,createScopedVoice} from './runtime/interaction-safety.mjs';
const effectiveSource=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
const fixtureUrl=new URL('./verify-lesson-resume.mjs',import.meta.url);
let harness=fs.readFileSync(fixtureUrl,'utf8').split('\nconst f=fixture();')[0].replace(/^import[^\n]+\n/gm,'').replaceAll('import.meta.url','fixtureUrl');
const a=harness.indexOf('const source='),b=harness.indexOf('\n',a);
harness=harness.slice(0,a)+`const source=effectiveSource.replace(/^import[^\\n]+\\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];`+harness.slice(b);
const fixture=new Function('effectiveSource','fs','vm','URL','fixtureUrl','studyHistory','DELIVERY_POLICY','localPracticeQuestion','sentenceUseQuestionValid','authoredPolicy','DAILY_POLICY','MINIMUM_STUDY_POLICY',harness+';return fixture;')(effectiveSource,fs,vm,URL,fixtureUrl,studyHistory,DELIVERY_POLICY,localPracticeQuestion,sentenceUseQuestionValid,authoredPolicy,DAILY_POLICY,MINIMUM_STUDY_POLICY);

let revision=1,reloads=0,resolveWrite,success=true,busy=false;
const updater=createSafeUpdate({capture:()=>revision,persist:()=>new Promise(r=>resolveWrite=r),isCurrent:s=>s===revision,busy:()=>busy,reload:()=>reloads++,notice:()=>{}});
updater.available();assert.equal(reloads,0,'controllerchange never reloads automatically');
const waiting=updater.apply();assert.equal(reloads,0);resolveWrite(false);assert.equal(await waiting,false);assert.equal(reloads,0);
const changed=updater.apply();revision++;resolveWrite(true);assert.equal(await changed,false);assert.equal(reloads,0);
busy=true;assert.equal(await updater.apply(),false);busy=false;
const saved=updater.apply();resolveWrite(true);assert.equal(await saved,true);assert.equal(reloads,1);

const u=fixture();await u.run('buildSession()');await u.run('cloudSave()');let uiReloads=0,releaseFlush;
u.ctx.location={reload:()=>uiReloads++};u.ctx.delayFlush=()=>new Promise(r=>releaseFlush=r);
u.run("current=0;session.queue[0].open=true;renderedAnswerAt={id:session.lessonId,index:0,word:session.queue[0].w.w};$('answer').value='업데이트 전 미제출 답';deviceStore.flush=delayFlush;safeUpdater.available()");
const uiUpdate=u.run('safeUpdater.apply()');assert.equal(uiReloads,0);releaseFlush(true);assert.equal(await uiUpdate,true);assert.equal(uiReloads,1);
const restored=fixture(u.local,u.cloud);await restored.run('cloudLoad()');assert.equal(restored.run('child().activeLesson.pendingAnswer'),'업데이트 전 미제출 답','explicit update saves the actual app draft before reload');

const microphones=[];class Recognition{constructor(){microphones.push(this)}start(){}abort(){this.aborted=true}}
let scope=1,answer='',recording=false;
const voice=createScopedVoice({capture:()=>scope,isCurrent:s=>s===scope,write:t=>answer=t,status:s=>recording=s});
voice.start(Recognition);const first=microphones[0];scope=2;answer='다른 아이 답';first.onresult({results:[[{transcript:'이전 음성'}]]});assert.equal(answer,'다른 아이 답');
voice.start(Recognition);first.onend();assert.equal(recording,true,'old end callback cannot reset new microphone');
voice.stop();microphones[1].onresult({results:[[{transcript:'종료 뒤 결과'}]]});assert.equal(answer,'다른 아이 답');

const f=fixture();await f.run('buildSession()');await f.run('cloudSave()');
f.ctx.Recognition=Recognition;f.run("window.SpeechRecognition=Recognition;current=0;session.queue[0].open=true;show('learn');$('learn').classList.add('active');renderedAnswerAt={id:session.lessonId,index:0,word:session.queue[0].w.w};startVoice()");
microphones.at(-1).onresult({results:[[{transcript:'내가 직접 말한 문장'}]]});
assert.equal(f.node('answer').value,'내가 직접 말한 문장');
assert.equal(f.run('child().activeLesson.pendingAnswer'),'내가 직접 말한 문장','voice draft checkpoints immediately');
f.run("$('answer').value='새 답';state.selected='ayoung'");microphones.at(-1).onresult({results:[[{transcript:'늦은 문장'}]]});assert.equal(f.node('answer').value,'새 답');

// Exercise the deployed explanation recovery, not a second implementation.
f.run("state.selected='guest';current=0;session.results[0]={};session.queue[0].opts=[{t:'보기',ok:false}]");
let requests=0;f.ctx.fetch=async()=>{requests++;return requests===1?{ok:false}:{ok:true,json:async()=>({reasons:[{text:'보기',reason:'선택한 말과 필요한 뜻의 차이'}]})}};
f.node('retryChoiceFeedback').remove=()=>{};
await f.run('recoverStoredChoiceFeedback(session.queue[0],session.queue[0].opts[0],session,0,session.results[0])');
assert.equal(requests,1);assert.equal(f.run('choiceFeedbackRequests.size'),0);
await f.run('recoverStoredChoiceFeedback(session.queue[0],session.queue[0].opts[0],session,0,session.results[0])');
assert.equal(requests,2);assert.ok(f.run('session.results[0].feedback').includes('필요한 뜻'));
assert.ok(!effectiveSource.includes('reloading=true;\n    location.reload()'));
assert.ok(effectiveSource.includes('POLICY_COPY.daily'));assert.ok(effectiveSource.includes('POLICY_COPY.level'));
console.log('Interaction hardening PASS: delayed/failed/changed update save, explicit safe reload, stale voice isolation, immediate voice draft, failed explanation retry in deployed source.');
