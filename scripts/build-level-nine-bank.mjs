import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {renderContext} from './build-level-five-six-bank.mjs';
import {sentenceWritingTask,isLearningTarget} from '../lib/learning-model.js';
export const revision='vocab-bank-20261014-level9-v1';
const seeds=JSON.parse(fs.readFileSync(new URL('../database/level-nine-seeds.json',import.meta.url)));
const curriculum=JSON.parse(fs.readFileSync(new URL('../database/level-nine-curriculum.json',import.meta.url)));
assert.equal(seeds.length,27);assert.equal(new Set(seeds.map(s=>s.word)).size,27);
export const rows=seeds.map(seed=>{
 const {word,distractors,labels,sentences}=seed,d=curriculum.find(w=>w.word===word);assert.ok(d&&isLearningTarget(word,d.domain,9));
 assert.equal(sentences.length,9);assert.equal(new Set(sentences).size,9);assert.equal(new Set([word,...distractors]).size,5);assert.equal(new Set(labels).size,5);
 for(const s of sentences){assert.equal((s.match(/\{[^{}]+\}/g)||[]).length,1,word);assert.ok(s.includes('{'+word+'}'));}
 const row={...d,revision,example:renderContext(sentences[3],false),questions:[]};
 for(let slot=1;slot<=10;slot++){
  const type=slot<=3?'mc_context':slot<=6?'mc_usage':slot<=9?'subjective_recall':'subjective_use';
  const q={word,band:9,slot,type,showTarget:slot>=4&&slot<=6||slot===10,options:[],doesNotCompleteWord:slot!==10,review:{status:'authored_draft',author:'editorial-20261014',independentlyVerified:false,deterministicStructureChecked:true}};
  if(slot<=3){q.prompt='지문의 빈칸에 가장 알맞은 어휘를 고르세요.';q.context=renderContext(sentences[slot-1],true);q.options=[word,...distractors].map((text,i)=>({text,correct:i===0}));}
  else if(slot<=6){q.prompt='이 글에서 ‘'+word+'’의 쓰임에 맞는 설명을 고르세요.';q.context=renderContext(sentences[slot-1],false);q.options=labels.map((text,i)=>({text,correct:i===0}));}
  else if(slot<=9){q.prompt=d.definition+' 뜻과 예문을 보고 빈칸에 들어갈 어휘를 쓰세요.';q.context=renderContext(sentences[slot-1],true);q.answer=word;q.acceptedAnswers=[word];}
  else{q.prompt=sentenceWritingTask(word).prompt;q.context='';q.acceptedAnswers=[];q.examples=[];q.grading={semanticGraderRequired:true,targetMeaning:d.definition,allowNaturalDerivations:[],targetPresenceAloneIsInsufficient:true};}
  q.explanation=slot===10?'목표 어휘를 자기 문장에서 정확하게 사용했는지 확인해요.':slot<=3||slot>=7?'정답은 ‘'+word+'’입니다. '+d.definition+' '+renderContext(sentences[slot-1],false):'여기서는 “'+labels[0]+'”의 뜻으로 쓰였어요. '+d.definition;
  assert.ok(!/[{}]/.test(q.context));row.questions.push(q);
 }
 return row;
});
const archive=gzipSync(JSON.stringify(rows)).toString('base64');
fs.writeFileSync(new URL('../lib/server/level-nine-bank-data.js',import.meta.url),'// Server-only reviewed source; never included in public assets.\nexport const levelNineArchive='+JSON.stringify(archive)+';\n');
console.log('Stage nine compiled: '+rows.length+' words / '+rows.length*10+' questions.');
const owner='06c78577-b96e-4919-b979-58683ff5946e';
const sql=`begin;\ninsert into vocab_private.bank_authoring_batches(user_id,batch_key,specification) values('${owner}','${revision}','{"words":27,"questionsPerWord":10,"recall":3,"ownSentence":1,"source":"editorial-20261014"}'::jsonb) on conflict(user_id,batch_key) do nothing;\nwith rows as(select value row from jsonb_array_elements($nine$${JSON.stringify(rows)}$nine$::jsonb))\ninsert into vocab_private.bank_authoring_items(user_id,batch_key,word,band,slot,task_type,status,word_snapshot,question)\nselect '${owner}','${revision}',row->>'word',9,(q->>'slot')::smallint,q->>'type','authored_draft',row-'questions',q from rows cross join lateral jsonb_array_elements(row->'questions') q\non conflict(user_id,batch_key,word,slot) do update set word_snapshot=excluded.word_snapshot,question=excluded.question,updated_at=now();\ncommit;\n`;
fs.writeFileSync(new URL('../database/level-nine-bank.sql',import.meta.url),sql);
