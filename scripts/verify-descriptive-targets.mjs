import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isLearningTarget,isContextOnlyExpression,buildLearningPlan,selectLevelReviews} from '../lib/learning-model.js';
import {makePreparedPlan} from '../lib/prepared-plan.js';
const audit=JSON.parse(fs.readFileSync(new URL('../lib/descriptive-expressions.json',import.meta.url)));
assert.equal(audit.length,1511);
for(const phrase of audit){assert.equal(isLearningTarget(phrase),false,phrase);assert.equal(isLearningTarget(phrase.replace(/\s/gu,'')),false,phrase+' joined');}
for(const phrase of ['상징적 장치','상징적장치','상징적\u00a0장치','서술 관점','감정 표현','근거의 적절성','협상 결렬','성찰적 관점','성찰적관점','새로운 설명 구절'])assert.equal(isContextOnlyExpression(phrase),true);
for(const word of ['상징','장치','서술','관점','표현','감정','격차','적응력','목적지','시행착오','책가방','역지사지','탄소 중립','먹이 사슬','발이 넓다'])assert.equal(isLearningTarget(word),true,word+' retained');
const core={w:'상징',d:'다른 뜻을 나타내는 구체적 대상',band:3,cat:'국어'},phrase={w:'상징적 장치',d:'다른 뜻을 나타내는 표현 장치',band:3,cat:'국어'};
const learner={difficulty:3,words:{'상징적 장치':{seen:9,wrong:1},'상징':{seen:2,wrong:1}}};
const before=JSON.stringify(learner);
assert.deepEqual(selectLevelReviews([phrase,core],learner,20).map(w=>w.w),['상징']);
for(const mode of ['daily','review','level']){
 const plan=buildLearningPlan([phrase,core],[phrase,core],20,mode,()=>({seen:2}),{level:3});
 assert.equal(plan.length,20);assert.ok(plan.every(p=>p.w.w==='상징'));
}
const curriculum=Array.from({length:25},(_,i)=>({word:'독립어휘'+i,definition:'독립된 뜻을 가진 단어',band:3,domain:'국어'}));
const packet=makePreparedPlan(learner,{'상징적 장치':phrase},[...curriculum,{word:phrase.w,definition:phrase.d,band:3,domain:'국어'}],'family','guest');
assert.ok(packet.plans.every(p=>p.w.w!==phrase.w));assert.equal(JSON.stringify(learner),before,'selection never deletes old history');
// Actual vocabulary-generation endpoint rejects unseen phrases as well as audited
// spelling variants; independent targets survive the same AI response.
const replies=[{word:'상징적장치',definition:'설명구',band:3,domain:'국어'},{word:'새로운 설명 구절',definition:'설명구',band:3,domain:'국어'},{word:'성찰적관점',definition:'설명구',band:3,domain:'국어'},{word:'상징',definition:core.d,band:3,domain:'국어'},{word:'시행착오',definition:'실패하며 방법을 찾음',band:3,domain:'국어'}];
let prompt='';
const ctx=vm.createContext({AbortSignal,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,authoredQuestionValid:authoredPolicy.authoredQuestionValid,sentenceUseQuestionValid,console,process:{env:{OPENAI_API_KEY:'test'}},Map,Set,fetch:async(url,opts)=>{if(url.includes('/auth/'))return {ok:true};prompt=JSON.parse(opts.body).input;return {ok:true,json:async()=>({output_text:JSON.stringify({words:replies})})}}});
vm.runInContext(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''),ctx);
vm.runInContext(fs.readFileSync(new URL('../api/vocab.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace('export default ',''),ctx);
let response;
ctx.req={method:'POST',headers:{authorization:'Bearer test'},body:{band:3,count:12}};ctx.res={status(code){this.code=code;return this},json(data){response=data;return data}};
await vm.runInContext('handler(req,res)',ctx);
assert.equal(ctx.res.code,200);assert.deepEqual(Array.from(response.words,w=>w.w),['상징','시행착오']);assert.ok(prompt.includes('붙여 써서 합성어처럼 보이게 해도 금지'));
console.log('Descriptive targets verified: 1,511 audited phrases and joined spellings excluded; unseen phrases and adjective-noun compounds blocked in generation; core words, lexical compounds and independent idioms retained; all plan modes/review selection preserve old records.');
