import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {copiedUsageExample} from '../lib/learning-model.js';
import {gradeHash} from '../lib/server/grade-delivery.js';
let calls=0,body,assessment={meaning:'correct',target:'present',expression:'complete',issue:'form_only'};
const ctx=vm.createContext({process,console,AbortSignal,createHash,copiedUsageExample,fetch:async(url,opts)=>{
 calls++;body=JSON.parse(opts.body);
 return {ok:true,json:async()=>({output_text:JSON.stringify({normalizedAnswer:'',score:.5,result:'△',contextSuccess:false,targetRecall:true,feedback:'조사를 다듬어야 해요.',exampleAnswer:'',correctionApplied:true,correctionNote:'조사 에를 의로 다듬을 수 있어요.',usageAssessment:assessment})})};
}});
vm.runInContext(fs.readFileSync(new URL('../api/grade.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export default /g,'').replace(/export /g,''),ctx);
const run=code=>vm.runInContext(code,ctx);
for(const [target,answer] of [['항생제','엄마가 나에게 항생제를 먹으라고 했다'],['일정하다','이곳에서 저곳에 거리는 일정하다'],['사전','학교 도서관에서 사전을 빌렸다'],['펼치다','비가 와서 우산을 펼쳤다']]){
 ctx.payload={taskType:'sentence_use',gradingPolicy:'meaning-first-20261018',targetWord:target,answer,question:target+'를 넣어 문장을 만드세요.'};
 const before=calls,r=await run('runGrade(payload)');
 assert.equal(calls,before+1,'one existing grading request, no extra review request');
 assert.equal(r.score,1);assert.equal(r.contextSuccess,true);assert.equal(r.targetRecall,false);assert.equal(r.result,'○');assert.match(r.feedback,/알맞게/);
 assert.ok(body.input.includes('정의를 문장 안에서 풀어 설명'));assert.ok(body.text.format.schema.required.includes('usageAssessment'));
}
for(const [a,expected] of [[{meaning:'incorrect',target:'present',expression:'complete',issue:'meaning_error'},0],[{meaning:'correct',target:'missing',expression:'complete',issue:'insufficient_meaning'},0],[{meaning:'unclear',target:'present',expression:'complete',issue:'insufficient_meaning'},.5],[{meaning:'correct',target:'present',expression:'incomplete',issue:'insufficient_meaning'},.5]]){
 assessment=a;assert.equal((await run('runGrade(payload)')).score,expected);
}
assessment={meaning:'correct',target:'present',expression:'complete',issue:'none'};ctx.payload.answer=ctx.payload.targetWord;
assert.equal((await run('runGrade(payload)')).score,0,'word-only input is still rejected');
assessment=undefined;await assert.rejects(run('runGrade(payload)'),/Missing usage assessment/);
const old={taskType:'sentence_use',targetWord:'사전',answer:'사전을 빌렸다',question:'문장 만들기'};
const legacy=createHash('sha256').update(JSON.stringify(['usage-grade-12.16.24',process.env.OPENAI_MODEL||'gpt-6-luna',old.taskType,old.targetWord,old.definition,old.question,old.answer,old.source,old.readerLevel,old.acceptedAnswers,old.allowNaturalDerivations,old.gradingContext||''])).digest('hex');
assert.equal(gradeHash(old),legacy,'saved pending jobs and signed receipts retain their exact identity');
assert.notEqual(gradeHash({...old,gradingPolicy:'meaning-first-20261018'}),legacy,'new submissions do not reuse old strict semantic grades');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
vm.runInContext(app.split('\n').find(line=>line.startsWith('const normalizeTyped=')),ctx);
ctx.answer='물음표'.normalize('NFD')+'\u200b';assert.equal(run('normalizeTyped(answer)'), '물음표');
assert.notEqual(run("normalizeTyped('느낌표')"),'물음표');
console.log('Meaning grading PASS: explicit semantic rubric, form-only feedback without score deduction, wrong/missing/incomplete meaning gates, word-only rejection, one call, Unicode exact answer matching, new-policy cache isolation and legacy receipt identity. Provider mocked; semantic model quality still requires live-use monitoring.');
