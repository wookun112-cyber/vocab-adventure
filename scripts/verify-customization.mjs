import * as authoredPolicy from '../lib/authored-policy.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').split("window.addEventListener('beforeinstallprompt'")[0];
const clone=x=>JSON.parse(JSON.stringify(x));
const local=new Map(),cloud=new Map();
function fixture(account='family'){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',value:'',style:{},classList:{toggle(){},add(){},remove(){}}});return nodes.get(id)};
 const ctx=vm.createContext({AbortSignal,AUTHORED_REVISION:authoredPolicy.AUTHORED_REVISION,authoredQuestionValid:authoredPolicy.authoredQuestionValid,console,Date,Math,Map,Set,Promise,setTimeout,clearTimeout,alert(){},window:{scrollTo(){}},document:{getElementById:node,querySelectorAll:()=>[]},localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v)},createClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:cloud.has(account)?{state:clone(cloud.get(account))}:null,error:null})})}),upsert:async row=>{cloud.set(row.user_id,clone(row.state));return {error:null}}})})});
 const run=code=>vm.runInContext(code,ctx);run(fs.readFileSync(new URL('../lib/learning-model.js',import.meta.url),'utf8').replace(/export /g,''));run(fs.readFileSync(new URL('../lib/daily-practice.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,''));run(source);run(`authUser={id:${JSON.stringify(account)}};loadedAccount=authUser.id;warmDailyQuestions=()=>{};`);return {run,node};
}

const f=fixture('wardrobe-family');
f.run("child().activeLesson={id:'paused',nextIndex:9};child().words['근거'].seen=7");
const learning=f.run('JSON.stringify(child().words)'),paused=f.run('JSON.stringify(child().activeLesson)');
assert.equal(f.run('customization(child()).balance'),60);
assert.equal(f.run('customization(child()).balance'),60,'welcome stars are granted once');
f.run("previewCosmetic('rose')");assert.equal(f.run('customization(child()).balance'),60,'preview never spends currency');
assert.ok(f.node('dressCaption').textContent.includes('미리보기'));
assert.equal(f.run("applyCosmetic('galaxy')"),false,'cannot buy an unaffordable item');
assert.equal(f.run('customization(child()).balance'),60);
assert.equal(f.run("applyCosmetic('rose')"),true);assert.equal(f.run('customization(child()).balance'),40);
assert.equal(f.run("applyCosmetic('rose')"),true);assert.equal(f.run('customization(child()).balance'),40,'owned items and double clicks never charge again');
assert.equal(f.run("applyCosmetic('garden')"),true);assert.equal(f.run('customization(child()).balance'),20);
assert.equal(f.run("customization(child()).equipped.outfit"),'rose');assert.equal(f.run("customization(child()).equipped.background"),'garden','different slots coexist');
f.run("resetCosmetic('outfit')");assert.equal(f.run('customization(child()).equipped.outfit'),undefined);
assert.ok(f.run("customization(child()).owned.includes('rose')"),'removal retains ownership');
f.run("applyCosmetic('rose');selectCharacter('rabbit')");
assert.equal(f.run('customization(child()).equipped.outfit'),'rose','cosmetics survive species changes');
assert.equal(f.run('JSON.stringify(child().words)'),learning);assert.equal(f.run('JSON.stringify(child().activeLesson)'),paused);
const rank=f.run('explorationRanking().find(x=>x.isMe).rank');f.run('customization(child()).balance=100000;renderExploration()');assert.equal(f.run('explorationRanking().find(x=>x.isMe).rank'),rank,'currency and cosmetics cannot increase league rank');
f.run('customization(child()).balance=20');
await f.run('cloudSave()');
const reopened=fixture('wardrobe-family');await reopened.run('cloudLoad()');
assert.equal(reopened.run('customization(child()).balance'),20);assert.equal(reopened.run('customization(child()).equipped.background'),'garden');
assert.equal(reopened.run('JSON.stringify(child().activeLesson)'),paused,'cloud reload retains the paused lesson');
assert.equal(JSON.parse(local.get('vocab-lesson-wardrobe-family-ayoung')).learner.customization.equipped.outfit,'rose','local recovery preserves cosmetics');
reopened.run("state.selected='inseong';renderExploration()");assert.equal(reopened.run('customization(child()).balance'),60,'wallets are separate for each child');
assert.equal(reopened.run('customization(child()).owned.length'),0);assert.equal(reopened.run('cosmeticPreview'),null);
assert.ok(reopened.node('rankFamilyOverview').innerHTML.includes('fill="#e3f6e8"'),'family ranking renders the other child’s equipped background');
const outsider=fixture('wardrobe-other');await outsider.run('cloudLoad()');assert.equal(outsider.run('customization(child()).balance'),60);assert.equal(outsider.run('customization(child()).owned.length'),0);
const rewards=fixture('stars-reward');
rewards.run("session={lessonId:'daily',account:'stars-reward',profile:'ayoung',mode:'daily',target:16,results:[]};globalThis.q={w:{w:'근거'},type:'mc_context',signature:'first'}");
assert.equal(rewards.run('rewardAnswer(q,false)'),5,'wrong or assisted activities still earn effort rewards');assert.equal(rewards.run('customization(child()).balance'),62);
assert.equal(rewards.run('rewardAnswer(q,true)'),0);assert.equal(rewards.run('customization(child()).balance'),62,'resuming an answered activity cannot grant more currency');
rewards.run("session.lessonId='second'");assert.equal(rewards.run('rewardAnswer(q,true)'),0,'same passage across lessons receives one reward');
rewards.run('session.results=Array(15).fill({credit:1})');assert.equal(rewards.run('rewardCompletion()'),0,'early finish has no completion bonus');
rewards.run('session.results=Array(16).fill({credit:1})');assert.equal(rewards.run('rewardCompletion()'),40,'the new sixteen-activity plan receives the completion reward');
assert.equal(rewards.run('customization(child()).balance'),82);assert.equal(rewards.run('rewardCompletion()'),0);
rewards.run("for(let i=1;i<35;i++){session.results=Array(i).fill({credit:1});q.signature='unique-'+i;rewardAnswer(q,true)}");
assert.equal(rewards.run('customization(child()).balance'),140,'currency is capped at thirty activities plus one daily bonus');
const before=rewards.run('customization(child()).balance');rewards.run("session.account='someone-else';q.signature='foreign'");assert.equal(rewards.run('rewardAnswer(q,true)'),0);assert.equal(rewards.run('customization(child()).balance'),before);
const visual=fixture();
for(const id of visual.run('CHARACTERS.map(x=>x.id)')){
 const bodies=Array.from({length:10},(_,i)=>visual.run(`characterSvg('${id}',${i+1})`).match(/<g class="evo-body">(.*?)<\/g>/s)[1].replace(/evo-\d+/g,'evo'));
 assert.equal(new Set(bodies).size,10,'all ten stages have genuinely different body geometry, independently of IDs or equipment');
}
console.log('Customization verified: separate wallets, one-time gift, preview without spending, sufficient funds, permanent ownership, free re-equipping, independent slots, cloud and local recovery, preserved paused lessons and learning records, account isolation, truthful family avatars, idempotent/capped activity rewards, sixteen-activity completion bonus, and ten different body geometries for twenty species.');
