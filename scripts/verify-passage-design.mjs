import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {generationItems} from '../lib/prepared-plan.js';
const backend=vm.createContext({console,process,Map,Set,AbortSignal});
const api=fs.readFileSync(new URL('../api/questions.js',import.meta.url),'utf8')
 .replace(/^import[^\n]+\n/gm,'').replace('export async function buildValidated','async function buildValidated')
 .replace('export default async function handler','async function handler');
vm.runInContext(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''),backend);vm.runInContext(api,backend);

const run=code=>vm.runInContext(code,backend);
assert.ok(run('passageProfile({readerLevel:2,band:9}).maxCharacters')<run('passageProfile({readerLevel:6,band:1}).maxCharacters'),'passage difficulty follows learner vocabulary level, not target word or school grade');
assert.equal(run('passageProfile({readerLevel:2,supportLevel:3}).scaffoldedLevel'),1);
assert.equal(run('passageProfile({readerLevel:2}).unfamiliarTerms'),1);
assert.equal(run('knowledgeSeed({word:"업적",id:"history"}).id'),'sejong');
assert.equal(run('knowledgeSeed({word:"위성",id:"space"}).id'),'moon');
assert.equal(run('knowledgeSeed({word:"공전",id:"earth"}).id'),'earth-orbit');
assert.equal(run('knowledgeSeed({word:"소인수분해",domain:"수학·논리"})'),null,'unrelated astronomy facts must not be forced into mathematics');
assert.ok(run('KNOWLEDGE_SEEDS.every(x=>x.facts.length&&x.url.startsWith("https://"))'));
const topics=run('new Set(Array.from({length:20},(_,i)=>knowledgeSeed({id:String(i),word:"관찰"}).id)).size');assert.ok(topics>=7,'a lesson has a varied pool of informative subjects');
const target=generationItems([{id:'q',w:{w:'근거',d:'주장의 바탕',band:6,cat:'국어'},type:'mc_context'}],{difficulty:1.7,words:{}})[0];assert.equal(target.readerLevel,1.7);
run(`globalThis.item={id:'1',type:'subjective_context',word:'원인',definition:'일이 생긴 까닭',band:2,readerLevel:2,domain:'과학',answerSlot:0,supportLevel:0,successStreak:0,firstLearning:false};
 globalThis.sample={id:'1',type:'subjective_context',prompt:'빈칸에 알맞은 말을 쓰세요.',context:'지구가 스스로 돌면 태양 빛을 받는 곳이 달라져요. 지구의 회전은 낮과 밤이 바뀌는 ＿＿＿＿이에요.',showTarget:false,answerForm:'원인',partOfSpeech:'명사',options:[],acceptedAnswers:[{text:'원인',credit:1,rationale:'목표어'}],hints:['낮과 밤이 왜 바뀌는지 생각해요.','이 일이 생긴 까닭을 뜻해요.'],feedbackCorrect:'앞 문장에 낮과 밤이 바뀌는 까닭이 나와 있어요.',signature:'지구의 회전과 낮과 밤'};
 globalThis.flags={id:'1',valid:true,sufficientClues:true,oneClearAnswer:true,samePartOfSpeechChoices:true,naturalKorean:true,coherentSituation:true,ageAppropriate:true,factualAccuracy:true,readerLevelFit:true,noBackgroundBurden:true,vocabularyFocus:true,noAnswerLeak:true,naturalAlternativesConsidered:true,notTooSimilarToRecent:true,learningCardAccurate:true,issues:[],acceptedAnswers:sample.acceptedAnswers};
 ask=async(prompt,schema,name)=>name==='validated_vocab_questions'?{questions:[sample]}:{reviews:[flags]};`);
const accepted=await run('buildValidated([item],[])');assert.equal(accepted[0].validation.checks.factualAccuracy,true);assert.equal(accepted[0].validation.checks.readerLevelFit,true);
assert.equal(accepted[0].validation.policy,'vocabulary-context-12.5');assert.equal(accepted[0].validation.checks.vocabularyFocus,true);
run('flags.vocabularyFocus=false');let quiz=await run('buildValidated([item],[],{maxAttempts:1,partial:true})');assert.equal(quiz.length,0);assert.ok(quiz.failed[0].issues.includes('review_failed:vocabularyFocus'),'a factually correct knowledge quiz is still rejected');run('flags.vocabularyFocus=true');
assert.ok(run('deterministic({...sample,context:"민서: 4:6과 6:9가 같아. 도윤: 가운데 6은 4와 9의 ＿＿＿＿이라고 하지?"},item).includes("mathematical_name_quiz")'));
assert.ok(run('deterministic(sample,{...item,word:"등비중항",domain:"수학·논리"}).includes("specialist_or_context_only_target")'));
run('flags.factualAccuracy=false');let rejected=await run('buildValidated([item],[],{maxAttempts:1,partial:true})');assert.equal(rejected.length,0);assert.ok(rejected.failed[0].issues.includes('review_failed:factualAccuracy'),'false historical/science facts cannot pass independent review');
run('flags.factualAccuracy=true;flags.readerLevelFit=false');rejected=await run('buildValidated([item],[],{maxAttempts:1,partial:true})');assert.equal(rejected.length,0);assert.ok(rejected.failed[0].issues.includes('review_failed:readerLevelFit'));
run('sample.context="가".repeat(221)');assert.ok(run('deterministic(sample,item).includes("passage_too_long_for_reader")'));
const prompt=run('generationPrompt([item],[])');assert.ok(prompt.includes('학년이 아니라'));assert.ok(prompt.includes('knowledgeSeed'));assert.ok(prompt.includes('이름만 바꾸면 안'));
assert.ok(prompt.includes('전문 개념이나 사실의 명칭 회상'));assert.ok(prompt.includes('어휘의 추상성'));
console.log('Passages verified: factual anchor sources, diverse topics, learner ability passed from preparation, scaffolded text complexity, hard length limit, fact and level-fit review gates, and generation instructions for meaningful knowledge and fresh review contexts.');

assert.ok(run('deterministic({...sample,type:"mc_usage",showTarget:true,context:"",options:[{text:"새 상황의 원인을 찾았다",correct:true}]},{...item,type:"mc_usage"}).includes("usage_choice_repeats_target")'));
