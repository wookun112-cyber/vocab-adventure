import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {structureIssues} from '../lib/server/editorial-validation.js';
import {sentenceWritingTask} from '../lib/learning-model.js';
export const revision='vocab-bank-20261013-level4-v1';
const shortLabels=JSON.parse(fs.readFileSync(new URL('../database/level-four-short-labels.json',import.meta.url),'utf8'));
const lastBatchim=t=>(t.codePointAt(t.length-1)-44032)%28;
export function renderContext(text,hidden){
 text=text.replace(/\}\(이\)(라고|라는|라며|라서|다|었다)/g,'}(이$1)').replace(/\}\(이\/가\)(라고|라는|라며|라서|다)/g,'}(이$1)');
 const pairs={'은(는)':'은/는','는(은)':'은/는','이(가)':'이/가','가(이)':'이/가','을(를)':'을/를','를(을)':'을/를','과(와)':'와/과','와(과)':'와/과'};
 text=text.replace(/\{([^{}]+)\}(은\(는\)|는\(은\)|이\(가\)|가\(이\)|을\(를\)|를\(을\)|과\(와\)|와\(과\))/g,(_,form,pair)=>'{'+form+'}('+pairs[pair]+')');
 text=text.replace(/\{([^{}]+)\}(으로|로|은|는|이|가|을|를|과|와)(?=[\s.,!?。！？]|$)/g,(_,form,particle)=>'{'+form+'}('+(particle==='으로'||particle==='로'?'으':particle)+')'+(particle==='으로'||particle==='로'?'로':''));
 return text.replace(/\{([^{}]+)\}(?:\(([^()]*)\))?/gu,(_all,form,suffix)=>{
  let ending=suffix||'';
  const single={'은':'은/는','는':'은/는','이':'이/가','가':'이/가','을':'을/를','를':'을/를','과':'와/과','와':'와/과'};
  if(single[ending])ending=single[ending];
  const pair={'은/는':['은','는'],'이/가':['이','가'],'을/를':['을','를'],'와/과':['과','와']};
  if(['이라고','이라는','이라며','이라서','이다'].includes(ending))ending=hidden?'(이)'+ending.slice(1):lastBatchim(form)?ending:ending.slice(1);
  else if(ending==='이었다')ending=hidden?'(이었/였)다':lastBatchim(form)?'이었다':'였다';
  else if(ending in pair)ending=hidden?'('+ending+')':pair[ending][lastBatchim(form)?0:1];
  else if(ending==='으')ending=hidden?'(으)':lastBatchim(form)&&lastBatchim(form)!==8?'으':'';
  else if(['로','으로'].includes(ending))ending=hidden?'(으)로':lastBatchim(form)&&lastBatchim(form)!==8?'으로':'로';
  return(hidden?'＿＿＿＿':form)+ending;
 });
}
export function compileLevelFour(jobs){
 assert.equal(new Set(jobs.map(j=>j.word)).size,jobs.length);
 return jobs.map(({word,word_data:d,seed})=>{
  assert.deepEqual(structureIssues(seed,word),[],word+' editorial structure');
  seed=structuredClone(seed);
  seed.choices=seed.choices.map(s=>shortLabels[s]||s);
  if(!word.endsWith('다'))seed.contexts=seed.contexts.map(c=>c.replace(/\{([^{}]+)\}/g,(full,form)=>form.startsWith(word)?'{'+word+'}'+form.slice(word.length):full));
  assert.equal(d.band,4);assert.equal(d.word,word);assert.equal(seed.contexts.length,9);
  assert.equal(seed.nearby.length,4);assert.equal(seed.choices.length,5);
  assert.equal(new Set([word,...seed.nearby]).size,5);assert.equal(new Set(seed.choices).size,5);
  assert.equal(new Set(seed.contexts.map(s=>s.replace(/[\s\p{P}\p{S}]/gu,''))).size,9,word+' duplicate context');
  for(const c of seed.contexts){assert.equal((c.match(/\{[^{}]+\}/g)||[]).length,1,word+' target marker');assert.ok(!/(?:뜻|정의|문장|보기|예문)\s*[:：]|빈칸|알맞은 말을|밑줄 친 말|\{[_＿\s]+\}/.test(c),word+' embedded instruction');}
  const review={status:'authored_draft',author:'level-four-editorial-20261013',independentlyVerified:false,aiEditorialReviewComplete:true,deterministicStructureChecked:true,automaticallyPublish:false};
  const row={...d,revision,example:renderContext(seed.contexts[3],false),confusion:seed.nearby[0],contrast:`${word}: ${seed.choices[0]}. ${seed.nearby[0]}: ${seed.choices[1]}.`,acceptedAlternatives:seed.acceptedAlternatives||[],questions:[]};
  const forms=[...new Set(seed.contexts.map(t=>t.match(/\{([^{}]+)\}/u)[1]))],verbal=/다$/.test(word);
  const accepted=[...new Set([word,...(verbal?forms:[]),...(seed.acceptedAlternatives||[])])];
  for(let slot=1;slot<=10;slot++){
   const type=slot<=3?'mc_context':slot<=6?'mc_usage':slot<=9?'subjective_recall':'subjective_use';
   const q={slot,type,word,band:4,showTarget:slot>=4&&slot<=6||slot===10,options:[],review:{...review},doesNotCompleteWord:slot!==10};
   if(slot<=3){
    q.context=renderContext(seed.contexts[slot-1],true);q.prompt=verbal?'빈칸에 들어갈 말의 기본형을 고르세요.':'지문의 빈칸에 가장 알맞은 어휘를 고르세요.';
    q.options=[word,...seed.nearby].map((text,i)=>({text,correct:i===0}));
    q.explanation=`정답은 ‘${word}’입니다. ${d.definition} ${renderContext(seed.contexts[slot-1],false)}`;
   }else if(slot<=6){
    q.context=renderContext(seed.contexts[slot-1],false);q.prompt=`이 글에서 ‘${word}’의 쓰임에 맞는 설명을 고르세요.`;
    q.options=seed.choices.map((text,i)=>({text,correct:i===0}));q.explanation=`‘${word}’은 여기서 ‘${seed.choices[0]}’의 뜻으로 쓰였습니다. ${d.definition}`;
   }else if(slot<=9){
    q.context=renderContext(seed.contexts[slot-1],true);q.prompt=`${d.definition} 뜻과 예문을 보고 빈칸에 들어갈 어휘를 쓰세요.${verbal?' 기본형도 인정합니다.':''}`;
    q.answer=word;q.acceptedAnswers=accepted;q.allowNaturalInflections=verbal;q.minorSpacingAndSpellingErrors='meaning_preserving_only';
    q.explanation=`목표 어휘는 ‘${word}’입니다. ${renderContext(seed.contexts[slot-1],false)} ${d.definition}`;
   }else{
    q.context='';q.prompt=sentenceWritingTask(word).prompt;q.acceptedAnswers=[];q.examples=[];
    q.grading={targetMeaning:d.definition,semanticGraderRequired:true,targetPresenceAloneIsInsufficient:true,fullCreditRequires:['목표 어휘 또는 자연스러운 활용형을 쓴다.','문장 전체에서 목표 뜻과 쓰임이 정확하게 드러난다.','어휘 나열이나 질문 복사만으로 완료하지 않는다.'],allowMinorSpellingErrors:true,allowNaturalDerivations:seed.allowNaturalDerivations||[]};
    q.explanation='단어의 뜻이 문장 전체에서 정확하게 드러나는지 확인해요.';
   }
   row.questions.push(q);
  }
  return row;
 });
}
if(process.argv[1]?.endsWith('build-level-four-bank.mjs')){
 const input=process.argv[2]||new URL('../database/level-four-seeds.json',import.meta.url);
 const jobs=JSON.parse(fs.readFileSync(input,'utf8'));assert.equal(jobs.length,249,'Every missing stage-four word must be complete');
 const rows=compileLevelFour(jobs),archive=gzipSync(Buffer.from(JSON.stringify(rows)),{level:9}).toString('base64');
 fs.writeFileSync(new URL('../lib/server/level-four-bank-data.js',import.meta.url),`// Reviewed editorial source, compiled once for server-only delivery.\nexport const levelFourArchive=${JSON.stringify(archive)};\n`);
 fs.writeFileSync('/tmp/level-four-compiled.json',JSON.stringify(rows));
 console.log(JSON.stringify({words:rows.length,questions:rows.length*10,revision}));
}
