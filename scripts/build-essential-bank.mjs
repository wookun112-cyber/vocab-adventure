import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {seeds} from '../database/essential-vocabulary-seeds.js';
import {sentenceWritingTask} from '../lib/learning-model.js';
const audit=JSON.parse(fs.readFileSync(new URL('../database/essential-vocabulary-20261012.json',import.meta.url),'utf8'));
const decision=new Map(audit.entries.map(r=>[r.word,r]));
const aliases={특성:['특징','성질'],형태:['모양'],기능:['역할','구실'],한계:['한도'],긍지:['자부심'],염려:['걱정','우려'],우려:['걱정','염려'],기원:['유래','근원'],신빙성:['신뢰성'],소신:['신념'],손실:['손해'],조화:['어울림'],비교:['견주기'],이유:['까닭'],순서:['차례'],내용:['내용물']};
// '내용물' does not naturally replace the linguistic sense used here.
delete aliases.내용;
const derivable=new Set(['적용','활용','탐구','답변','파악','제시','공존','조율','성찰','기만','도모','촉구','고찰','집약','조합','합성','발생','비교','관찰','경험','예상']);
const lastBatchim=t=>(t.codePointAt(t.length-1)-44032)%28;
function context(text,hidden){
  return text.replace(/\{([^{}]+)\}(?:\(([^()]*)\))?/gu,(_all,form,suffix)=>{
    let ending=suffix||'';
    const pair={'은/는':['은','는'],'이/가':['이','가'],'을/를':['을','를'],'와/과':['과','와']};
    if(ending in pair)ending=hidden?'('+ending+')':pair[ending][lastBatchim(form)?0:1];
    else if(ending==='으')ending=hidden?'(으)':lastBatchim(form)&&lastBatchim(form)!==8?'으':'';
    else if(['이었다','였다'].includes(ending))ending=hidden?'(이)었다':lastBatchim(form)?'이었다':'였다';
    else if(['때문에','덕분에'].includes(ending))ending=' '+ending;
    return (hidden?'＿＿＿＿':form)+ending;
  });
}
const review={status:'authored_draft',author:'essential-audit-20261012',independentlyVerified:false,deterministicStructureChecked:true,automaticallyPublish:false};
const rows=seeds.map(seed=>{
  const d=decision.get(seed.word);assert.ok(d,seed.word);
  assert.equal(seed.contexts.length,9);assert.equal(seed.choices.length,5);assert.equal(seed.nearby.length,4);
  assert.equal(new Set([seed.word,...seed.nearby]).size,5);
  assert.equal(new Set(seed.choices).size,5);
  for(const t of seed.choices)assert.ok(t.replace(/[\s\p{P}\p{S}]/gu,'').length<12,`${seed.word}: long semantic label ${t}`);
  const row={word:seed.word,definition:d.definition,band:seed.band,domain:seed.domain,example:context(seed.contexts[3],false),
    confusion:seed.nearby[0],contrast:`${seed.word}: ${seed.choices[0]}. ${seed.nearby[0]}: ${seed.choices[1]}.`,
    grade_basis:'nikl_reference_plus_editorial_estimate_20261012',revision:audit.revision,acceptedAlternatives:aliases[seed.word]||[],
    referenceGrade:d.referenceGrade,referenceHomonym:d.referenceHomonym,questions:[]};
  const forms=[...new Set(seed.contexts.flatMap(t=>[...t.matchAll(/\{([^{}]+)\}/gu)].map(m=>m[1])))];
  const verbal=/하다$/.test(seed.word),accepted=[...new Set([seed.word,...(verbal?forms:[]),...(aliases[seed.word]||[])])];
  for(let slot=1;slot<=10;slot++){
    const type=slot<=3?'mc_context':slot<=6?'mc_usage':slot<=9?'subjective_recall':'subjective_use';
    const q={slot,type,word:seed.word,band:seed.band,showTarget:slot>=4&&slot<=6||slot===10,options:[],review:{...review},doesNotCompleteWord:slot!==10};
    if(slot<=3){
      q.context=context(seed.contexts[slot-1],true);
      q.prompt=verbal?'빈칸에 들어갈 말의 기본형을 고르세요.':'지문의 빈칸에 가장 알맞은 어휘를 고르세요.';
      q.options=[seed.word,...seed.nearby].map((text,i)=>({text,correct:i===0}));
      q.explanation=`정답은 ‘${seed.word}’입니다. ${row.definition} 빈칸에 넣으면: ${context(seed.contexts[slot-1],false)}`;
    }else if(slot<=6){
      q.context=context(seed.contexts[slot-1],false);
      q.prompt=`이 글에서 ‘${seed.word}’의 쓰임에 맞는 설명을 고르세요.`;
      q.options=seed.choices.map((text,i)=>({text,correct:i===0}));
      q.explanation=`‘${seed.word}’은 여기서 ‘${seed.choices[0]}’의 뜻으로 쓰였습니다. ${row.definition}`;
    }else if(slot<=9){
      q.context=context(seed.contexts[slot-1],true);
      q.prompt=`${row.definition} 뜻과 예문을 보고 빈칸에 들어갈 어휘를 쓰세요.${verbal?' 기본형도 인정합니다.':''}`;
      q.answer=seed.word;q.acceptedAnswers=accepted;q.allowNaturalInflections=verbal;
      q.minorSpacingAndSpellingErrors='meaning_preserving_only';
      q.explanation=`목표 어휘는 ‘${seed.word}’입니다. ${context(seed.contexts[slot-1],false)} ${row.definition}`;
    }else{
      q.context='';q.prompt=sentenceWritingTask(seed.word).prompt;q.acceptedAnswers=[];q.examples=[];
      q.grading={targetMeaning:row.definition,semanticGraderRequired:true,targetPresenceAloneIsInsufficient:true,
        fullCreditRequires:['목표 어휘 또는 허용된 자연스러운 활용형을 쓴다.','문장 전체에서 목표 뜻과 쓰임이 정확하게 드러난다.','어휘 나열이나 질문 복사만으로 완료하지 않는다.'],
        allowMinorSpellingErrors:true,allowNaturalDerivations:derivable.has(seed.word)?[seed.word+'하다']:[]};
      q.explanation='단어의 뜻이 문장 전체에서 정확하게 드러나는지 확인해요.';
    }
    if([1,2,3,7,8,9].includes(slot))assert.equal((q.context.match(/＿＿＿＿/gu)||[]).length,1,seed.word+': blank count');
    row.questions.push(q);
  }
  return row;
});
assert.equal(rows.length,83);assert.equal(new Set(rows.map(r=>r.word)).size,83);
assert.equal(rows.reduce((n,r)=>n+r.questions.length,0),830);
assert.ok(rows.every(r=>r.band>=2&&r.band<=9));
fs.mkdirSync(new URL('../lib/server/',import.meta.url),{recursive:true});
const archive=gzipSync(Buffer.from(JSON.stringify(rows)),{level:9}).toString('base64');
fs.writeFileSync(new URL('../lib/server/essential-bank-data.js',import.meta.url),`// Compiled from authored essential-vocabulary seeds; server-only.\nexport const essentialArchive=${JSON.stringify(archive)};\n`);
const extended={...audit,entries:rows.map(r=>({...decision.get(r.word),band:r.band,domain:r.domain,example:r.example,confusion:r.confusion,contrast:r.contrast}))};
fs.writeFileSync(new URL('../database/essential-vocabulary-20261012.json',import.meta.url),JSON.stringify(extended,null,2)+'\n');
const modelPath=new URL('../lib/learning-model.js',import.meta.url),model=fs.readFileSync(modelPath,'utf8');
const start='// BEGIN essential-vocabulary-20261012',end='// END essential-vocabulary-20261012';
const first=model.indexOf(start),last=model.indexOf(end);assert.ok(first>=0&&last>first);
const metadata=Object.fromEntries(rows.map(r=>[r.word,{d:r.definition,band:r.band,cat:r.domain}]));
fs.writeFileSync(modelPath,model.slice(0,first)+start+'\nexport const ESSENTIAL_VOCABULARY='+JSON.stringify(metadata)+';\n'+model.slice(last));
console.log(`Essential bank compiled: ${rows.length} words, 830 fixed questions, 3 recall examples and example-free productive use per word.`);
