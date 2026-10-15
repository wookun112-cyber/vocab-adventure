// Self-contained factory: release build embeds this into the browser bundle.
export function createCheckpointStore({idb,legacy,onState=()=>{},timeoutMs=2500}={}){
 const memory=new Map(),pending=new Map(),confirmed=new Map(),waiters=new Map(),unreadKeys=new Set();
 let database=null,opening=null,flushing=null,serial=0;
 const notify=(key,status,error=null)=>{try{onState({key,status,error})}catch{}};
 const stamp=text=>{try{const x=JSON.parse(text);return Number(x.savedAt??x.state?.updatedAt)||0}catch{return -1}};
 function open(){
  if(database)return Promise.resolve(database);
  if(opening)return opening;
  if(!idb)return Promise.reject(Error('IndexedDB unavailable'));
  opening=new Promise((resolve,reject)=>{
   let done=false,request;
   const fail=error=>{if(done)return;done=true;clearTimeout(timer);reject(error||Error('Device database unavailable'))};
   const timer=setTimeout(()=>fail(Error('Device database opening timed out')),timeoutMs);
   try{
    request=idb.open('vocab-durable-learning',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots',{keyPath:'key'})};
    request.onerror=()=>fail(request.error);request.onblocked=()=>fail(Error('Device database upgrade blocked'));
    request.onsuccess=()=>{if(done){request.result.close();return}done=true;clearTimeout(timer);database=request.result;database.onversionchange=()=>{database.close();database=null};database.onclose=()=>{database=null};resolve(database)};
   }catch(error){fail(error)}
  }).finally(()=>{opening=null});
  return opening;
 }
 async function commit(rows){
  const db=await open();
  return new Promise((resolve,reject)=>{
   let tx,done=false;
   const fail=error=>{if(done)return;done=true;clearTimeout(timer);reject(error||Error('Device transaction failed'))};
   const timer=setTimeout(()=>{try{tx?.abort()}catch{}fail(Error('Device transaction timed out'))},timeoutMs);
   try{
    // Use strict durability where implemented; completion, not request success,
    // is the acknowledgement. Never clear old backups before this point.
    try{tx=db.transaction(['snapshots'],'readwrite',{durability:'strict'})}catch{tx=db.transaction(['snapshots'],'readwrite')}
    tx.onabort=()=>fail(tx.error);tx.onerror=()=>fail(tx.error);
    tx.oncomplete=()=>{if(done)return;done=true;clearTimeout(timer);resolve(true)};
    for(const row of rows)tx.objectStore('snapshots').put({key:row.key,text:row.text});
   }catch(error){try{tx?.abort()}catch{}fail(error)}
  });
 }
 function settle(row,ok){const list=waiters.get(row.key)||[];for(const w of list)if(w.id<=row.id)w.resolve(ok);const rest=list.filter(w=>w.id>row.id);if(rest.length)waiters.set(row.key,rest);else waiters.delete(row.key)}
 function fallback(row,error){
  try{legacy?.setItem(row.key,row.text);if(!legacy?.setItem)throw Error('No fallback storage');confirmed.set(row.key,row.id);notify(row.key,'legacy',null);settle(row,true);return true}
  catch(failure){notify(row.key,'failed',failure||error);settle(row,false);return false}
 }
 function flush(){
  if(flushing)return flushing;
  // Assignment precedes work, including an empty batch.
  flushing=Promise.resolve().then(async()=>{
   let all=true;
   while(pending.size){
    const batch=[...pending.values()];pending.clear();
    try{
     await commit(batch);
     for(const row of batch){
      confirmed.set(row.key,row.id);if(memory.get(row.key)?.id===row.id)notify(row.key,'durable');settle(row,true);
      // Remove only an older copy of THIS application record. A different
      // newer-tab value is retained; no other site keys are touched.
      try{const old=legacy?.getItem(row.key);if(old===row.text)legacy.removeItem(row.key)}catch{}
     }
    }catch(error){for(const row of batch)if(!fallback(row,error))all=false}
   }
   return all;
  }).finally(()=>{flushing=null;if(pending.size)void flush()});
  return flushing;
 }
 function set(key,value){
  let row;
  try{row={key,text:JSON.stringify(value),id:++serial};memory.set(key,row)}
  catch(error){notify(key,'failed',error);return Promise.resolve(false)}
  // A failed reload must never overwrite an unread, possibly newer backup.
  if(unreadKeys.has(key)){notify(key,'failed',Error('Existing device backup could not be read'));return Promise.resolve(false)}
  if(!idb)return Promise.resolve(fallback(row,Error('IndexedDB unavailable')));
  const acknowledgement=new Promise(resolve=>{const list=waiters.get(key)||[];list.push({id:row.id,resolve});waiters.set(key,list)});
  pending.set(key,row);notify(key,'pending');void flush();return acknowledgement;
 }
 function get(key){
  const row=memory.get(key);let old=null;
  try{old=legacy?.getItem(key)}catch{}
  const text=old&&(!row||stamp(old)>stamp(row.text))?old:row?.text;
  if(!text)return null;
  try{return JSON.parse(text)}catch{return null}
 }
 async function hydrate(keys){
  const records=[];
  if(idb)try{
   const db=await open();
   await new Promise((resolve,reject)=>{
    let done=false,tx;
    const timer=setTimeout(()=>{if(done)return;done=true;try{tx?.abort()}catch{}reject(Error('Device read timed out'))},timeoutMs);
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve()};
    tx=db.transaction(['snapshots'],'readonly');tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error||Error('Device read failed'));tx.onabort=()=>finish(tx.error||Error('Device read aborted'));
    for(const key of keys){const req=tx.objectStore('snapshots').get(key);req.onsuccess=()=>{if(req.result)records.push(req.result)}}
   });
   for(const key of keys)unreadKeys.delete(key);
  }catch(error){for(const key of keys)unreadKeys.add(key);notify(keys[0]||'', 'failed',error)}
  for(const row of records){
   const current=memory.get(row.key);
   if(!current||stamp(row.text)>stamp(current.text))memory.set(row.key,{...row,id:++serial});
  }
  // Migration is copy-then-acknowledge. Keep every legacy backup on failure.
  for(const key of keys){if(unreadKeys.has(key))continue;const value=get(key);if(value!==null)void set(key,value)}
  return keys.map(key=>get(key));
 }
 async function drain(){let okay=true;while(flushing||pending.size){if(!await flush())okay=false}return okay}
 return {set,get,hydrate,flush:drain,hasPending:()=>pending.size>0||!!flushing,
  isConfirmed:key=>{const row=memory.get(key);return !!row&&confirmed.get(key)===row.id},
  close:()=>{try{database?.close()}catch{}database=null}};
}
