import {createCheckpointStore} from './runtime/checkpoint-store.mjs';
export function patchStorageSafety(source){
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Storage safety anchor mismatch: '+a.slice(0,85));source=source.replace(a,b)};
 const runtime=`
const createCheckpointStore=${createCheckpointStore.toString()};
let deviceStoreError=null;
const deviceStoreStates=new Map();
const deviceStore=createCheckpointStore({idb:typeof indexedDB==='undefined'?null:indexedDB,legacy:typeof localStorage==='undefined'?null:localStorage,onState:event=>{
 deviceStoreStates.set(event.key,event.status);
 if(!authUser||!event.key.includes(authUser.id))return;
 if(event.status==='failed')deviceStoreError=event.error||Error('Device storage unavailable');
 else if(['durable','legacy'].includes(event.status)&&![...deviceStoreStates].some(([k,s])=>k.includes(authUser.id)&&s==='failed'))deviceStoreError=null;
 if(typeof renderSaveStatus==='function')renderSaveStatus();
}});
async function hydrateDeviceRecords(account){
 const keys=['vocab-account-'+account,...['ayoung','inseong','guest'].map(profile=>learnerCheckpointKey(profile,account))];
 await deviceStore.hydrate(keys);
}
function deviceLearnerCheckpoint(profile){
 const account=authUser?.id,explicit=deviceStore.get(learnerCheckpointKey(profile,account)),family=deviceStore.get('vocab-account-'+account);
 const records=[explicit];
 if(family?.account===account&&family.state?.users?.[profile]){
  const learner=family.state.users[profile];records.push({account,profile,savedAt:learner.lessonCheckpointAt||family.state.updatedAt||0,learner,catalog:family.state.catalog||{}});
 }
 const previous=state.users[profile];
 return records.filter(r=>r?.account===account&&r.profile===profile&&r.learner&&preservesLearning(previous,r.learner))
 .sort((a,b)=>Number(b.learner.daySwitchSequence||0)-Number(a.learner.daySwitchSequence||0)||Number(b.savedAt||0)-Number(a.savedAt||0))[0]||null;
}
function renderDeviceWarning(){
 if(!deviceStoreError)return;
 $('cloudPill').textContent=cloudSaveError?'저장 실패 · 창을 닫지 말고 재시도':cloudSavePending?'기기 저장 실패 · 서버 저장 확인 중':'클라우드 저장됨 · 기기 저장 확인 필요';
 $('cloudPill').classList.remove('on');
}
`;
 replace("function localSave(){if(canSaveLearning())localStorage.setItem('vocab-account-'+authUser.id,JSON.stringify({account:authUser.id,state}))}",runtime+"\nfunction localSave(){if(!canSaveLearning())return false;void deviceStore.set('vocab-account-'+authUser.id,{account:authUser.id,state});return true;}");
 replace(" if(!account)return false;\n const {data,error}=await withDeadline(sb.from('app_state')"," if(!account)return false;\n await hydrateDeviceRecords(account);\n if(account!==authUser?.id||epoch!==authEpoch)return false;\n const {data,error}=await withDeadline(sb.from('app_state')");
 replace(" try{localStorage.setItem(learnerCheckpointKey(profile),JSON.stringify({account:authUser.id,profile,savedAt:c.lessonCheckpointAt,learner:c,catalog:state.catalog}))}catch{}",
 " void deviceStore.set(learnerCheckpointKey(profile),{account:authUser.id,profile,savedAt:c.lessonCheckpointAt,learner:c,catalog:state.catalog});");
 replace("  let saved;try{saved=JSON.parse(localStorage.getItem(learnerCheckpointKey(profile))||'null')}catch{continue}","  const saved=deviceLearnerCheckpoint(profile);");
 replace("function renderSaveStatus(){\n if(!cloudSaveError)return;","function renderSaveStatus(){\n if(deviceStoreError){renderDeviceWarning();return}\n if(!cloudSaveError)return;");
 // Catch serialization and unexpected device errors too, never lose retry state.
 replace("  }finally{saving=false;cloudSaveTask=null}\n });\n return cloudSaveTask;",
 "  }catch(error){cloudSaveError=error;cloudSavePending=true;renderSaveStatus();return false}\n  finally{saving=false;cloudSaveTask=null;renderSaveStatus()}\n });\n return cloudSaveTask;");
 source+="\nwindow.addEventListener('beforeunload',event=>{if(deviceStore.hasPending()||deviceStoreError&&cloudSavePending){event.preventDefault();event.returnValue='';}});\n";
 return source;
}
