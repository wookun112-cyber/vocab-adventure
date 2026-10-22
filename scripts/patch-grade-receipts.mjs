export function patchGradeReceipts(source){
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Grade receipt anchor mismatch: '+a.slice(0,80));source=source.replace(a,b)};
 replace("async function requestGrade(job,timeout=25000,pollOnly=false){",String.raw`
function gradeReceiptKey(payload){
 // Local lookup only. The server verifies its own HMAC, account and full task hash.
 return JSON.stringify([payload.taskType,payload.targetWord,payload.definition,payload.question,payload.answer,payload.source,payload.readerLevel,payload.acceptedAnswers,payload.allowNaturalDerivations,payload.gradingContext||'',...(payload.gradingPolicy?[payload.gradingPolicy]:[])]);
}
async function requestGrade(job,timeout=25000,pollOnly=false){
 if(job.receivedGrade&&[0,.5,1].includes(job.receivedGrade.score))return job.receivedGrade;
 const gradeAccount=authUser?.id;
 const receiptStorageKey='vocab-grade-receipts-'+gradeAccount;
 const receiptRows=deviceStore.get(receiptStorageKey)?.rows||[];
 const oldReceipt=receiptRows.find(row=>row.key===gradeReceiptKey(job.payload)&&row.expires>Date.now());
`);
 replace("body:JSON.stringify({...job.payload,requestId:job.id,pollOnly,...(job.providerReceipt?{providerReceipt:job.providerReceipt}:{}),...(job.gradeReceipt?{gradeReceipt:job.gradeReceipt}:{})})", "body:JSON.stringify({...job.payload,requestId:job.id,pollOnly,...(job.gradeReceipt||oldReceipt?.receipt?{gradeReceipt:job.gradeReceipt||oldReceipt.receipt}:{}),...(job.providerReceipt||oldReceipt?.providerReceipt?{providerReceipt:job.providerReceipt||oldReceipt.providerReceipt}:{})})");
 replace(" const value=await r.json();",String.raw`
 const value=await r.json();
 if(value.providerReceipt&&authUser?.id===gradeAccount){
  job.providerReceipt=value.providerReceipt;
  const rows=[{key:gradeReceiptKey(job.payload),providerReceipt:value.providerReceipt,expires:Date.now()+6*86400000},...receiptRows.filter(row=>row.key!==gradeReceiptKey(job.payload)&&row.expires>Date.now())].slice(0,100);
  await deviceStore.set(receiptStorageKey,{account:gradeAccount,savedAt:Date.now(),rows});
  if(session?.gradingQueue?.some(pending=>pending.id===job.id)){checkpointSession();localSave();await deviceStore.flush()}
 }
`);
 replace(" return value;\n}\nfunction applyGradedAnswer",String.raw`
 job.receivedGrade=value;
 if(authUser?.id!==gradeAccount)return value;
 if(value.gradeReceipt){
  job.gradeReceipt=value.gradeReceipt;
  if(value.cachePending){
   const rows=[{key:gradeReceiptKey(job.payload),receipt:value.gradeReceipt,expires:Date.now()+6*86400000},...receiptRows.filter(row=>row.key!==gradeReceiptKey(job.payload)&&row.expires>Date.now())].slice(0,100);
   await deviceStore.set(receiptStorageKey,{account:gradeAccount,savedAt:Date.now(),rows});
  }
 }
 // Persist the already received result in the pending job before applying it.
 // A restart can deliver this grade instead of paying to compute it again.
 if(session?.gradingQueue?.some(pending=>pending.id===job.id)){checkpointSession();localSave();await deviceStore.flush()}
 return value;
}
function applyGradedAnswer`);
 replace(" const keys=['vocab-account-'+account,...['ayoung'", " const keys=['vocab-account-'+account,'vocab-grade-receipts-'+account,...['ayoung'");
 replace("showPending(e.code==='ai_credit_exhausted'","showPending(e.code==='grading_result_recovery_required'?'원래 답안을 보관하고 채점 결과를 복구하고 있어요. 다시 결제하지 않아요.':e.code==='ai_credit_exhausted'");
 return source;
}
