import {patchChoiceFeedback} from './patch-choice-feedback.mjs';
import {patchInteractionSafety} from './patch-interaction-safety.mjs';
import {patchGradeReceipts} from './patch-grade-receipts.mjs';
import {patchStorageSafety} from './patch-storage-safety.mjs';
import {patchDailyRecovery} from './patch-daily-recovery.mjs';
import {patchBankCosts} from './patch-bank-costs.mjs';
// Production compatibility for a consumed cloud lesson with unsynced local completion.
// Existing answers are protected; new-day changes use the owner-scoped archive RPC.
export function patchStuckPreparation(source){
 const replace=(before,after)=>{
  const count=source.split(before).length-1;
  if(count!==1)throw new Error('Preparation patch anchor changed ('+count+'): '+before.slice(0,64));
  source=source.replace(before,after);
 };
 replace(
  "     let remote=await serverLesson(profile,null,retry),tries=0;\n     const blocked=serverPreparationError(remote);if(blocked)throw blocked;",
  `     let remote=await serverLesson(profile,null,retry),tries=0;
     if(remote?.status==='consumed'){
       if(savedLesson(profile))throw Object.assign(new Error('저장된 학습 이어하기'),{resumeAvailable:true});
       if(child().lastDate===today()){
         await cloudSave(true);
         if(!canSaveLearning()||cloudBaseline?.users?.[profile]?.lastDate!==today()){
           throw Object.assign(new Error('오늘 학습 기록을 클라우드에 저장하지 못했어요. 현재 화면의 기록은 유지됩니다. 인터넷 연결과 저장 상태를 확인해 주세요.'),{syncPending:true});
         }
         remote=await serverLesson(profile,null,false);
       }
       if(remote?.status==='consumed'){
         throw Object.assign(new Error('이전에 시작한 학습 기록과 서버 상태가 아직 일치하지 않아요. 현재 기기의 학습 기록을 보호하고 있습니다.'),{syncPending:true});
       }
     }
     const blocked=serverPreparationError(remote);if(blocked)throw blocked;`);
 replace(
  "function warmDailyQuestions(){\n if(!authUser||preparingSession||savedLesson()||(session&&current<session.target))return;\n const profile=state.selected,account=authUser.id;",
  `function warmDailyQuestions(){
 if(!authUser||preparingSession||(session&&current<session.target))return;
 const profile=state.selected,account=authUser.id;
 if(savedLesson(profile)){
  clearTimeout(preparationRetryTimer);preparationRetryTimer=null;
  if(/준비|생성/.test($('cloudPill').textContent))$('cloudPill').textContent='저장된 학습 이어하기 가능';
  renderResumeButton();return;
 }`);
 replace(
  "  if(account!==authUser?.id||profile!==state.selected)return;\n  if(error.noReviewCandidates)",
  `  if(account!==authUser?.id||profile!==state.selected)return;
  if(savedLesson(profile)||error.resumeAvailable){clearTimeout(preparationRetryTimer);preparationRetryTimer=null;$('cloudPill').textContent='저장된 학습 이어하기 가능';renderResumeButton();return}
  if(error.syncPending){clearTimeout(preparationRetryTimer);preparationRetryTimer=null;$('cloudPill').textContent='학습 기록 동기화 확인 필요';renderResumeButton();return}
  if(error.noReviewCandidates)`);
 replace(
  " }catch(e){\n   if(state.selected===profile&&authUser?.id===account){if(e.code==='ai_credit_exhausted')",
  ` }catch(error){
   let e=error;
   if(e.resumeAvailable&&savedLesson(profile)){
    try{await resumeLesson(savedLesson(profile));return}catch(resumeError){e=resumeError}
   }
   if(state.selected===profile&&authUser?.id===account){if(e.code==='ai_credit_exhausted')`);
 source=patchDailyRecovery(source);
 replace(" loadedAccount=account;\n const recovered=mergeLearnerCheckpoints();"," loadedAccount=account;cloudSaveError=null;\n const recovered=mergeLearnerCheckpoints();");
 return patchInteractionSafety(patchChoiceFeedback(patchGradeReceipts(patchStorageSafety(patchBankCosts(source)))));
}
