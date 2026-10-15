// Dependency-injected controllers are embedded in the release bundle and tested
// with delayed writes/callbacks. No learner data or DOM is owned by this module.
export function createSafeUpdate({capture,persist,isCurrent,busy,reload,notice}){
 let pending=false,running=false;
 return {
  available(){pending=true;notice('새 버전이 준비됐어요. 답안을 저장한 뒤 업데이트할 수 있어요.');},
  async apply(){
   if(!pending||running)return false;
   if(busy()){notice('답안 확인이나 학습 전환이 끝난 뒤 업데이트해 주세요.');return false;}
   running=true;
   try{
    const snapshot=capture();
    if(!await persist(snapshot)){notice('저장을 확인하지 못해 현재 화면을 유지했어요. 연결을 확인한 뒤 다시 눌러 주세요.');return false;}
    if(!isCurrent(snapshot)||busy()){notice('저장 중 학습 내용이 바뀌었어요. 다시 눌러 최신 답안을 저장해 주세요.');return false;}
    pending=false;reload();return true;
   }catch{notice('업데이트를 보류했어요. 현재 답안은 그대로 유지됩니다.');return false;}
   finally{running=false;}
  }
 };
}
export function createScopedVoice({capture,isCurrent,write,status}){
 let active=null;
 function stop(){const old=active;active=null;if(old){try{old.recognition.abort()}catch{}}status(false);}
 function start(Recognition){
  stop();const scope=capture();if(!scope)return false;
  const recognition=new Recognition(),token={scope,recognition};active=token;
  recognition.lang='ko-KR';recognition.interimResults=true;
  const current=()=>active===token&&isCurrent(scope);
  recognition.onresult=event=>{if(!current())return;write(Array.from(event.results).map(r=>r[0].transcript).join(' '),scope);};
  recognition.onend=recognition.onerror=()=>{if(active===token){active=null;status(false);}};
  status(true);try{recognition.start();return true}catch{stop();return false;}
 }
 return {start,stop};
}
