import {verifyUser,gradeRPC,recoverGrade} from './grade.js';
import {requireGradingAccount} from '../lib/server/grade-access.js';
import {gradeHash,readReceipt} from '../lib/server/grade-delivery.js';
import {reconcileArchivedGrade} from '../lib/server/archived-grade-recovery.js';

export function createArchivedRecovery({verify=verifyUser,rpc=gradeRPC,recover=recoverGrade}={}){
 return async(req,res)=>{
  res.setHeader?.('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
   const auth=req.headers.authorization,user=await verify(auth);
   if(!user?.id)return res.status(401).json({error:'Login required'});
   requireGradingAccount(user);
   let recovered=0,waiting=0,conflicts=0;const deadline=Date.now()+9000;
   for(const profile of ['ayoung','inseong','guest']){
    const skip=[];
    // Bounded cache-only checks. No model, lease, or paid-grade start call.
    for(let i=0;i<3&&Date.now()<deadline;i++){
     const snapshot=await rpc(auth,'read_paused_grade_recovery',{p_profile:profile,p_skip:skip},3500);
     if(!snapshot)break;
     skip.push(snapshot.job.id);
     const hash=gradeHash(snapshot.job.payload);
     let grade=await rpc(auth,'read_saved_vocab_grade',{p_hash:hash})||readReceipt(snapshot.job.gradeReceipt,user.id,hash);
     if(!grade){
       // Archived lessons also need provider-ID retrieval after a cold worker
       // restart. Never launch another paid response for the old answer.
       let status=null;
       try{status=await rpc(auth,'read_vocab_grade_status',{p_hash:hash},2500)}catch{}
       if(status?.providerResponseId&&status?.lease){
         try{
           const recovered=await recover(status.providerResponseId,snapshot.job.payload);
           if(recovered&&[0,.5,1].includes(recovered.score)&&typeof recovered.contextSuccess==='boolean'){
             const saved=await rpc(auth,'finish_vocab_grade',{p_hash:hash,p_lease:status.lease,p_result:recovered},4500);
             grade=saved===true?recovered:await rpc(auth,'read_saved_vocab_grade',{p_hash:hash},2500);
           }
         }catch{} // Still ungraded, with the original answer kept intact.
       }
     }
     if(!grade){waiting++;continue}
     const result=reconcileArchivedGrade(snapshot,grade);
     if(!result){waiting++;continue}
     const ok=await rpc(auth,'commit_paused_grade_recovery',{p_profile:profile,p_lesson_id:snapshot.lesson.id,p_job_id:snapshot.job.id,p_expected:snapshot.expected,p_learner:result.learner,p_record:result.record},5000);
     if(ok)recovered++;else {conflicts++;break}
    }
   }
   return res.status(200).json({recovered,waiting,conflicts});
  }catch(error){return res.status(error.status||503).json({code:error.code||'archive_recovery_unavailable',error:'이전 답안은 보관되어 있으며 다음 접속 때 결과를 다시 확인합니다.'})}
 };
}
export default createArchivedRecovery();
