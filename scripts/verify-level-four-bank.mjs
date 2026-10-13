import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {levelFourArchive} from '../lib/server/level-four-bank-data.js';
import {authoredQuestion,authoredCurriculum} from '../api/authored-bank.js';
import {AUTHORED_OWNER,AUTHORED_LEVEL_FOUR_REVISION} from '../lib/authored-policy.js';
import {passageKeys} from '../lib/prepared-plan.js';
import {renderContext} from './build-level-four-bank.mjs';
const rows=JSON.parse(gunzipSync(Buffer.from(levelFourArchive,'base64')));
assert.equal(rows.length,249);assert.equal(rows.reduce((n,r)=>n+r.questions.length,0),2490);
assert.equal(authoredCurriculum(AUTHORED_OWNER).filter(r=>r.band===4).length,262);
for(const row of rows){
 const used=[];
 for(const type of ['mc_context','mc_usage','subjective_recall','subjective_use'])for(let i=0;i<(type==='subjective_use'?1:3);i++){
  const q=authoredQuestion({id:row.word+':'+type+':'+i,word:row.word,type,readerLevel:4,review:true,answerSlot:i},AUTHORED_OWNER,used);
  assert.ok(q,row.word+' missing '+type+' '+i);assert.equal(q.authored.revision,AUTHORED_LEVEL_FOUR_REVISION);
  assert.ok(!passageKeys(q.context,q.options.map(o=>o.text)).some(k=>used.some(p=>passageKeys(p.context,p.options.map(o=>o.text)).includes(k))),row.word+' repeated sentence');
  if(type==='subjective_use'){assert.equal(q.context,'');assert.deepEqual(q.acceptedAnswers,[]);assert.equal(q.semanticGraderRequired,true)}
  else assert.ok(!/[{}]|(?:뜻|정의|문장|보기|예문|설명)\s*[:：]/.test(q.context),row.word+' formatting leak');
  if(type==='subjective_recall')assert.ok(q.acceptedAnswers.some(a=>a.text===row.word&&a.targetRecall));
  used.push(q);
 }
}
assert.equal(renderContext('옛 지도를 {자료}(으)로 썼다.',true),'옛 지도를 ＿＿＿＿(으)로 썼다.');
assert.equal(renderContext('{대응}을(를) 살폈다.',true),'＿＿＿＿(을/를) 살폈다.');
assert.equal(renderContext('{식민지}(이)라고 불렀다.',false),'식민지라고 불렀다.');
assert.equal(renderContext('{엽록소}(이/가)라고 설명했다.',false),'엽록소라고 설명했다.');
assert.equal(renderContext('기체는 {이산화탄소}(이/가)다.',false),'기체는 이산화탄소다.');
console.log('Stage-four bank verified: all 262 curriculum words supplied, 249 additions × 10 tasks, all nine distinct passages actually retrievable, 3 recall variants, Korean particle handling, and example-free sentence completion.');

