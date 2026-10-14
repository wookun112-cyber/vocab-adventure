// A bank shortage must never silently turn a multiple-choice task into a
// written task (or vice versa). Only authored/validated alternatives qualify.
const MULTIPLE_CHOICE=['mc_usage','mc_context','mc_reading','mc_relation','mc_structure'];
const WRITTEN=['subjective_recall','subjective_use','subjective_context','subjective_dialogue'];
export function bankFallbackTypes(type){
  if(MULTIPLE_CHOICE.includes(type))return MULTIPLE_CHOICE.filter(t=>t!==type);
  // Explicit recall and own-sentence tasks measure distinct skills. Do not
  // replace them with a weaker task merely to make the lesson start.
  if(type==='subjective_context'||type==='subjective_dialogue')return WRITTEN.filter(t=>t!==type);
  return [];
}
export function findBankFallback(plan,available){
  if(!plan?.review||plan.firstLearning||plan.needsCard||typeof available!=='function')return null;
  for(const type of bankFallbackTypes(plan.type)){
    const trial={...plan,type,stage:type==='subjective_recall'?'check':type==='subjective_use'?'use':'bridge'};
    if(available(trial))return trial;
  }
  return null;
}
