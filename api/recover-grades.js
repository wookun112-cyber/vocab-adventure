import {verifyUser,gradeRPC,recoverStoredGrade} from './grade.js';
import {requireGradingAccount} from '../lib/server/grade-access.js';
import {gradeHash,readReceipt} from '../lib/server/grade-delivery.js';
import {reconcileArchivedGrade} from '../lib/server/archived-grade-recovery.js';

export function createArchivedRecovery({verify=verifyUser,rpc=gradeRPC,recover=async()=>null}={}){
 return async(req,res)=>{
  res.setHeader?.('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
   const auth=req.headers.authorization,user=await verify(auth);
   if(!user?.id)return res.status(401).json({error:'Login required'});
   requireGradingAccount(user);
   let recovered=0,waiting=0,conflicts=0;const deadline=Date.now()+9000;
   for(const profile of ['ayoung','inseong','guest','test']){
    const skip=[];
    // Bounded cache-only checks. No model, lease, or paid-grade start call.
    for(let i=0;i<3&&Date.now()<deadline;i++){
     const snapshot=await rpc(auth,'read_paused_grade_recovery',{p_profile:profile,p_skip:skip},3500);
     if(!snapshot)break;
     skip.push(snapshot.job.id);
     const hash=gradeHash(snapshot.job.payload);
     const grade=await rpc(auth,'read_saved_vocab_grade',{p_hash:hash})||readReceipt(snapshot.job.gradeReceipt,user.id,hash)||await recover(auth,snapshot.job.payload,snapshot.job.providerReceipt);
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
export default createArchivedRecovery({recover:recoverStoredGrade});
