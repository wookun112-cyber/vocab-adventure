import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const valid=result=>!!result&&[0,.5,1].includes(result.score)&&typeof result.contextSuccess==='boolean';
export const gradeHash=p=>createHash('sha256').update(JSON.stringify(['usage-grade-12.16.24',process.env.OPENAI_MODEL||'gpt-6-luna',p.taskType,p.targetWord,p.definition,p.question,p.answer,p.source,p.readerLevel,p.acceptedAnswers,p.allowNaturalDerivations,p.gradingContext||'',...(p.gradingPolicy?[p.gradingPolicy]:[])])).digest('hex');
const signingKey=()=>{
 const secret=process.env.VOCAB_GRADE_RECEIPT_SECRET||process.env.OPENAI_API_KEY;
 if(!secret)throw Error('Receipt signing unavailable');
 return createHmac('sha256',secret).update('vocab-grade-receipt-12.16.28').digest();
};
function receipt(owner,hash,result){
 const body=Buffer.from(JSON.stringify({v:1,owner,hash,result,expires:Date.now()+7*86400000})).toString('base64url');
 return body+'.'+createHmac('sha256',signingKey()).update(body).digest('base64url');
}
export function readReceipt(token,owner,hash){
 if(typeof token!=='string'||token.length>24000)return null;
 try{
  const [body,signature,...rest]=token.split('.');if(!body||!signature||rest.length)return null;
  const expected=createHmac('sha256',signingKey()).update(body).digest(),actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
  const data=JSON.parse(Buffer.from(body,'base64url'));
  return data.v===1&&data.owner===owner&&data.hash===hash&&data.expires>Date.now()&&valid(data.result)?data.result:null;
 }catch{return null}
}
function providerReceipt(owner,hash,handle){
 const body=Buffer.from(JSON.stringify({v:2,kind:'provider',owner,hash,id:handle.id,lease:handle.lease,expires:Date.now()+7*86400000})).toString('base64url');
 return body+'.'+createHmac('sha256',signingKey()).update(body).digest('base64url');
}
export function readProviderReceipt(token,owner,hash){
 if(typeof token!=='string'||token.length>4000)return null;
 try{
  const [body,signature,...rest]=token.split('.');if(!body||!signature||rest.length)return null;
  const expected=createHmac('sha256',signingKey()).update(body).digest(),actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
  const data=JSON.parse(Buffer.from(body,'base64url'));
  return data.v===2&&data.kind==='provider'&&data.owner===owner&&data.hash===hash&&data.expires>Date.now()&&/^resp_[a-zA-Z0-9_-]+$/.test(data.id)&&/^[a-f0-9-]{36}$/i.test(data.lease)?data:null;
 }catch{return null}
}
// A completed provider result and its persistence are different states. Once
// generation starts, an expired DB lease no longer authorizes automatic rebilling.
export function createGradeDelivery({verifyUser,runGrade,gradeRPC,gradeForRequest,authorizeAccount=()=>{},authorizeTask=async()=>{},deterministicGrade=()=>null,keepAlive=()=>{},pause=sleep,provider=null}){
 const outcomes=new Map(),providerHandles=new Map();
 function retain(key,result,lease){
  for(const [k,v] of outcomes)if(v.until<Date.now())outcomes.delete(k);
  if(outcomes.size>=256)outcomes.delete(outcomes.keys().next().value);
  outcomes.set(key,{result,lease,until:Date.now()+15*60000});
 }
 async function persist(auth,hash,lease,result){
  const deadline=Date.now()+7000;
  for(let attempt=0;attempt<3&&Date.now()<deadline;attempt++){
   try{
    if(await gradeRPC(auth,'finish_vocab_grade',{p_hash:hash,p_lease:lease,p_result:result},Math.max(250,Math.min(2000,deadline-Date.now())))===true)return true;
    // A lost acknowledgement may hide a successful commit. Read it rather
    // than assuming failure or replacing a result written by another worker.
    if(Date.now()>=deadline)break;
    const check=await gradeRPC(auth,'claim_vocab_grade',{p_hash:hash},Math.max(250,Math.min(2000,deadline-Date.now())));
    if(valid(check.result))return true;
    if(check.recoveryRequired&&check.lease)lease=check.lease;
   }catch(error){console.warn(JSON.stringify({event:'vocab_grade_stage',stage:'result_store',code:error.code||error.name||'storage_error',attempt:attempt+1}))}
   if(attempt<2)await pause(100*(attempt+1));
  }
  return false;
 }
 function rememberProvider(key,handle){
  if(providerHandles.size>=256&&!providerHandles.has(key))providerHandles.delete(providerHandles.keys().next().value);
  providerHandles.set(key,{...handle,until:Date.now()+3600000});
 }
 async function checkpointProvider(auth,key,hash,lease,response){
  const previous=providerHandles.get(key);
  const handle={id:response.id,lease,response};rememberProvider(key,handle);
  if(previous?.saved&&previous.id===response.id&&previous.response?.status===response.status)return handle;
  for(let attempt=0;attempt<2;attempt++){
   try{
    const saved=await gradeRPC(auth,'record_vocab_grade_response',{p_hash:hash,p_lease:lease,p_response:response},3000);
    if(saved===true){rememberProvider(key,{...handle,saved:true});return handle}
   }catch(error){console.warn(JSON.stringify({event:'vocab_grade_stage',stage:'provider_checkpoint',code:error.code||error.name||'storage_error',attempt:attempt+1}))}
  }
  return handle; // The signed provider receipt is a separate device recovery path.
 }
 async function recoverProvider(auth,user,hash,p,handle){
  const key=user.id+'|'+hash;
  const onResponse=response=>checkpointProvider(auth,key,hash,handle.lease,response);
  const result=['completed','incomplete','failed','cancelled'].includes(handle.response?.status)?await provider.decode(p,handle.response):await provider.retrieve(p,handle.id,{onResponse});
  if(!valid(result))throw Error('Invalid recovered grade');
  retain(key,result,handle.lease);
  const saved=await persist(auth,hash,handle.lease,result);
  return {...gradeForRequest(result,p),cached:true,cachePending:!saved,gradeReceipt:receipt(user.id,hash,result)};
 }
 return async function deliver(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const auth=req.headers.authorization;let lease=null,hash=null,started=false,providerHandle=null,gradeOwner=null;
  try{
   const user=await verifyUser(auth);if(!user?.id)return res.status(401).json({error:'Login required'});
   authorizeAccount(user);gradeOwner=user.id;
   const p=req.body||{};
   if(typeof p.answer!=='string'||p.answer.length>3000||typeof p.question!=='string'||!p.question||p.question.length>12000||JSON.stringify(p).length>40000)return res.status(400).json({error:'Invalid answer'});
   const exact=deterministicGrade(p);
   if(exact){
    await authorizeTask(auth,p,gradeRPC);
    return res.status(200).json({...gradeForRequest(exact,p),cached:false,cachePending:false});
   }
   hash=gradeHash(p);const key=user.id+'|'+hash;
   if(provider){
    const local=providerHandles.get(key);
    providerHandle=p.providerReceipt?readProviderReceipt(p.providerReceipt,user.id,hash):local?.until>Date.now()?local:null;
    if(p.providerReceipt&&!providerHandle)return res.status(400).json({code:'invalid_provider_receipt',error:'이전 요청 확인 정보가 올바르지 않아요. 새 채점은 실행하지 않았습니다.'});
   }
   let known=p.gradeReceipt?readReceipt(p.gradeReceipt,user.id,hash):null;
   if(p.gradeReceipt&&!known)return res.status(400).json({code:'invalid_grade_receipt',error:'저장된 채점 결과의 확인이 필요해요. 재채점하지 않았습니다.'});
   const remembered=outcomes.get(key);
   if(!known&&remembered?.until>Date.now())known=remembered.result;
   if(known&&provider){
    let saved=false;lease=remembered?.lease||providerHandle?.lease;
    try{const cached=await gradeRPC(auth,'claim_vocab_grade',{p_hash:hash});if(valid(cached.result))saved=true;else lease=cached.lease||lease}catch{}
    if(!saved&&lease)saved=await persist(auth,hash,lease,known);
    retain(key,known,lease);
    return res.status(200).json({...gradeForRequest(known,p),cached:true,cachePending:!saved,gradeReceipt:receipt(user.id,hash,known)});
   }
   if(p.pollOnly===true){
    // Legacy/cache-miss status reads do not claim or start work. Durable jobs
    // may retrieve and persist the original provider response, never a new POST.
    if(known)return res.status(200).json({...gradeForRequest(known,p),cached:true,cachePending:true,gradeReceipt:receipt(user.id,hash,known)});
    let status;
    try{status=await gradeRPC(auth,'read_vocab_grade_status',{p_hash:hash})}catch(error){if(!providerHandle)throw error}
    if(valid(status?.result))return res.status(200).json({...gradeForRequest(status.result,p),cached:true,cachePending:false});
    if(provider&&status?.providerId)providerHandle={id:status.providerId,lease:status.lease,response:status.providerResponse};
    if(provider&&providerHandle){lease=providerHandle.lease;started=true;return res.status(200).json(await recoverProvider(auth,user,hash,p,providerHandle))}
    const code=status?.status==='retryable'?'grading_retryable':status?.status==='recovery_required'?'grading_result_recovery_required':'grading_pending';
    return res.status(202).json({code});
   }
   if(known){
    let saved=false;lease=remembered?.lease;
    try{const cached=await gradeRPC(auth,'claim_vocab_grade',{p_hash:hash});if(valid(cached.result))saved=true;else lease=cached.lease||lease}catch{}
    if(!saved&&lease)saved=await persist(auth,hash,lease,known);
    retain(key,known,lease);
    return res.status(200).json({...gradeForRequest(known,p),cached:true,cachePending:!saved,gradeReceipt:receipt(user.id,hash,known)});
   }
   if(provider&&providerHandle){lease=providerHandle.lease;started=true;return res.status(200).json(await recoverProvider(auth,user,hash,p,providerHandle))}
   const cached=await gradeRPC(auth,'claim_vocab_grade',{p_hash:hash});
   if(provider&&(cached.recoveryRequired||cached.pending)){
    const status=await gradeRPC(auth,'read_vocab_grade_status',{p_hash:hash});
    if(valid(status?.result))return res.status(200).json({...gradeForRequest(status.result,p),cached:true,cachePending:false});
    if(status?.providerId){providerHandle={id:status.providerId,lease:status.lease,response:status.providerResponse};lease=providerHandle.lease;started=true;return res.status(200).json(await recoverProvider(auth,user,hash,p,providerHandle))}
   }
   if(valid(cached.result))return res.status(200).json({...gradeForRequest(cached.result,p),cached:true,cachePending:false});
   if(cached.recoveryRequired)return res.status(202).json({code:'grading_result_recovery_required',error:'이미 요청한 채점 결과의 복구를 확인하고 있어요. 중복 유료 채점은 하지 않습니다.'});
   if(cached.pending)return res.status(202).json({code:'grading_pending'});
   lease=cached.lease;if(!lease)throw Error('Grade lease unavailable');
   await authorizeTask(auth,p,gradeRPC);
   if(!process.env.OPENAI_API_KEY)throw Error('AI not configured');
   if(await gradeRPC(auth,'start_vocab_grade',{p_hash:hash,p_lease:lease})!==true)throw Error('Grade lease changed before generation');
   started=true;
   const work=(async()=>{
    const result=provider?await provider.start(p,{onResponse:async response=>{providerHandle=await checkpointProvider(auth,key,hash,lease,response)}}):await runGrade(p);if(!valid(result))throw Error('Invalid grade result');
    retain(key,result,lease);
    const saved=await persist(auth,hash,lease,result);
    return {...gradeForRequest(result,p),cachePending:!saved,gradeReceipt:receipt(user.id,hash,result)};
   })();
   // Continue bounded result persistence even when the browser's short UI wait
   // ends. This is not an unlimited worker and does not extend maxDuration.
   keepAlive(work.catch(()=>{}));
   return res.status(200).json(await work);
  }catch(error){
   const message=String(error?.message||error);
   const definiteFailure=!started||/OpenAI 4\d\d:/.test(message);
   if(provider&&lease&&error.code!=='grading_provider_pending'){
    const code=(typeof error.code==='string'?error.code:error.name||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);
    const stage=!started?'dispatch':!providerHandle?'provider_create':/incomplete|invalid|failed/.test(code)?'provider_parse':'provider_lookup';
    await gradeRPC(auth,'record_vocab_grade_failure',{p_hash:hash,p_lease:lease,p_stage:stage,p_code:code},2500).catch(()=>{});
   }

   if(lease&&definiteFailure)await gradeRPC(auth,'finish_vocab_grade',{p_hash:hash,p_lease:lease,p_result:null}).catch(()=>{});
   if(error?.status&&error?.code)return res.status(error.status).json({code:error.code,error:message});
   if(/GRADE_DAILY_LIMIT|GRADE_RATE_LIMIT|GRADE_CONCURRENCY_LIMIT/.test(message))return res.status(429).json({code:/GRADE_DAILY_LIMIT/.test(message)?'grading_daily_limit':'grading_rate_limit',error:/GRADE_DAILY_LIMIT/.test(message)?'오늘의 유료 채점 보호 한도에 도달했어요. 답안을 보관하고 다음 날 확인합니다.':'여러 답안을 확인 중이에요. 저장된 답안은 잠시 뒤 다시 확인합니다.'});
   if(/credit_balance_exhausted|insufficient_quota/.test(message))return res.status(503).json({code:'ai_credit_exhausted',error:'채점 잔액 확인이 필요해요. 제출한 답안은 저장되어 있어요.'});
   if(providerHandle&&started&&!definiteFailure){
    const terminal=['grading_provider_incomplete','grading_provider_failed','grading_provider_expired','grading_provider_invalid_grade','grading_provider_invalid_json'].includes(error.code);
    console.warn(JSON.stringify({event:'vocab_grade_stage',stage:'provider_resume',code:error.code||error.name||'unknown',recoverable:!terminal}));
    return res.status(202).json({code:terminal?'grading_result_recovery_required':'grading_pending',causeCode:error.code||'provider_transport',providerReceipt:providerReceipt(gradeOwner,hash,providerHandle)});
   }
   if(started&&!definiteFailure)return res.status(202).json({code:'grading_result_recovery_required',error:'이전 채점 요청의 결과를 확인해야 해요. 중복 유료 요청을 중단하고 답안을 보관합니다.'});
   return res.status(503).json({code:'grading_temporarily_unavailable',error:'채점을 잠시 뒤 다시 시도해요.'});
  }
 };
}
