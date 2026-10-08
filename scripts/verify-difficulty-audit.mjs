import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {vocabularyBand,calibratedWord,selectLevelReviews,presentWrittenQuestion,buildLearningPlan,updateLearningLevels,sentenceWritingTask} from '../lib/learning-model.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
import {bankCompatible} from '../lib/question-bank.js';
for(const word of ['구매력','예약','색','의견'])assert.ok(sentenceWritingTask(word).prompt.includes('’을 넣어'));
for(const word of ['관찰자','사과'])assert.ok(sentenceWritingTask(word).prompt.includes('’를 넣어'));
const audit=JSON.parse(fs.readFileSync(new URL('../database/vocabulary-difficulty-audit.json',import.meta.url)));
assert.equal(audit.entries.length,2754);assert.equal(audit.entries.filter(x=>x.referenceGrade).length,2105);assert.equal(audit.entries.filter(x=>x.band!==x.previousBand).length,501);
for(const x of audit.entries)assert.equal(vocabularyBand({w:x.word,band:x.previousBand}),x.band);
const observation={w:'관찰자',d:'관찰하는 사람',band:7,cat:'국어'},prediction={w:'예측하다',d:'앞으로의 일을 미리 판단하다',band:6,cat:'국어'},tough={w:'간주하다',d:'그와 같다고 여기다',band:7,cat:'국어'};
assert.equal(vocabularyBand(observation),3);assert.equal(vocabularyBand(prediction),3);
assert.equal(vocabularyBand({w:'재고하다',band:9}),7,'reconsider is not warehouse stock merely because spellings share a stem');
assert.equal(vocabularyBand({w:'재고',band:4}),5);
const learner={difficulty:7.4,words:{관찰자:{seen:2},간주하다:{seen:1}}};const original=JSON.stringify(learner);
assert.deepEqual(selectLevelReviews([observation,tough],learner).map(w=>w.w),['간주하다','관찰자']);
const plan=buildLearningPlan([observation,prediction,tough],[],20,'daily',()=>({}),{level:7.4,strictBand:true});assert.ok(plan.every(p=>p.w.w==='간주하다'));
const packet=makePreparedPlan(learner,{관찰자:observation,간주하다:tough},[], 'family','guest',{reviewOnly:true});assert.ok(packet.plans.every(p=>p.review)&&packet.plans.some(p=>p.w.w==='관찰자'));
assert.equal(JSON.stringify(learner),original);
const grade=updateLearningLevels({...learner},Array.from({length:20},()=>({word:'관찰자',band:7,credit:1})));assert.equal(grade.samples,0);assert.equal(grade.change,0,'inflated cached bands cannot raise a high-level learner score');
for(const context of ['무대 감독이 공연을 살피고 있다.','진행자는 배가 결승점에 도착하는지 지켜보고 있다.']){
 const saved={w:observation,type:'subjective_use',q:'관찰자를 넣어 진행자의 역할을 설명하세요.',ctx:context,hints:['무대를 지켜보는 모습을 써 보세요.'],acceptedAnswers:[]};const frozen=JSON.stringify(saved),shown=presentWrittenQuestion(saved);
 assert.equal(shown.ctx,'');assert.equal(shown.q,'‘관찰자’를 넣어 뜻이 드러나는 문장 하나를 만들어 보세요.');assert.ok(!JSON.stringify(shown).includes('진행자'));assert.ok(!JSON.stringify(shown).includes('무대 감독'));assert.equal(JSON.stringify(saved),frozen);
}
const backend=vm.createContext({console,process,Map,Set,AbortSignal});
vm.runInContext(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''),backend);
vm.runInContext(fs.readFileSync(new URL('../api/questions.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export default /g,'').replace(/export /g,''),backend);
const run=s=>vm.runInContext(s,backend);
run(`globalThis.item={id:'1',type:'mc_usage',word:'간주하다',definition:'그와 같다고 여기다',band:7,readerLevel:7.4,answerSlot:0,taskDemand:'advanced'};
 globalThis.sample={id:'1',type:'mc_usage',prompt:'이 말을 쓰기에 적절한 상황을 고르세요.',context:'',showTarget:true,answerForm:'간주하다',options:Array.from({length:5},(_,i)=>({text:'검토 대상 '+i+'를 규정에 따라 판단하는 상황입니다.',correct:i===0})),acceptedAnswers:[],hints:['판단의 기준을 확인하세요.','그와 같다고 보는 조건을 살펴보세요.'],signature:'규정에 따른 판단'};
 globalThis.flags={id:'1',valid:true,sufficientClues:true,oneClearAnswer:true,samePartOfSpeechChoices:true,naturalKorean:true,coherentSituation:true,ageAppropriate:true,factualAccuracy:true,readerLevelFit:true,levelDemandFit:true,noBackgroundBurden:true,vocabularyFocus:true,noAnswerLeak:true,naturalAlternativesConsidered:true,notTooSimilarToRecent:true,learningCardAccurate:true,semanticContrast:true,nearMeaningDistractors:3,decisiveSemanticFeature:'실제로 같음의 확인이 아니라 정해진 조건에 따라 같다고 처리함',issues:[],acceptedAnswers:[]};
 ask=async(prompt,schema,name)=>name==='validated_vocab_questions'?{questions:[sample]}:{reviews:[flags]};`);
assert.equal((await run('buildValidated([item],[],{maxAttempts:1,partial:true})')).length,1);
for(const mutation of ['flags.nearMeaningDistractors=2','flags.nearMeaningDistractors=3;flags.decisiveSemanticFeature=""','flags.decisiveSemanticFeature="같다고 처리함";flags.semanticContrast=false']){
 run(mutation);const out=await run('buildValidated([item],[],{maxAttempts:1,partial:true})');assert.equal(out.length,0);assert.ok(out.failed[0].issues.includes('review_failed:semanticContrast'));
}
run(`item={...item,type:'subjective_use'};sample={...sample,type:'subjective_use',prompt:'관찰자의 역할을 설명하세요.',context:'진행자는 배가 도착하는지 지켜보고 있다.',showTarget:true,options:[],hints:['진행자 역할을 쓰세요.','지켜보고 있었다.']};`);
const use=await run('buildValidated([item],[],{maxAttempts:1,partial:true})');assert.equal(use.length,1);assert.equal(use[0].context,'');assert.ok(use[0].prompt.includes('간주하다'));assert.ok(!use[0].hints.join('').includes('진행자'));
console.log('Difficulty audit verified: 2,754 entries inventoried, 2,105 reference matches, 501 calibrated bands; cached high-band easy words cannot enter selection or raise grades; homographs retained by meaning; both reported sentence scenes removed without mutating saves; advanced MC rejects fewer than 3 nearby distractors or a missing semantic discriminator.');

