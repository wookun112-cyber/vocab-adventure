// Applied to the same effective browser source that is exercised by release tests.
export const reliableSaveSource=String.raw`
let cloudSaveError=null;
function renderSaveStatus(){
 if(!cloudSaveError)return;
 const code=String(cloudSaveError.code||cloudSaveError.name||'');
 $('cloudPill').textContent=/REGRESSION/.test(cloudSaveError.message||'')?'기록 충돌 · 기록 다시 불러오기':
  /57014|Abort|Timeout|timeout/.test(code)?'저장 지연 · 기록은 기기에 보관됨':'저장 오류 · 기록은 기기에 보관됨';
 $('cloudPill').classList.remove('on');
}
async function cloudSave(silent=true){
 if(!canSaveLearning())return false;
 cloudSavePending=true;
 if(cloudSaveTask)return cloudSaveTask;
 const account=authUser.id,epoch=authEpoch;
 // Defer the body until after task assignment. An unchanged save used to leave
 // an already-resolved task here forever, silently suppressing later writes.
 cloudSaveTask=Promise.resolve().then(async()=>{
  saving=true;
  try{
   do{
    if(!canSaveLearning()||authUser.id!==account||epoch!==authEpoch)return false;
    cloudSavePending=false;state.updatedAt=Date.now();localSave();
    const snapshot=JSON.parse(JSON.stringify(state));
    const operations=cloudBaseline?learningPatch(cloudBaseline,snapshot):null;
    if(operations&&!operations.length){cloudSaveError=null;$('cloudPill').textContent='클라우드 저장됨';$('cloudPill').classList.add('on');break}
    let response;
    try{
     let request=operations?sb.rpc('save_learning_patch',{p_operations:operations}):sb.from('app_state').upsert({user_id:account,state:snapshot,updated_at:new Date().toISOString()});
     if(typeof request.abortSignal==='function')request=request.abortSignal(AbortSignal.timeout(12000));
     response=await withDeadline(request,15000,Object.assign(new Error('학습 기록 저장 지연'),{code:'save_timeout'}));
    }catch(error){response={error}}
    const error=response.error||(response.data?.conflict?{code:'learning_conflict',message:'LEARNING_STATE_REGRESSION: patch conflict'}:null);
    if(account!==authUser?.id||epoch!==authEpoch)return false;
    cloudSaveError=error||null;
    if(error){
     cloudSavePending=true;renderSaveStatus();
     console.warn(JSON.stringify({event:'learning_save_failed',code:String(error.code||error.name||'unknown').slice(0,60),operations:operations?.length||0}));
     if(error.message?.includes('LEARNING_STATE_REGRESSION')){loadedAccount=null;$('authGate').classList.remove('hidden');setMsg('다른 기기의 최신 기록을 보호했어요. 기기의 답안도 보관했습니다. 기록 다시 불러오기를 눌러 주세요.',true);syncAuthControls()}
     if(!silent)alert('학습 기록을 아직 서버에 저장하지 못했어요. 기기의 기록은 보관되어 있습니다.');
     return false;
    }
    cloudBaseline=snapshot;$('cloudPill').textContent='클라우드 저장됨';$('cloudPill').classList.add('on');
   }while(cloudSavePending&&authUser?.id===account&&epoch===authEpoch);
   return !cloudSaveError&&!cloudSavePending;
  }finally{saving=false;cloudSaveTask=null}
 });
 return cloudSaveTask;
}
`;
export const dayChoiceSource=String.raw`
let resumePreviousRequested=false,daySwitchBusy=false;
function lessonStudyDay(saved){
 const date=saved?.studyFallbackDay;
 if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date))return date;
 const stamp=Number(saved?.studyStartedAt||saved?.created);
 return Number.isFinite(stamp)&&stamp>=946684800000&&stamp<=32503680000000?learningDay(new Date(stamp)):null;
}
function isEarlierLesson(saved,day=today()){
 const date=lessonStudyDay(saved);
 return !!saved&&['daily','review'].includes(saved.mode)&&!!date&&date<day;
}
function renderDayChoice(saved=savedLesson()){
 const start=$('startDaily'),card=start?.closest?.('.card');if(!card)return;
 if(isEarlierLesson(saved)&&!preparingSession)start.textContent='오늘 새 학습 시작';
 let box=$('previousLearningChoices');
 if(!box){box=document.createElement('div');box.id='previousLearningChoices';box.style.marginTop='12px';card.appendChild(box)}
 box.replaceChildren();
 if(isEarlierLesson(saved)){
  const note=document.createElement('p');note.className='muted';note.textContent=lessonStudyDay(saved)+' 미완료 학습은 보관됩니다. 오늘의 학습시간은 새로 측정해요.';box.appendChild(note);
  const resume=document.createElement('button');resume.className='secondary';resume.textContent='이전 학습 이어하기';resume.disabled=preparingSession||daySwitchBusy;
  resume.onclick=async()=>{if(preparingSession||daySwitchBusy)return;resumePreviousRequested=true;try{await buildSession('daily')}finally{resumePreviousRequested=false}};box.appendChild(resume);
 }
 const archived=child().pausedLessonIndex||[];
 if(archived.length){
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='보관된 미완료 학습 '+archived.length+'건';details.appendChild(summary);
  const info=document.createElement('p');info.className='muted';info.textContent='이어하기를 선택하면 현재 진행 중인 학습도 먼저 보관합니다. 채점 대기 답안은 해당 학습에서 다시 확인합니다.';details.appendChild(info);
  for(const row of archived){
   const button=document.createElement('button');button.className='ghost';button.style.display='block';button.disabled=preparingSession||daySwitchBusy;
   button.textContent=(row.day||'이전 학습')+' · 기록 '+(row.answered||0)+'개'+(row.pendingGrades?' · 채점 대기 '+row.pendingGrades+'개':'')+' · 이어하기';
   button.onclick=()=>restorePausedLearning(row.id);details.appendChild(button);
  }
  box.appendChild(details);
 }
 box.hidden=!box.childNodes.length;
}
async function switchSavedLearning(saved,restoreId=null){
 if(daySwitchBusy)throw Error('학습 전환을 확인 중이에요.');
 const profile=state.selected,account=authUser?.id,epoch=authEpoch;
 daySwitchBusy=true;let transitionSent=false;
 const profileButtons=Array.from(document.querySelectorAll('[data-profile]')).map(b=>[b,b.disabled]);
 profileButtons.forEach(([b])=>{b.disabled=true});
 try{
  if(session?.profile===profile){pauseLearningClock();checkpointSession();localSave();const prior=session;session=null;prior.preparation?.cancel()}
  const savedOkay=await cloudSave();
  if(!savedOkay||!canSaveLearning()||account!==authUser?.id||epoch!==authEpoch)throw Error('먼저 기존 답안을 서버에 저장해야 해요. 기기 기록은 유지됩니다. 저장 상태를 확인한 뒤 다시 눌러 주세요.');
  transitionSent=true;
  const request=sb.rpc('switch_learning_day',{p_profile:profile,p_expected_id:saved?.id||null,p_day:today(),p_restore_id:restoreId});
  const {data,error}=await withDeadline(typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(15000)):request,17000,'학습 전환 확인이 지연됐어요. 다시 누르면 기존 기록을 확인합니다.');
  if(error||data?.conflict||(!data?.archived&&!data?.restored))throw Error('서버의 학습 상태가 바뀌었거나 전환에 실패했어요. 기존 학습은 삭제하지 않았습니다. 기록 다시 불러오기를 확인해 주세요.');
  if(account!==authUser?.id||profile!==state.selected||epoch!==authEpoch)return false;
  const key=preparationKey('daily',profile,account),unused=preparations.get(key);unused?.cancel();preparations.delete(key);
  clearTimeout(preparationRetryTimer);preparationRetryTimer=null;
  const loaded=await cloudLoad(account,epoch);
  if(!loaded||!canSaveLearning())throw Error('보관은 완료됐지만 새 기록 확인이 필요해요. 기록 다시 불러오기를 눌러 주세요.');
  state.selected=profile;localSave();renderAll();return true;
 }catch(error){
  if(transitionSent&&account===authUser?.id){loadedAccount=null;$('authGate').classList.remove('hidden');setMsg('기기의 학습 기록은 보관되어 있습니다. 학습 전환 결과를 확인하려면 기록 다시 불러오기를 눌러 주세요.',true);syncAuthControls()}
  throw error;
 }finally{daySwitchBusy=false;profileButtons.forEach(([b,disabled])=>{b.disabled=disabled})}
}
async function restorePausedLearning(id){
 if(preparingSession||daySwitchBusy)return;
 preparingSession=true;renderDayChoice();
 try{
  const restored=await switchSavedLearning(savedLesson(),id);
  if(restored){resumePreviousRequested=true;preparingSession=false;await buildSession('daily')}
 }catch(error){alert(String(error?.message||error));show('home')}
 finally{preparingSession=false;resumePreviousRequested=false;renderResumeButton();renderDayChoice();renderSaveStatus()}
}
`;
export function patchDailyRecovery(source){
 if(source.includes('// daily-recovery-12.16.26'))return source;
 const replace=(before,after)=>{if(source.split(before).length!==2)throw Error('Daily recovery anchor mismatch: '+before.slice(0,70));source=source.replace(before,after)};
 const begin=source.indexOf('async function cloudSave(silent=true){'),end=source.indexOf('function learnerCheckpointKey(',begin);
 if(begin<0||end<0)throw Error('Save function boundary unavailable');
 source=source.slice(0,begin)+'// daily-recovery-12.16.26\n'+reliableSaveSource+dayChoiceSource+source.slice(end);
 replace('function preservesLearning(previous,next){',"function preservesLearning(previous,next){\n if(Number(next.daySwitchSequence||0)<Number(previous.daySwitchSequence||0))return false;");
 replace('   if(paused){await resumeLesson(paused);return}',"   if(paused){\n    if(mode==='daily'&&isEarlierLesson(paused)&&!resumePreviousRequested){if(!(await switchSavedLearning(paused)))return}\n    else{await resumeLesson(paused);return}\n   }");
 const renderBegin=source.indexOf('function renderResumeButton(){'),renderEnd=source.indexOf('\nfunction storeLearnerCheckpoint',renderBegin);
 if(renderBegin<0||renderEnd<0)throw Error('Resume button boundary unavailable');
 const fn=source.slice(renderBegin,renderEnd),brace=fn.lastIndexOf('}');
 source=source.slice(0,renderBegin)+fn.slice(0,brace)+' renderDayChoice(saved);renderSaveStatus();\n'+fn.slice(brace)+source.slice(renderEnd);
 replace("if(saved?.model===LEARNING_MODEL&&!saved.introDone&&saved.nextIndex>=saved.introAt)$('startDaily').textContent='이어서 새 단어 익히기';", "if(saved?.model===LEARNING_MODEL&&!saved.introDone&&saved.nextIndex>=saved.introAt)$('startDaily').textContent='이어서 새 단어 익히기';\n renderDayChoice(saved);");
 replace("'클라우드 연결';$('cloudPill').classList.add('on');\n }\n}\nfunction renderQuestion", "'클라우드 연결';$('cloudPill').classList.add('on');renderSaveStatus();\n }\n}\nfunction renderQuestion");
 source+="\nwindow.addEventListener('online',()=>{if(canSaveLearning()&&cloudSavePending)cloudSave()});\nsetInterval(()=>{if(!document.hidden&&$('home')?.classList.contains('active'))renderDayChoice()},60000);\n";
 return source;
}
