import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {patchStuckPreparation} from './patch-stuck-preparation.mjs';
import {createGradeDelivery} from '../lib/server/grade-delivery.js';
import {exactWordGrade} from '../lib/server/exact-word-grade.js';
import {authorizeGradeTask} from '../lib/server/grade-access.js';
const effectiveSource=patchStuckPreparation(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
const fixtureUrl=new URL('./verify-lesson-resume.mjs',import.meta.url);
let harness=fs.readFileSync(fixtureUrl,'utf8').split('\nconst f=fixture();')[0].replace(/^import[^\n]+\n/gm,'').replaceAll('import.meta.url','fixtureUrl');
const a=harness.indexOf('const source='),b=harness.indexOf('\n',a);
harness=harness.slice(0,a)+`const source=effectiveSource.replace(/^import[^\\n]+\\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];`+harness.slice(b);
const fixture=new Function('effectiveSource','fs','vm','URL','fixtureUrl','studyHistory','DELIVERY_POLICY','localPracticeQuestion','sentenceUseQuestionValid','authoredPolicy','DAILY_POLICY','MINIMUM_STUDY_POLICY',harness+';return fixture;')(effectiveSource,fs,vm,URL,fixtureUrl,studyHistory,DELIVERY_POLICY,localPracticeQuestion,sentenceUseQuestionValid,authoredPolicy,DAILY_POLICY,MINIMUM_STUDY_POLICY);
async function recall(){
 const f=fixture();await f.run('buildSession()');
 f.run("session.queue[current]={...session.queue[current],w:{w:'운반하다',d:'물건을 다른 곳으로 옮기다',band:2,cat:'생활'},type:'subjective_recall',open:true,showTarget:false,opts:[],needsCard:false,answerForm:'운반하다',acceptedAnswers:['운반하다'],feedbackCorrect:'정답은 운반하다입니다.'};session.preparation.plans[current]={...session.preparation.plans[current],w:session.queue[current].w,type:'subjective_recall',needsCard:false};session.preparation.ready.set(current,session.queue[current]);renderQuestion();");
 return f;
}
for(const answer of ['운반하다','운반하다'.normalize('NFD')+'\u200b',' “운반하다” ']){
 const f=await recall();f.node('answer').value=answer;f.ctx.fetch=()=>{throw Error('Exact match must never request AI')};
 await f.run('gradeCurrent(false)');
 assert.equal(f.run('session.results[0].credit'),1);assert.equal(f.run('session.results[0].rawAnswer'),answer.trim());
 assert.ok(f.node('feedback').innerHTML.includes('○ 잘했어요!'));assert.ok(!f.node('feedback').innerHTML.includes('× 다시'));
}
const hinted=await recall();hinted.node('answer').value='운반하다';hinted.run('hintLevel=1');await hinted.run('gradeCurrent(false)');assert.equal(hinted.run('session.results[0].credit'),.75);assert.ok(hinted.node('feedback').innerHTML.includes('○ 힌트로 맞혔어요'),'hinted exact answer is labeled correct while assisted evidence remains separate');
const delayed=await recall();delayed.ctx.job={id:'old-job',answer:'운반하다',hintUsed:false};delayed.node('answer').value='운반하다';
delayed.run("applyGradedAnswer(session.queue[current],{score:0,contextSuccess:false,targetRecall:false,feedback:'정답은 운반하다입니다.'},job)");
assert.equal(delayed.run('session.results[0].credit'),1);assert.ok(delayed.node('feedback').innerHTML.includes('○ 잘했어요!'));
const wrong=await recall();wrong.ctx.job={id:'other',answer:'관찰하다',hintUsed:false};wrong.run("applyGradedAnswer(session.queue[current],{score:0,contextSuccess:false,targetRecall:false},job)");assert.equal(wrong.run('session.results[0].credit'),0);
const sentence=await recall();sentence.run("session.queue[current].type='subjective_use'");sentence.ctx.job={id:'sentence',answer:'운반하다',hintUsed:false};sentence.run("applyGradedAnswer(session.queue[current],{score:0,contextSuccess:false,targetRecall:false},job)");assert.equal(sentence.run('session.results[0].credit'),0,'word alone is not a completed sentence');
const keys=await recall();keys.ctx.payload={taskType:'sentence_use',targetWord:'의견',answer:'내 의견이다',question:'문장'};const oldKey=keys.run('gradeReceiptKey(payload)');keys.ctx.payload.gradingPolicy='meaning-first-20261018';assert.notEqual(keys.run('gradeReceiptKey(payload)'),oldKey,'browser receipt lookup also honors grading policy');
let paid=0,assigned=true,reads=0;
const handler=createGradeDelivery({verifyUser:async()=>({id:'family'}),deterministicGrade:exactWordGrade,authorizeTask:authorizeGradeTask,gradeForRequest:r=>r,runGrade:async()=>{paid++;throw Error('No provider allowed')},gradeRPC:async(auth,name)=>{assert.equal(name,'get_vocab_grade_assignment');reads++;return assigned}});
const payload={taskType:'context_answer',targetWord:'운반하다',definition:'물건을 옮기다',answer:'운반하다',question:'물건을 다른 곳으로 옮기다',source:'typed'};
async function call(extra={}){const res={status(n){this.code=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{...payload,...extra}},res);return res}
for(const extra of [{},{pollOnly:true},{gradeReceipt:'old-invalid-receipt'}]){const r=await call(extra);assert.equal(r.code,200);assert.equal(r.body.score,1);assert.equal(r.body.gradingMethod,'exact_word')}
assigned=false;assert.equal((await call()).code,409);assert.equal(paid,0);assert.equal(reads,4);
assert.equal(exactWordGrade({...payload,taskType:'sentence_use'}),null);assert.equal(exactWordGrade({...payload,answer:'관찰하다'}),null);
console.log('Exact word PASS: production browser direct/Unicode/delayed-wrong-grade paths all show correct; different answers and word-only sentence tasks stay distinct; server checks saved assignment, uses no AI/cache/lease writes; browser receipt policy keys isolated.');
