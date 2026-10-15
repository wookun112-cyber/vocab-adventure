"""Real Chromium/IndexedDB test with synthetic records and mock cloud writes."""
import http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  body=b'<!doctype html><meta charset="utf-8"><title>Storage regression</title><span id="cloudPill"></span>'
  self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body)
 def log_message(self,*args): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=srv.serve_forever,daemon=True).start()
factory=(ROOT/'scripts/runtime/checkpoint-store.mjs').read_text().replace('export function','function')
cloud=(ROOT/'test-results/browser-cloud.js').read_text();checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 context=browser.new_context(viewport={'width':1024,'height':768},has_touch=True,is_mobile=True)
 page=context.new_page();page.goto(f'http://127.0.0.1:{srv.server_port}/')
 page.evaluate(factory+'\nwindow.createCheckpointStore=createCheckpointStore;')
 result=page.evaluate('''async()=>{
  const key='vocab-account-synthetic-A',old={savedAt:1,state:{answer:'확인용'}};
  localStorage.setItem(key,JSON.stringify(old));
  window.store=createCheckpointStore({idb:indexedDB,legacy:localStorage});
  await store.hydrate([key]);await store.flush();
  if(!store.isConfirmed(key)||localStorage.getItem(key)!==null)throw Error('Migration acknowledgement failed');
  const one='가'.repeat(300000);let quota=false;
  for(let i=0;i<100;i++)try{localStorage.setItem('fixture-filler-'+i,one)}catch(e){quota=e.name==='QuotaExceededError';break}
  if(!quota)throw Error('Did not reach real localStorage quota');
  if(!await store.set(key,{savedAt:2,state:{large:'가'.repeat(6000000),pendingAnswers:['답1','답2'],account:'A'}}))throw Error('Large IndexedDB save failed');
  await store.flush();return {realQuota:true,confirmed:store.isConfirmed(key)};
 }''');checks.append({'test':'real_quota_and_large_indexeddb_commit','result':result})
 page.reload();page.evaluate(factory+'\nwindow.createCheckpointStore=createCheckpointStore;')
 result=page.evaluate('''async()=>{
  window.store=createCheckpointStore({idb:indexedDB,legacy:localStorage});
  await store.hydrate(['vocab-account-synthetic-A','vocab-account-synthetic-B']);await store.flush();
  const saved=store.get('vocab-account-synthetic-A');
  if(saved.state.large.length!==6000000||saved.state.pendingAnswers.length!==2||store.get('vocab-account-synthetic-B')!==null)throw Error('Reload or account isolation failed');
  return {characters:saved.state.large.length,pendingAnswers:saved.state.pendingAnswers.length,otherAccountUnchanged:true};
 }''');checks.append({'test':'real_browser_reload','result':result})
 harness=r'''
let authUser={id:'synthetic-A'},authEpoch=1,loadedAccount='synthetic-A';
let state={updatedAt:1,users:{ayoung:{answer:'initial'}}},cloudBaseline=JSON.parse(JSON.stringify(state));
let cloudSavePending=false,cloudSaveTask=null,saving=false,remoteFail=false,writes=0;
let deviceStoreError=null,session=null;
const $=id=>document.getElementById(id),canSaveLearning=()=>true;
const withDeadline=async p=>await p,learningPatch=(a,b)=>JSON.stringify(a.users)===JSON.stringify(b.users)?[]:[{path:['users','ayoung','answer'],value:b.users.ayoung.answer}];
const setMsg=()=>{},syncAuthControls=()=>{},alert=()=>{},checkpointSession=()=>{};
const sb={rpc:async()=>{writes++;return remoteFail?{error:{code:'57014',message:'simulated cloud timeout'}}:{data:{saved:true}}},auth:{getSession:async()=>{throw Error('Unexpected auth for received grade')}}};
function renderDeviceWarning(){if(deviceStoreError){$('cloudPill').textContent=cloudSaveError?'저장 실패 · 창을 닫지 말고 재시도':cloudSavePending?'기기 저장 실패 · 서버 저장 확인 중':'클라우드 저장됨 · 기기 저장 확인 필요';}}
let deviceStore=createCheckpointStore({idb:{open(){throw Error('Injected IndexedDB write failure')}},legacy:localStorage,onState:e=>{if(e.status==='failed')deviceStoreError=e.error;else if(e.status==='durable'||e.status==='legacy')deviceStoreError=null;}});
'''
 page.evaluate(harness+'\n'+cloud+r'''
window.exerciseCloud=async()=>{
 state.users.ayoung.answer='저장 테스트'.repeat(200000);
 let okay=await cloudSave();await deviceStore.flush();renderSaveStatus();
 if(!okay||writes!==1||!deviceStoreError)throw Error('Device failure blocked cloud write');
 remoteFail=true;state.users.ayoung.answer+='다음답';
 okay=await cloudSave();await deviceStore.flush();renderSaveStatus();
 if(okay||!cloudSavePending||!$('cloudPill').textContent.includes('창을 닫지'))throw Error('Simultaneous failure lost retry state');
 const warning=$('cloudPill').textContent;
 deviceStore=createCheckpointStore({idb:indexedDB,legacy:localStorage,onState:e=>{if(e.status==='durable')deviceStoreError=null;}});
 remoteFail=false;okay=await cloudSave();await deviceStore.flush();renderSaveStatus();
 if(!okay||cloudSavePending||deviceStoreError)throw Error('Storage recovery failed');
 const saved=await requestGrade({receivedGrade:{score:1,contextSuccess:true,feedback:'already saved'}});
 if(saved.score!==1)throw Error('Previously received grade was not reused');
 return {cloudWrites:writes,deviceFailureDidNotBlockCloud:true,bothFailedWarning:warning,recovered:true,receivedGradeNoNetwork:true};
};
''')
 checks.append({'test':'production_save_and_grade_recovery_functions','result':page.evaluate('exerciseCloud()')})
 page.screenshot(path=str(ROOT/'test-results/browser-storage.png'))
 context.close();browser.close()
srv.shutdown()
report={'browser':'Chromium','physicalUserTablet':False,'syntheticDataOnly':True,'paidProviderCalls':0,'checks':checks}
(ROOT/'test-results/browser-recovery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
