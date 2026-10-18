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
// A completed provider result and its persistence are different states. Once
// generation starts, an expired DB lease no longer authorizes automatic rebilling.
export function createGradeDelivery({verifyUser,runGrade,gradeRPC,gradeForRequest,authorizeAccount=()=>{},authorizeTask=async()=>{},deterministicGrade=()=>null,keepAlive=()=>{},pause=sleep}){
 const outcomes=new Map();
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
   }catch{}
   if(attempt<2)await pause(100*(attempt+1));
  }
  return false;
 }
 return async function deliver(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const auth=req.headers.authorization;let lease=null,hash=null,started=false;
  try{
   const user=await verifyUser(auth);if(!user?.id)return res.status(401).json({error:'Login required'});
   authorizeAccount(user);
   const p=req.body||{};
   if(typeof p.answer!=='string'||p.answer.length>3000||typeof p.question!=='string'||!p.question||p.question.length>12000||JSON.stringify(p).length>40000)return res.status(400).json({error:'Invalid answer'});
   const exact=deterministicGrade(p);
   if(exact){
    await authorizeTask(auth,p,gradeRPC);
    return res.status(200).json({...gradeForRequest(exact,p),cached:false,cachePending:false});
   }
   hash=gradeHash(p);const key=user.id+'|'+hash;
   let known=p.gradeReceipt?readReceipt(p.gradeReceipt,user.id,hash):null;
   if(p.gradeReceipt&&!known)return res.status(400).json({code:'invalid_grade_receipt',error:'저장된 채점 결과의 확인이 필요해요. 재채점하지 않았습니다.'});
   const remembered=outcomes.get(key);
   if(!known&&remembered?.until>Date.now())known=remembered.result;
   if(p.pollOnly===true){
    // Status requests are strictly read-only, even on a cold worker or a cache miss.
    if(known)return res.status(200).json({...gradeForRequest(known,p),cached:true,cachePending:true,gradeReceipt:receipt(user.id,hash,known)});
    const status=await gradeRPC(auth,'read_vocab_grade_status',{p_hash:hash});
    if(valid(status?.result))return res.status(200).json({...gradeForRequest(status.result,p),cached:true,cachePending:false});
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
   const cached=await gradeRPC(auth,'claim_vocab_grade',{p_hash:hash});
   if(valid(cached.result))return res.status(200).json({...gradeForRequest(cached.result,p),cached:true,cachePending:false});
   if(cached.recoveryRequired)return res.status(202).json({code:'grading_result_recovery_required',error:'이미 요청한 채점 결과의 복구를 확인하고 있어요. 중복 유료 채점은 하지 않습니다.'});
   if(cached.pending)return res.status(202).json({code:'grading_pending'});
   lease=cached.lease;if(!lease)throw Error('Grade lease unavailable');
   await authorizeTask(auth,p,gradeRPC);
   if(!process.env.OPENAI_API_KEY)throw Error('AI not configured');
   if(await gradeRPC(auth,'start_vocab_grade',{p_hash:hash,p_lease:lease})!==true)throw Error('Grade lease changed before generation');
   started=true;
   const work=(async()=>{
    const result=await runGrade(p);if(!valid(result))throw Error('Invalid grade result');
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
   if(lease&&definiteFailure)await gradeRPC(auth,'finish_vocab_grade',{p_hash:hash,p_lease:lease,p_result:null}).catch(()=>{});
   if(error?.status&&error?.code)return res.status(error.status).json({code:error.code,error:message});
   if(/GRADE_DAILY_LIMIT|GRADE_RATE_LIMIT|GRADE_CONCURRENCY_LIMIT/.test(message))return res.status(429).json({code:/GRADE_DAILY_LIMIT/.test(message)?'grading_daily_limit':'grading_rate_limit',error:/GRADE_DAILY_LIMIT/.test(message)?'오늘의 유료 채점 보호 한도에 도달했어요. 답안을 보관하고 다음 날 확인합니다.':'여러 답안을 확인 중이에요. 저장된 답안은 잠시 뒤 다시 확인합니다.'});
   if(/credit_balance_exhausted|insufficient_quota/.test(message))return res.status(503).json({code:'ai_credit_exhausted',error:'채점 잔액 확인이 필요해요. 제출한 답안은 저장되어 있어요.'});
   if(started&&!definiteFailure)return res.status(202).json({code:'grading_result_recovery_required',error:'이전 채점 요청의 결과를 확인해야 해요. 중복 유료 요청을 중단하고 답안을 보관합니다.'});
   return res.status(503).json({code:'grading_temporarily_unavailable',error:'채점을 잠시 뒤 다시 시도해요.'});
  }
 };
}
