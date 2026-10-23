// Applied to the same effective browser source that is exercised by release tests.
export const reliableSaveSource=String.raw`
let cloudSaveError=null;
let cloudSaveRetryTimer=null,cloudSaveRetryCount=0,cloudSaveRetryScope='';
function clearCloudSaveRetry(reset=false){
 if(cloudSaveRetryTimer!==null)clearTimeout(cloudSaveRetryTimer);
 cloudSaveRetryTimer=null;
 if(reset){cloudSaveRetryCount=0;cloudSaveRetryScope=''}
}
function retryableSaveError(error){
 const code=String(error?.code||error?.status||'');
 return !/LEARNING_STATE_REGRESSION/i.test(error?.message||'')&&!/^(learning_conflict|401|403|42501|22\d{3}|23\d{3}|PGRST30[123])$/.test(code);
}
function scheduleCloudSaveRetry(account=authUser?.id,epoch=authEpoch){
 if(!account||account!==authUser?.id||epoch!==authEpoch||!canSaveLearning()||!cloudSavePending||!retryableSaveError(cloudSaveError))return;
 const scope=account+':'+epoch;
 if(cloudSaveRetryScope!==scope){clearCloudSaveRetry(true);cloudSaveRetryScope=scope}
 if(cloudSaveRetryTimer!==null)return;
 const delay=Math.min(120000,15000*2**Math.min(3,cloudSaveRetryCount++));
 cloudSaveRetryTimer=setTimeout(async()=>{
  cloudSaveRetryTimer=null;
  if(account!==authUser?.id||epoch!==authEpoch){clearCloudSaveRetry(true);return}
  if(document.hidden||(typeof navigator!=='undefined'&&navigator.onLine===false)){
   scheduleCloudSaveRetry(account,epoch);return;
  }
  if(canSaveLearning()&&cloudSavePending)await cloudSave();
 },delay);
 cloudSaveRetryTimer?.unref?.();
}
function renderSaveStatus(){
 if(!cloudSaveError)return;
 const code=String(cloudSaveError.code||cloudSaveError.name||'');
 $('cloudPill').textContent=/REGRESSION/.test(cloudSaveError.message||'')?'기록 충돌 · 기록 다시 불러오기':
  /57014|Abort|Timeout|timeout/.test(code)?'저장 지연 · 기록은 기기에 보관됨':'저장 오류 · 기록은 기기에 보관됨';
 $('cloudPill').classList.remove('on');
}
const gradeSaveWaiters=new Set();
function gradeSubmissionSaved(snapshot,job,active){
 const lesson=snapshot?.users?.[active.profile]?.activeLesson;
 if(lesson?.id!==active.lessonId)return false;
 const saved=(lesson.gradingQueue||[]).find(j=>j.id===job.id);
 return saved?.answer===job.answer&&JSON.stringify(saved?.payload)===JSON.stringify(job.payload)&&
  (lesson.ready||[]).some(([index,q])=>index===job.index&&q?.w?.w===job.word);
}
function notifyGradeSaves(snapshot,account,epoch,failed=false){
 for(const w of [...gradeSaveWaiters]){
  if(w.account!==authUser?.id||w.epoch!==authEpoch||w.account!==account||w.epoch!==epoch){w.finish(false);continue}
  if(failed)w.finish(false);
  else if(gradeSubmissionSaved(snapshot,w.job,w.active))w.finish(true);
 }
}
async function waitForGradeSave(job){
 const active=session,account=authUser?.id,epoch=authEpoch;
 if(!active||!account||!active.gradingQueue?.some(j=>j.id===job.id))return false;
 if(gradeSubmissionSaved(cloudBaseline,job,active))return true;
 return new Promise(resolve=>{
  const w={job,active,account,epoch,finish(value){clearTimeout(w.timer);gradeSaveWaiters.delete(w);resolve(value)}};
  w.timer=setTimeout(()=>w.finish(false),12000);gradeSaveWaiters.add(w);
  // Resolve on this answer's committed snapshot, not the full save drain.
  void cloudSave().then(saved=>{if(saved===false)w.finish(false)},()=>w.finish(false));
 });
}
async function cloudSave(silent=true){
 if(!canSaveLearning())return false;
 cloudSavePending=true;
 if(cloudSaveTask)return cloudSaveTask;
 const account=authUser.id,epoch=authEpoch;
 clearCloudSaveRetry();
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
    if(operations&&!operations.length){cloudSaveError=null;clearCloudSaveRetry(true);$('cloudPill').textContent='클라우드 저장됨';$('cloudPill').classList.add('on');break}
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
     cloudSavePending=true;renderSaveStatus();notifyGradeSaves(null,account,epoch,true);
     console.warn(JSON.stringify({event:'learning_save_failed',code:String(error.code||error.name||'unknown').slice(0,60),operations:operations?.length||0}));
     if(error.message?.includes('LEARNING_STATE_REGRESSION')){loadedAccount=null;$('authGate').classList.remove('hidden');setMsg('다른 기기의 최신 기록을 보호했어요. 기기의 답안도 보관했습니다. 기록 다시 불러오기를 눌러 주세요.',true);syncAuthControls()}
     scheduleCloudSaveRetry(account,epoch);
     if(!silent)alert('학습 기록을 아직 서버에 저장하지 못했어요. 기기의 기록은 보관되어 있습니다.');
     return false;
    }
    cloudBaseline=snapshot;notifyGradeSaves(snapshot,account,epoch);clearCloudSaveRetry(true);$('cloudPill').textContent='클라우드 저장됨';$('cloudPill').classList.add('on');
   }while(cloudSavePending&&authUser?.id===account&&epoch===authEpoch);
   return !cloudSaveError&&!cloudSavePending;
  }finally{saving=false;cloudSaveTask=null}
 });
 return cloudSaveTask;
}
`;
export const dayChoiceSource=String.raw`
let resumePreviousRequested=false,daySwitchBusy=false;
let dailyRolloverTask=null,manualPreviousLesson=null;
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

function isManuallyRestoredOld(saved){
 return !!saved&&manualPreviousLesson?.id===saved.id&&manualPreviousLesson.day===today()&&
  manualPreviousLesson.profile===state.selected&&manualPreviousLesson.account===authUser?.id;
}
// Transition only on the signed-in selected learner. On failed storage, keep
// yesterday's original round and let the next wake/Start retry safely.
async function autoRolloverPreviousDay(){
 if(dailyRolloverTask)return dailyRolloverTask;
 if(!canSaveLearning()||preparingSession||daySwitchBusy||resumePreviousRequested)return false;
 const saved=savedLesson();
 if(!isEarlierLesson(saved)||isManuallyRestoredOld(saved))return false;
 const profile=state.selected,account=authUser?.id,epoch=authEpoch;
 dailyRolloverTask=(async()=>{
  try{
   if(!(await switchSavedLearning(saved)))return false;
   if(profile!==state.selected||account!==authUser?.id||epoch!==authEpoch)return false;
   manualPreviousLesson=null;
   if(['learn','intro','reading'].some(id=>$(id)?.classList.contains('active')))show('home');
   setStudyStartStatus('날짜가 바뀌어 이전 회차를 보관했어요. 오늘의 새 회차를 시작할 수 있어요.');
   renderAll();return true;
  }catch(error){
   if(profile===state.selected&&account===authUser?.id&&epoch===authEpoch){
    setStudyStartStatus('지난 회차를 보관하지 못했어요. 답안과 진도는 그대로 있습니다. 인터넷 연결 후 다시 시도해 주세요.',true);
    renderResumeButton();
   }
   return false;
  }finally{
   dailyRolloverTask=null;
   if(profile===state.selected&&account===authUser?.id&&epoch===authEpoch)renderResumeButton();
  }
 })();
 return dailyRolloverTask;
}
function renderDayChoice(saved=savedLesson()){
 const start=$('startDaily'),card=start?.closest?.('.card');if(!card)return;
 if(isEarlierLesson(saved)&&!preparingSession&&!isManuallyRestoredOld(saved))start.textContent='오늘 새 학습 시작 · 이전 회차 보관';
 if(daySwitchBusy||dailyRolloverTask)start.disabled=true;
 let box=$('previousLearningChoices');
 if(!box){box=document.createElement('div');box.id='previousLearningChoices';box.style.marginTop='12px';card.appendChild(box)}
 box.replaceChildren();
 if(isEarlierLesson(saved)&&!isManuallyRestoredOld(saved)){
  const note=document.createElement('p');note.className='muted';
  note.textContent=lessonStudyDay(saved)+' 미완료 회차는 보관하고 오늘 학습은 0초부터 새로 시작해요. 원본 답안과 정오답 기록은 유지합니다.';
  box.appendChild(note);
 }
 const archived=child().pausedLessonIndex||[];
 if(archived.length){
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='보관된 미완료 학습 '+archived.length+'건';details.appendChild(summary);
  const info=document.createElement('p');info.className='muted';info.textContent='이어하기를 선택하면 현재 진행 중인 학습도 먼저 보관합니다. 이전 답안의 저장된 채점 결과는 접속하거나 학습 날짜가 바뀔 때 자동으로 확인합니다.';details.appendChild(info);
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
 setStudyStartStatus(restoreId?'보관한 이전 학습을 여는 중입니다.':'이전 학습의 답안과 진도를 보관할 준비 중입니다.');
 const profileButtons=Array.from(document.querySelectorAll('[data-profile]')).map(b=>[b,b.disabled]);
 profileButtons.forEach(([b])=>{b.disabled=true});
 try{
  if(session?.profile===profile){
   if(!restoreId&&isEarlierLesson(saved)){
    studyHistory.captureStudyClock(session,Date.parse(today()+'T00:00:00+09:00'));
    session.clockStarted=null;
   }
   pauseLearningClock();checkpointSession();localSave();
   const prior=session;session=null;prior.preparation?.cancel();
  }
  settleReachedStudyDays(saved);
  syncUnfinishedUsage(child(),saved);
  setStudyStartStatus('현재 기기 답안을 먼저 안전하게 저장하고 있습니다.');
  const savedOkay=await cloudSave();
  if(!savedOkay||!canSaveLearning()||account!==authUser?.id||epoch!==authEpoch)throw Error('먼저 기존 답안을 서버에 저장해야 해요. 기기 기록은 유지됩니다. 저장 상태를 확인한 뒤 다시 눌러 주세요.');
  transitionSent=true;
  setStudyStartStatus(restoreId?'선택한 미완료 학습을 불러오고 있습니다.':'이전 학습을 서버에 보관하고 오늘 학습을 준비하고 있습니다.');
  const request=sb.rpc('switch_learning_day',{p_profile:profile,p_expected_id:saved?.id||null,p_day:today(),p_restore_id:restoreId});
  const {data,error}=await withDeadline(typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(15000)):request,17000,'학습 전환 확인이 지연됐어요. 다시 누르면 기존 기록을 확인합니다.');
  if(error||data?.conflict||(!data?.archived&&!data?.restored))throw Error('서버의 학습 상태가 바뀌었거나 전환에 실패했어요. 기존 학습은 삭제하지 않았습니다. 기록 다시 불러오기를 확인해 주세요.');
  if(account!==authUser?.id||profile!==state.selected||epoch!==authEpoch)return false;
  const key=preparationKey('daily',profile,account),unused=preparations.get(key);unused?.cancel();preparations.delete(key);
  clearTimeout(preparationRetryTimer);preparationRetryTimer=null;
  setStudyStartStatus('보관된 기록을 확인하고 새 학습을 연결하고 있어요.');
  // Archived grades may take 18s+ to reconcile. They are preserved in
  // paused_lessons and can be recovered at a later login. Do not hold today's
  // first lesson behind historical grading work.
  const loaded=await cloudLoad(account,epoch,{skipArchivedGradeRecovery:true});
  if(!loaded||!canSaveLearning())throw Error('보관은 완료됐지만 새 기록 확인이 필요해요. 기록 다시 불러오기를 눌러 주세요.');
  state.selected=profile;localSave();renderAll();setStudyStartStatus(restoreId?'이전 학습을 불러왔습니다.':'이전 학습 보관 완료 · 오늘의 새 문제를 준비하고 있어요.');return true;
 }catch(error){
  // A timeout after posting the archive request is NOT a reason to log out.
  // The RPC is idempotent; retrying reads the server-owned archive/active state.
  // Keep the existing local checkpoint so a second click never loses answers.
  setStudyStartStatus(transitionSent?'전환 결과 확인이 지연됐습니다. 기존 기록을 보존했어요. 잠시 뒤 다시 눌러 서버 상태를 확인해 주세요.':String(error?.message||error),true);
  throw error;
 }finally{daySwitchBusy=false;profileButtons.forEach(([b,disabled])=>{b.disabled=disabled})}
}
async function restorePausedLearning(id){
 if(preparingSession||daySwitchBusy)return;
 preparingSession=true;renderDayChoice();
 try{
  const restored=await switchSavedLearning(savedLesson(),id);
  if(restored){manualPreviousLesson={account:authUser?.id,profile:state.selected,id,day:today()};resumePreviousRequested=true;preparingSession=false;await buildSession('daily')}
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
 replace(" if($('startReview'))$('startReview').textContent=saved?saved.roundNumber+'회차 이어서 하기':next+'회차 시작하기';"," if($('startReview'))$('startReview').textContent=saved?saved.roundNumber+'회차 이어서 하기':next+'회차 시작하기';\n if(isEarlierLesson(saved)&&!isManuallyRestoredOld(saved)){\n  $('startDaily').textContent='오늘 새 학습 시작 · '+next+'회차';\n  if($('startReview'))$('startReview').textContent='오늘 새 회차 시작';\n  if(daySwitchBusy||dailyRolloverTask)$('startDaily').disabled=true;\n }");
 replace(" if($('dailyTitle'))$('dailyTitle').textContent=saved?saved.roundNumber+'회차 진행 중':'새 단어 5개 + 복습 최대 10개';"," if($('dailyTitle'))$('dailyTitle').textContent=isEarlierLesson(saved)&&!isManuallyRestoredOld(saved)?'오늘 새 회차 준비':saved?saved.roundNumber+'회차 진행 중':'새 단어 5개 + 복습 최대 10개';");
 replace("   $('authGate').classList.add('hidden');setMsg('');","   $('authGate').classList.add('hidden');setMsg('');\n   // Open today's study automatically after any successful sign-in.\n   setTimeout(()=>{if(epoch===authEpoch&&canSaveLearning())void autoRolloverPreviousDay()},0);");
 replace("session=null;state.selected=b.dataset.profile;localSave();cloudSave();renderAll();show('home');warmDailyQuestions()","session=null;state.selected=b.dataset.profile;manualPreviousLesson=null;localSave();cloudSave();renderAll();show('home');void autoRolloverPreviousDay().then(()=>warmDailyQuestions())");
 replace('function preservesLearning(previous,next){',"function preservesLearning(previous,next){\n if(Number(next.daySwitchSequence||0)<Number(previous.daySwitchSequence||0))return false;");
 replace('   if(paused){await resumeLesson(paused);return}',`   if(paused){
    if(isEarlierLesson(paused)&&!resumePreviousRequested&&!isManuallyRestoredOld(paused)){
     // Every prior-date daily/review lesson, including numbered rounds and
     // incomplete grading, is archived before another day is started.
     if(!(await switchSavedLearning(paused)))return;
     if(!savedLesson(profile)&&child().lastDate===today()&&mode==='daily')mode='review';
    }else if(cappedCurrentDailyLesson(paused)){
     // The daily time limit is not a block on extra practice. Preserve the
     // unsolved original lesson in the server archive before opening review.
     setStudyStartStatus('이전 학습 기록을 보관한 뒤 다음 회차를 준비합니다.');
     if(!(await switchSavedLearning(paused)))return;
    }else{await resumeLesson(paused);return}
   }`);
 const renderBegin=source.indexOf('function renderResumeButton(){'),renderEnd=source.indexOf('\nfunction storeLearnerCheckpoint',renderBegin);
 if(renderBegin<0||renderEnd<0)throw Error('Resume button boundary unavailable');
 const fn=source.slice(renderBegin,renderEnd),brace=fn.lastIndexOf('}');
 source=source.slice(0,renderBegin)+fn.slice(0,brace)+' renderDayChoice(saved);renderSaveStatus();\n'+fn.slice(brace)+source.slice(renderEnd);
 replace("if(saved?.model===LEARNING_MODEL&&!saved.introDone&&saved.nextIndex>=saved.introAt)$('startDaily').textContent='이어서 새 단어 익히기';", "if(saved?.model===LEARNING_MODEL&&!saved.introDone&&saved.nextIndex>=saved.introAt)$('startDaily').textContent='이어서 새 단어 익히기';\n renderDayChoice(saved);");
 replace("'클라우드 연결';$('cloudPill').classList.add('on');\n }\n}\nfunction renderQuestion", "'클라우드 연결';$('cloudPill').classList.add('on');renderSaveStatus();\n }\n}\nfunction renderQuestion");
 source+="\nwindow.addEventListener('online',()=>{if(canSaveLearning()&&cloudSavePending&&retryableSaveError(cloudSaveError))cloudSave()});\ndocument.addEventListener('visibilitychange',()=>{if(!document.hidden&&canSaveLearning()&&cloudSavePending&&retryableSaveError(cloudSaveError))cloudSave()});\n";
 source+="\nlet observedStudyDate=today();\nfunction checkStudyDateChange(){\n const day=today();\n if(day!==observedStudyDate){observedStudyDate=day;manualPreviousLesson=null}\n void autoRolloverPreviousDay();\n}\nfunction scheduleKstStudyMidnight(){\n const next=Date.parse(today()+'T00:00:00+09:00')+86400000+100;\n setTimeout(()=>{checkStudyDateChange();scheduleKstStudyMidnight()},Math.max(1000,next-Date.now()));\n}\nscheduleKstStudyMidnight();\nwindow.addEventListener('focus',checkStudyDateChange);\nwindow.addEventListener('pageshow',checkStudyDateChange);\ndocument.addEventListener('visibilitychange',()=>{if(!document.hidden)checkStudyDateChange()});\nsetInterval(()=>{if(!document.hidden){checkStudyDateChange();if($('home')?.classList.contains('active'))renderDayChoice()}},60000);\n";
 return source;
}
