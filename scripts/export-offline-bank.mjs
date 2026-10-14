import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {OFFLINE_ROWS} from '../lib/server/offline-bank-runtime.js';
import {OFFLINE_BANK_REVISION} from '../lib/server/offline-bank-supplement.js';

// Run: node scripts/export-offline-bank.mjs /safe/local/path/content.json
// This program only validates and writes a local file. It has no fetch, SQL
// connection, model client, API key, or authority to change learner records.
const destination=process.argv[2];
if(!destination||!destination.endsWith('.json'))throw Error('Supply an explicit .json output path');
const items=[];
for(const row of OFFLINE_ROWS){
 assert.ok(row.word&&row.definition&&Number.isInteger(row.band)&&row.band>=2&&row.band<=9);
 assert.equal(row.questions.length,10);
 for(const q of row.questions){
  assert.ok(Number.isInteger(q.slot)&&q.slot>=1&&q.slot<=10&&q.explanation.trim());
  if(q.type.startsWith('mc_')){assert.equal(q.options.length,5);assert.equal(q.options.filter(o=>o.correct===true).length,1);assert.equal(new Set(q.options.map(o=>o.text.trim())).size,5)}
  if(q.type==='mc_context'||q.type==='subjective_recall')assert.equal((q.context.match(/＿＿＿＿/g)||[]).length,1);
  if(q.type==='subjective_use'){assert.equal(q.context,'');assert.deepEqual(q.acceptedAnswers,[])}
  const {questions,...snapshot}=row;
  items.push({user_id:AUTHORED_OWNER,batch_key:OFFLINE_BANK_REVISION,word:row.word,band:row.band,slot:q.slot,task_type:q.type,status:'authored_draft',word_snapshot:snapshot,question:q});
 }
}
assert.equal(new Set(items.map(x=>x.word+'|'+x.slot)).size,items.length);
const body={revision:OFFLINE_BANK_REVISION,source:'ChatGPT offline editorial authoring',paidGenerationCalls:0,independentHumanReview:false,wordCount:OFFLINE_ROWS.length,questionCount:items.length,items};
const payload=JSON.stringify(body,null,2)+'\n';
fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});
fs.writeFileSync(destination,payload,{flag:'wx',mode:0o600});
console.log(JSON.stringify({file:path.resolve(destination),words:OFFLINE_ROWS.length,questions:items.length,sha256:createHash('sha256').update(payload).digest('hex'),paidGenerationCalls:0}));
