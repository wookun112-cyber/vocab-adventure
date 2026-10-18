import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as studyHistory from '../lib/study-history.js';
import {DELIVERY_POLICY,localPracticeQuestion} from '../lib/local-delivery.js';
import {sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
import * as authoredPolicy from '../lib/authored-policy.js';
import {DAILY_POLICY,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {
 SINO_KOREAN_MEANING_POLICY,SINO_KOREAN_MEANINGS,sinoKoreanMeaning,sinoKoreanConnection
} from '../lib/learning-model.js';

assert.equal(SINO_KOREAN_MEANING_POLICY,'verified-whole-word-roots-20261018-v1');
assert.ok(Object.keys(SINO_KOREAN_MEANINGS).length>=260,'enough curated teaching data for the initial learning module');
for(const [word,data] of Object.entries(SINO_KOREAN_MEANINGS)){
 assert.equal(data.word,word);
 assert.equal(data.parts.length,[...word].length,word+' has exactly one meaning for each Hangul syllable');
 assert.ok(data.meaning.trim().length>=2,'concise words such as 사람 also have valid natural explanations');
 for(const [i,part] of data.parts.entries()){
  assert.equal(part.sound,[...word][i]);
  assert.ok(part.meaning.trim(),word+' has a clear meaning for '+part.sound);
  assert.match(part.root,/^[\u3400-\u9fff]$/u,'root identity is curated internally rather than guessed from spelling');
 }
 const link=sinoKoreanConnection(word);
 if(link){
  const other=sinoKoreanMeaning(link.word);
  assert.ok(other&&other!==data);
  assert.ok(data.parts.some(part=>part.sound===link.sound&&part.meaning===link.meaning&&other.parts.some(another=>another.root===part.root&&another.sound===part.sound&&another.meaning===part.meaning)),word+' shares exactly the same etymology and gloss with '+link.word);
 }
}
assert.deepEqual(sinoKoreanMeaning('후방').parts.map(x=>[x.sound,x.meaning]),[['후','뒤'],['방','방향']]);
assert.equal(sinoKoreanConnection('후방').word,'후반','a new word reuses the verified meaning of 후');
assert.equal(sinoKoreanMeaning('예측').parts[0].meaning,'미리');
assert.equal(sinoKoreanMeaning('예시').parts[0].meaning,'보기');
assert.notEqual(sinoKoreanMeaning('예측').parts[0].root,sinoKoreanMeaning('예시').parts[0].root,'same pronunciation never guarantees the same meaning');
assert.equal(sinoKoreanConnection('예측').word,'예상');
assert.equal(sinoKoreanConnection('예시').word,'예문');
assert.notEqual(sinoKoreanMeaning('전방').parts[0].root,sinoKoreanMeaning('전환').parts[0].root);
assert.notEqual(sinoKoreanMeaning('전방').parts[0].root,sinoKoreanMeaning('전쟁').parts[0].root);
assert.equal(sinoKoreanMeaning('기원'),null,'ambiguous word without contextual sense is not guessed');
assert.equal(sinoKoreanMeaning('가정'),null,'homograph of home and assumption is not automatically split');
assert.equal(sinoKoreanMeaning('과일'),null,'native/unknown words never get fake Sino-Korean roots');
assert.equal(sinoKoreanMeaning('객관적'),null,'unreviewed derivatives are not split heuristically');
assert.equal(sinoKoreanMeaning({w:'근거'}).parts.length,2);

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const id of ['introWordRoots','wordRootHint','wordRootFeedback'])assert.match(html,new RegExp('id="'+id+'"'),'the card must have a visible presentation slot');
const css=fs.readFileSync(new URL('../app.css',import.meta.url),'utf8');
assert.match(css,/\.sino-roots/);
assert.match(css,/\.sino-roots\.hidden/);

// Use the same end-to-end fake cloud and validated question flow as lesson
// recovery. Never call an actual paid grading provider or mutate live accounts.
const effectiveSource=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
new vm.Script(effectiveSource.replace(/^import[^\n]+\n/gm,''));
const fixtureUrl=new URL('./verify-lesson-resume.mjs',import.meta.url);
let harness=fs.readFileSync(fixtureUrl,'utf8').split('\nconst f=fixture();')[0]
 .replace(/^import[^\n]+\n/gm,'').replaceAll('import.meta.url','fixtureUrl');
const marker=harness.indexOf('const source='),end=harness.indexOf('\n',marker);
assert.ok(marker>=0&&end>marker);
harness=harness.slice(0,marker)+"const source=effectiveSource.replace(/^import[^\\n]+\\n/gm,'').split(\"window.addEventListener('beforeinstallprompt'\")[0];"+harness.slice(end);
const fixture=new Function('effectiveSource','fs','vm','URL','fixtureUrl','studyHistory','DELIVERY_POLICY','localPracticeQuestion','sentenceUseQuestionValid','authoredPolicy','DAILY_POLICY','MINIMUM_STUDY_POLICY',harness+';return fixture;')(
 effectiveSource,fs,vm,URL,fixtureUrl,studyHistory,DELIVERY_POLICY,localPracticeQuestion,sentenceUseQuestionValid,authoredPolicy,DAILY_POLICY,MINIMUM_STUDY_POLICY
);
const f=fixture();
await f.run('buildSession()');
const startWord=f.run('session.queue[0].w.w');
assert.ok(sinoKoreanMeaning(startWord),'fixture starts with a supported reading target');
assert.equal(f.node('wordRootHint').classList.contains('hidden'),true,'meaning must be hidden during first independent assessment');
assert.equal(f.node('wordRootFeedback').classList.contains('hidden'),true);
const before=f.run('JSON.stringify(child().words)');
f.run("renderSinoMeaning('introWordRoots','후방')");
assert.equal(f.node('introWordRoots').classList.contains('hidden'),false);
const intro=f.node('introWordRoots').innerHTML;
for(const syllable of ['후','방','뒤','방향','후반'])assert.ok(intro.includes(syllable),'correct child-friendly introduction contains '+syllable);
assert.equal(/[\u3400-\u9fff]/u.test(intro),false,'child-facing card must not show Hanzi to memorize');
assert.equal(f.run('JSON.stringify(child().words)'),before,'reading an optional clue must never record a successful answer');
const initialCalls=f.calls.generation;
f.run('showHint()');
assert.equal(f.run('hintLevel'),1,'a root clue is delivered only with an explicitly requested hint');
assert.equal(f.node('wordRootHint').classList.contains('hidden'),false);
assert.ok(f.node('wordRootHint').innerHTML.includes('힌트'));
assert.equal(/[\u3400-\u9fff]/u.test(f.node('wordRootHint').innerHTML),false);
assert.equal(f.node('wordRootFeedback').classList.contains('hidden'),true);
f.run("applyResult(session.queue[current],'○','문맥에 맞게 쓰였어요.','',{credit:1,contextSuccess:true,hintUsed:true,revealed:false,independent:false})");
assert.equal(f.run('session.results.length'),1);
assert.equal(f.run('session.results[0].credit'),.75,'the existing hint penalty applies: roots cannot inflate a perfect independent answer');
assert.equal(f.run('session.results[0].hintUsed'),true);
assert.equal(f.node('wordRootFeedback').classList.contains('hidden'),false);
assert.equal(f.node('wordRootHint').classList.contains('hidden'),true);
assert.ok(f.node('wordRootFeedback').innerHTML.includes('뜻 조각'));
assert.equal(/[\u3400-\u9fff]/u.test(f.node('wordRootFeedback').innerHTML),false);
assert.equal(f.calls.generation,initialCalls,'showing an etymology never sends new AI model/question calls');
await f.run('nextQuestion()');
assert.equal(f.node('wordRootFeedback').classList.contains('hidden'),true,'the next independent question must start with hidden roots');
assert.equal(f.node('wordRootHint').classList.contains('hidden'),true);
f.run("renderSinoMeaning('wordRootFeedback','과일','feedback')");
assert.equal(f.node('wordRootFeedback').classList.contains('hidden'),true,'non Sino-Korean or unverified vocab remains untouched');
assert.equal(f.node('wordRootFeedback').innerHTML,'');
console.log('Sino-Korean meaning clues PASS: '+Object.keys(SINO_KOREAN_MEANINGS).length+' verified whole words, sound-alikes distinguished, no written Hanzi, intro/hint/feedback lifecycle, no guessing, scoring unchanged and zero extra model calls.');
