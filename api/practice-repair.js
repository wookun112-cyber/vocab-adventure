import {approvedRemediation} from './practice-pool.js';
const URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
// Read-only recovery of an approved bank item. No generation, grading or writes.
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const auth=req.headers.authorization;
 if(!auth?.startsWith('Bearer '))return res.status(401).json({error:'Login required'});
 try{
  const r=await fetch(URL+'/auth/v1/user',{headers:{apikey:KEY,Authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return res.status(401).json({error:'Login required'});
  const user=await r.json(),plan=req.body?.plan;
  if(!user.id||!plan?.w||!plan.sentenceCyclePolicy||!['mc_context','mc_usage'].includes(plan.type))return res.status(400).json({error:'Invalid remediation plan'});
  const learner={difficulty:Math.max(1,Math.min(9,Number(req.body.readerLevel)||2)),words:{}};
  const question=approvedRemediation(plan,learner,user.id);
  if(!question)return res.status(409).json({error:'Approved bank item unavailable'});
  res.setHeader('Cache-Control','private, no-store');
  return res.status(200).json({question});
 }catch{return res.status(503).json({error:'Bank recovery unavailable'})}
}
