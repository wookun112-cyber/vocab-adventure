export function patchChoiceFeedback(source){
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Choice feedback anchor mismatch: '+a.slice(0,80));source=source.replace(a,b)};
 const runtime=String.raw`
// Every registered MC source can recover reasons; no per-word allowlist.
const choiceFeedbackRequests=new Map();
async function recoverStoredChoiceFeedback(q,selected,active,index,record){
 if(!q.opts?.length||selected.reason)return;
 const account=active.account,key=account+'|'+q.signature+'|'+q.q+'|'+q.ctx;
 let pending=choiceFeedbackRequests.get(key);
 if(!pending){
  pending=(async()=>{
   const {data}=await sb.auth.getSession();const token=data.session?.access_token;if(!token)return [];
   const question={w:{w:q.w.w,d:q.w.d},type:q.type,q:q.q,ctx:q.ctx,opts:q.opts.map(o=>({t:o.t,ok:o.ok})),authored:q.authored};
   const r=await fetch('/api/choice-feedback',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({question}),signal:AbortSignal.timeout(4000)});
   if(!r.ok)return [];const value=await r.json();return Array.isArray(value.reasons)?value.reasons:[];
  })().catch(()=>[]);
  if(choiceFeedbackRequests.size>=50)choiceFeedbackRequests.delete(choiceFeedbackRequests.keys().next().value);
  choiceFeedbackRequests.set(key,pending);
 }
 const reasons=await pending;
 if(!reasons.length&&choiceFeedbackRequests.get(key)===pending)choiceFeedbackRequests.delete(key);
 if(session!==active||authUser?.id!==account||active.results[index]!==record)return;
 if(!reasons.length&&current===index){
  let retry=$('retryChoiceFeedback');
  if(!retry){retry=document.createElement('button');retry.id='retryChoiceFeedback';retry.className='secondary';$('feedback').appendChild(retry)}
  retry.textContent='해설 다시 불러오기';retry.disabled=false;
  retry.onclick=async()=>{retry.disabled=true;await recoverStoredChoiceFeedback(q,selected,active,index,record);retry.disabled=false;};
  return;
 }
 for(const option of q.opts){const row=reasons.find(r=>r.text===option.t&&typeof r.reason==='string');if(row)option.reason=row.reason}
 if(!selected.reason)return;
 if(current===index)$('retryChoiceFeedback')?.remove();
 record.feedback=(selected.reason+' '+(q.feedbackCorrect||'')).slice(0,800);
 if(current===index){const text=$('feedback').querySelector?.('.feedback-explanation p');if(text)text.textContent=record.feedback}
 checkpointSession();localSave();cloudSave();
}
`;
 replace('async function gradeCurrent(dontKnow){',runtime+'\nasync function gradeCurrent(dontKnow){');
 replace('const rec={rawAnswer:meta.rawAnswer??normalized,',"const rec={...(meta.selectedOptionText?{selectedOptionText:meta.selectedOptionText}:{}),rawAnswer:meta.rawAnswer??normalized,");
 replace("   applyResult(q,ok?'○':'×',feedback,'',{\n     credit:ok?1:0,contextSuccess:ok,targetRecall:false,independent:ok&&!hintUsed,hintUsed,revealed:false\n   });\n   return;",
 "   const answeredIndex=current;\n   applyResult(q,ok?'○':'×',feedback,'',{\n     credit:ok?1:0,contextSuccess:ok,targetRecall:false,independent:ok&&!hintUsed,hintUsed,revealed:false,rawAnswer:selected.t,selectedOptionText:selected.t\n   });\n   if(!ok&&!selected.reason)void recoverStoredChoiceFeedback(q,selected,active,answeredIndex,active.results[answeredIndex]);\n   return;");
 return source;
}
