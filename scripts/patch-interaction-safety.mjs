import {createSafeUpdate,createScopedVoice} from './runtime/interaction-safety.mjs';
import {POLICY_COPY} from './runtime/policy-copy.mjs';
export function patchInteractionSafety(source){
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Interaction safety anchor mismatch: '+a.slice(0,90));source=source.replace(a,b)};
 const runtime=`
const createSafeUpdate=${createSafeUpdate.toString()};
const createScopedVoice=${createScopedVoice.toString()};
const POLICY_COPY=${JSON.stringify(POLICY_COPY)};
function gradingRetryDelay(code,attempts=0){
 if(code==='grading_daily_limit')return Math.max(60000,Date.parse(today()+'T00:00:00+09:00')+86400000-Date.now());
 if(['ai_credit_exhausted','grading_account_not_allowed'].includes(code))return 300000;
 return Math.min(120000,15000*2**Math.min(3,attempts));
}
function feedbackExplanationHtml(value){
 const text=String(value||''),at=text.indexOf('지문 근거:');
 if(at<0||text.length<170)return '<p>'+escapeHtml(text)+'</p>';
 return '<p>'+escapeHtml(text.slice(0,at).trim())+'</p><details><summary>지문 근거 자세히 보기</summary><p>'+escapeHtml(text.slice(at))+'</p></details>';
}
function renderParentRecovery(){
 const host=$('parentRecovery');if(!host)return;
 if(!authUser||!canSaveLearning()){host.textContent='로그인 후 저장과 채점 상태를 확인할 수 있어요.';return;}
 const stamp=Number(cloudBaseline?.updatedAt)||0,time=stamp?new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'아직 확인되지 않음';
 const rows=Object.values(state.users).map(c=>{
  const jobs=(c.activeLesson?.gradingQueue||[]).filter(j=>j.status!=='applied'),recovery=jobs.filter(j=>j.errorCode==='grading_result_recovery_required').length;
  const limit=jobs.filter(j=>j.errorCode==='grading_daily_limit').length;
  return '<p><strong>'+escapeHtml(c.name)+'</strong> · 채점 대기 '+jobs.length+'개'+(recovery?' · 기존 결과 복구 확인 '+recovery+'개':'')+(limit?' · 일일 비용 보호 대기 '+limit+'개':'')+'</p>';
 }).join('');
 host.innerHTML='<p>마지막 서버 저장 확인: '+escapeHtml(time)+'</p><p>'+(cloudSaveError?'서버 저장 재시도가 필요해요. 아래 지금 동기화를 눌러 주세요.':cloudSavePending?'서버에 변경 사항을 저장 중이에요.':'서버 저장이 확인됐어요.')+(deviceStoreError?' 기기 저장은 확인이 필요합니다.':'')+'</p>'+rows+'<p class="muted">일반 채점 대기는 해당 학습을 열면 다시 확인합니다. 기존 결과 복구는 중복 유료 채점 없이 확인하며, 원인을 해결하기 전 임의 정답으로 처리하지 않습니다. 검수 문항 보충 필요 표시가 있으면 미리 작성한 문제은행을 보충해야 합니다.</p>';
}
const voiceController=createScopedVoice({
 capture:()=>session&&!session.completed&&session.queue[current]?.open&&!session.results[current]?{account:authUser?.id,profile:state.selected,session,index:current,question:session.queue[current]}:null,
 isCurrent:s=>authUser?.id===s.account&&state.selected===s.profile&&session===s.session&&current===s.index&&session.queue[current]===s.question&&!session.results[current]&&!session.waitingForGrading&&$('learn').classList.contains('active'),
 write:text=>{$('answer').value=text;answerSource='voice';markStudyActivity();checkpointSession();localSave();},
 status:recording=>{$('mic').classList.toggle('recording',recording);$('mic').textContent=recording?'듣는 중…':'🎤 음성 입력';}
});
function stopVoice(){voiceController.stop();}
function updateNotice(message){
 let box=$('safeUpdateNotice');
 if(!box){box=document.createElement('div');box.id='safeUpdateNotice';box.className='card';box.setAttribute('role','status');const text=document.createElement('p');text.id='safeUpdateText';const button=document.createElement('button');button.className='secondary';button.textContent='답안 저장 후 업데이트';button.onclick=()=>safeUpdater.apply();box.append(text,button);document.body.appendChild(box);}
 $('safeUpdateText').textContent=message;
}
const updateFingerprint=()=>JSON.stringify([authUser?.id,state.selected,state.users]);
const safeUpdater=createSafeUpdate({
 busy:()=>!!(session?.waitingForGrading||session?.gradingBusy||preparingSession||daySwitchBusy||authUser&&!canSaveLearning()),
 capture:()=>{stopVoice();pauseLearningClock();checkpointSession();return {account:authUser?.id,fingerprint:updateFingerprint()};},
 persist:async s=>{if(!s.account)return true;localSave();const deviceSaved=await deviceStore.flush();if(deviceSaved&&!deviceStoreError&&!deviceStore.hasPending())return true;return await cloudSave();},
 isCurrent:s=>s.account===authUser?.id&&s.fingerprint===updateFingerprint(),
 reload:()=>location.reload(),notice:updateNotice
});
`;
 replace('function startVoice(){',runtime+'\nfunction startVoice(){');
 const start=source.indexOf(' const r=new R();r.lang='),end=source.indexOf('\n}',start);
 if(start<0||end<0)throw Error('Voice function not found');
 source=source.slice(0,start)+" voiceController.start(R);"+source.slice(end);
 replace('function renderQuestion(savedHint=0){','function renderQuestion(savedHint=0){\n stopVoice();');
 replace('async function gradeCurrent(dontKnow){','async function gradeCurrent(dontKnow){\n stopVoice();');
 replace('function show(id){','function show(id){stopVoice();');
 replace("function show(id){stopVoice();","function show(id){stopVoice();if(id==='settings')renderParentRecovery();");
 replace("function renderSaveStatus(){\n","function renderSaveStatus(){\n renderParentRecovery();\n");
 replace("b.onclick=()=>{pauseLearningClock();checkpointSession();if(session?.preparation)","b.onclick=()=>{stopVoice();pauseLearningClock();checkpointSession();if(session?.preparation)");
 replace("$('answer').addEventListener('input',e=>{markStudyActivity(e);","$('answer').addEventListener('input',e=>{stopVoice();answerSource='typed';markStudyActivity(e);");
 replace("$('signOut').onclick=()=>sb.auth.signOut();","$('signOut').onclick=()=>{stopVoice();sb.auth.signOut()};");
 replace("async function applyAuth(sessionObj){","async function applyAuth(sessionObj){\n stopVoice();");
 replace("<h3>해설</h3><p>'+escapeHtml(feedback||q.feedbackCorrect||q.w.d)+'</p></section>","<h3>해설</h3>'+feedbackExplanationHtml(feedback||q.feedbackCorrect||q.w.d)+'</section>");
 replace("const text=$('feedback').querySelector?.('.feedback-explanation p');if(text)text.textContent=record.feedback","const text=$('feedback').querySelector?.('.feedback-explanation');if(text)text.innerHTML='<h3>해설</h3>'+feedbackExplanationHtml(record.feedback)");
 replace("(e.code==='ai_credit_exhausted'?300000:15000)","gradingRetryDelay(e.code)");
 replace("(e.code==='ai_credit_exhausted'?300000:Math.min(120000,15000*2**Math.min(3,job.attempts)))","gradingRetryDelay(e.code,job.attempts)");
 replace("$('feedback').textContent=e.code==='grading_result_recovery_required'?","$('feedback').textContent=['grading_daily_limit','grading_rate_limit','grading_assignment_pending','grading_account_not_allowed'].includes(e.code)?String(e.message):e.code==='grading_result_recovery_required'?");
 replace("    reloading=true;\n    location.reload();","    reloading=true;\n    safeUpdater.available();");
 // One policy definition supplies settings, ranking and parent report copy.
 source=source.replace(/(<h3>오늘의 적정 분량<\/h3>[\s\S]*?<p class="muted">)[\s\S]*?(<\/p><small class="muted">최근 학습 시간:)/, '$1${escapeHtml(POLICY_COPY.daily)}$2');
 source=source.replace(/(<h3>학습 중 난이도 조정<\/h3>[\s\S]*?<p class="muted">)[\s\S]*?(<\/p><\/div>`;)/, '$1${escapeHtml(POLICY_COPY.level)}$2');
 source+="\ndocument.querySelectorAll('[data-policy-copy]').forEach(el=>{el.textContent=POLICY_COPY[el.dataset.policyCopy]||''});\ndocument.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice()});\n";
 return source;
}
