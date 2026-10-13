import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {levelFiveSixArchive} from '../lib/server/level-five-six-bank-data.js';
import {authoredQuestion,authoredCurriculum} from '../api/authored-bank.js';
import {AUTHORED_OWNER,AUTHORED_REVISION} from '../lib/authored-policy.js';
import {passageKeys} from '../lib/prepared-plan.js';
import {renderContext} from './build-level-five-six-bank.mjs';
const rows=JSON.parse(gunzipSync(Buffer.from(levelFiveSixArchive,'base64')));
assert.equal(rows.length,612);assert.equal(rows.reduce((n,r)=>n+r.questions.length,0),6120);
assert.equal(authoredCurriculum(AUTHORED_OWNER).filter(r=>r.band===5).length,387);
assert.equal(authoredCurriculum(AUTHORED_OWNER).filter(r=>r.band===6).length,246);
assert.equal(rows.filter(r=>r.band===5).length,377);assert.equal(rows.filter(r=>r.band===6).length,235);
for(const row of rows){
 const used=[];
 for(const type of ['mc_context','mc_usage','subjective_recall','subjective_use'])for(let i=0;i<(type==='subjective_use'?1:3);i++){
  const q=authoredQuestion({id:row.word+':'+type+':'+i,word:row.word,type,readerLevel:row.band,review:true,answerSlot:i},AUTHORED_OWNER,used);
  assert.ok(q,row.word+' missing '+type+' '+i);assert.equal(q.authored.revision,AUTHORED_REVISION);
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
console.log('Stage-five/six: 612 new words, 6120 tasks, full 387/246 coverage, nine distinct passages and own-sentence completion verified.');
