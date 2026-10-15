import assert from 'node:assert/strict';
import {createCheckpointStore} from './runtime/checkpoint-store.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
function databaseFixture(){
 const rows=new Map(),transactions=[];let automatic=false;
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(names,mode){
  const puts=[];let stopped=false;
  const tx={error:null,objectStore(){return {
   put(row){puts.push(structuredClone(row));return {}},
   get(key){const request={};queueMicrotask(()=>{request.result=rows.get(key);request.onsuccess?.()});return request}
  }},abort(){stopped=true;tx.error=Error('aborted');tx.onabort?.()},complete(){if(stopped)return;for(const row of puts)rows.set(row.key,row);tx.oncomplete?.()}};
  transactions.push(tx);if(automatic||mode==='readonly')setTimeout(()=>tx.complete(),0);return tx;
 }};
 return {rows,transactions,set automatic(value){automatic=value},idb:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request}}};
}
const fixture=databaseFixture(),old=new Map(),statuses=[];
const legacy={getItem:k=>old.get(k)||null,setItem(){throw Object.assign(Error('full'),{name:'QuotaExceededError'})},removeItem:k=>old.delete(k)};
const store=createCheckpointStore({idb:fixture.idb,legacy,onState:e=>statuses.push(e.status)});
const prior={savedAt:1,draft:'원래 답안'};old.set('lesson',JSON.stringify(prior));
let acknowledged=false;
const write=store.set('lesson',prior).then(ok=>{acknowledged=ok;return ok});
await tick();assert.equal(acknowledged,false);assert.ok(old.has('lesson'),'retain legacy until transaction completion');
fixture.transactions[0].complete();assert.equal(await write,true);assert.equal(old.has('lesson'),false);
fixture.automatic=true;
const large={savedAt:2,draft:'미제출 답안',padding:'가'.repeat(6000000),daySwitchSequence:7};
assert.equal(await store.set('lesson',large),true);
await Promise.all([store.set('order',{savedAt:3,value:'first'}),store.set('order',{savedAt:4,value:'latest'})]);await store.flush();
assert.equal(JSON.parse(fixture.rows.get('order').text).value,'latest');
store.close();const restart=createCheckpointStore({idb:fixture.idb,legacy});await restart.hydrate(['lesson','order','other-account']);
assert.equal(restart.get('lesson').draft,'미제출 답안');assert.equal(restart.get('lesson').padding.length,6000000);assert.equal(restart.get('lesson').daySwitchSequence,7);assert.equal(restart.get('other-account'),null);await restart.flush();
const preserved=new Map([['blocked',JSON.stringify(prior)]]);
const fail=createCheckpointStore({idb:{open(){throw Error('IDB unavailable')}},legacy:{...legacy,getItem:k=>preserved.get(k)||null,removeItem:k=>preserved.delete(k)}});
assert.equal(await fail.set('blocked',{savedAt:5,draft:'new'}),false);assert.ok(preserved.has('blocked'));assert.equal(fail.get('blocked').draft,'new');
// A read failure on restart must not replace unread unsent work with an older cloud snapshot.
let reloadWrites=0;
const unreadDb={objectStoreNames:{contains:()=>true},close(){},transaction(names,mode){
 if(mode==='readwrite'){reloadWrites++;throw Error('Unexpected overwrite of unread backup')}
 const tx={error:Error('Read unavailable'),objectStore(){return {get(){return {}}}},abort(){}};
 queueMicrotask(()=>tx.onerror?.());return tx;
}};
const unread=createCheckpointStore({idb:{open(){const req={result:unreadDb};queueMicrotask(()=>req.onsuccess?.());return req}},legacy});
await unread.hydrate(['unread-account']);
assert.equal(await unread.set('unread-account',{savedAt:1,draft:'older remote state'}),false);
assert.equal(reloadWrites,0,'never overwrite an unread device backup');
console.log('Device store PASS: transaction acknowledgement (not request completion), copy-before-delete migration, 6M-character mock checkpoint, latest-write ordering, restart, account key isolation and failure backup retention.');
