export function patchGradeReceipts(source){
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Grade receipt anchor mismatch: '+a.slice(0,80));source=source.replace(a,b)};
 replace("async function requestGrade(job,timeout=25000){",String.raw`
function gradeReceiptKey(payload){
 // Local lookup only. The server verifies its own HMAC, account and full task hash.
 return JSON.stringify([payload.taskType,payload.targetWord,payload.definition,payload.question,payload.answer,payload.source,payload.readerLevel,payload.acceptedAnswers,payload.allowNaturalDerivations,payload.gradingContext||'']);
}
async function requestGrade(job,timeout=25000){
 if(job.receivedGrade&&[0,.5,1].includes(job.receivedGrade.score))return job.receivedGrade;
 const gradeAccount=authUser?.id;
 const receiptStorageKey='vocab-grade-receipts-'+gradeAccount;
 const receiptRows=deviceStore.get(receiptStorageKey)?.rows||[];
 const oldReceipt=receiptRows.find(row=>row.key===gradeReceiptKey(job.payload)&&row.expires>Date.now());
`);
 replace("body:JSON.stringify({...job.payload,requestId:job.id})", "body:JSON.stringify({...job.payload,requestId:job.id,...(job.gradeReceipt||oldReceipt?.receipt?{gradeReceipt:job.gradeReceipt||oldReceipt.receipt}:{})})");
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
 replace("$('feedback').textContent=e.code==='ai_credit_exhausted'?'답안을 저장했어요.","$('feedback').textContent=e.code==='grading_result_recovery_required'?'이전 채점 결과의 복구 확인이 필요해요. 답안은 보관하고 중복 유료 채점은 하지 않습니다. 다른 문제를 풀 수 있어요.':e.code==='ai_credit_exhausted'?'답안을 저장했어요.");
 return source;
}
