// Display the actual bank-only state. Never report ongoing AI generation when
// automatic authoring is disabled, and never erase a learner's saved answers.
export function patchBankCosts(source){
 const replace=(before,after)=>{
  if(source.split(before).length!==2)throw Error('Bank cost patch anchor changed: '+before.slice(0,70));
  source=source.replace(before,after);
 };
 replace('function serverPreparationError(remote){return ',
  "function serverPreparationError(remote){if(remote?.payload?.preparationBlocked==='bank_supply_required')return Object.assign(new Error('검수된 문항의 사전 보충이 필요해요. 준비된 문제와 학습 기록은 보관하며 유료 자동 생성은 하지 않아요.'),{code:'bank_supply_required'});return ");
 replace("  if(error.noReviewCandidates){$('cloudPill').textContent=",
  "  if(error.code==='bank_supply_required'){clearTimeout(preparationRetryTimer);preparationRetryTimer=null;$('cloudPill').textContent='검수 문항 보충 필요';renderResumeButton();return}\n  if(error.noReviewCandidates){$('cloudPill').textContent=");
 return source;
}
