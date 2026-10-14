// Public revision metadata only; all question texts stay in server API modules.
export const AUTHORED_REVISION='vocab-bank-20261014-level5-6-v1';
export const AUTHORED_LEVEL_FOUR_REVISION='vocab-bank-20261013-level4-v1';
export const AUTHORED_ESSENTIAL_REVISION='vocab-bank-20261012-essential-v1';
export const AUTHORED_LEGACY_REVISION='vocab-bank-20261008-1-2-3-7-8-v1';
export const AUTHORED_LEVEL_NINE_REVISION='vocab-bank-20261014-level9-v1';
export const AUTHORED_OFFLINE_REVISION='vocab-bank-offline-20261014-v1';
export const AUTHORED_REVISIONS=[AUTHORED_OFFLINE_REVISION,AUTHORED_LEVEL_NINE_REVISION,AUTHORED_REVISION,AUTHORED_LEVEL_FOUR_REVISION,AUTHORED_ESSENTIAL_REVISION,AUTHORED_LEGACY_REVISION];
export const AUTHORED_OWNER='06c78577-b96e-4919-b979-58683ff5946e';
export function authoredQuestionValid(q,account){
 const a=q?.authored,v=q?.validation;
 return account===AUTHORED_OWNER&&a?.owner===account&&AUTHORED_REVISIONS.includes(a.revision)&&a.word===q.w?.w&&
  Number.isInteger(a.slot)&&a.slot>=1&&a.slot<=10&&v?.source==='authored_bank'&&v.sourceRevision===a.revision&&v.schemaChecked===true&&v.deterministic===true&&v.aiVerified===false&&
  (a.slot<=3?q.type==='mc_context':a.slot<=6?q.type==='mc_usage':a.slot<=9?q.type==='subjective_recall':q.type==='subjective_use')&&
  (q.type.startsWith('mc_')?q.opts?.length===5&&q.opts.filter(o=>o.ok).length===1&&new Set(q.opts.map(o=>o.t)).size===5:!q.opts?.length)&&
  (q.type!=='subjective_use'||(q.ctx===''&&q.acceptedAnswers?.length===0&&q.semanticGraderRequired===true));
}
