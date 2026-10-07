import {LEARNING_MODEL} from '../lib/learning-model.js';
import {waitUntil} from '@vercel/functions';
import {buildValidated} from './questions.js';
import {makePreparedPlan,learnerSnapshot,generationItems,browserQuestion,passageKeys} from '../lib/prepared-plan.js';
const URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function rpc(name,args){
 const r=await fetch(URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Preparation storage '+r.status);
 return r.json();
}
const generatePrepared=(items,recent,initialFeedback)=>buildValidated(items,recent,{maxAttempts:1,partial:true,initialFeedback});
export async function prepare(job,key,generate=generatePrepared,call=rpc){
 const recovering=job.payload?.resumeId&&job.payload.resumeId===job.learner.activeLesson?.id&&job.payload.account===job.account&&job.payload.profile===job.profile;
 let payload=(recovering||(job.payload?.engine===LEARNING_MODEL&&job.payload?.budget?.policy==='daily-3-20-25'&&job.payload?.snapshot===learnerSnapshot(job.learner)))&&job.payload?.plans?.length===20?job.payload:makePreparedPlan(job.learner,job.catalog,job.curriculum,job.account,job.profile);
 if(recovering)payload.snapshot=learnerSnapshot(job.learner);
 const failureFeedback=f=>[...f.issues,...(f.context?['이전 실패 지문: '+f.context]:[]),...(f.prompt?['이전 실패 질문: '+f.prompt]:[])];
 const feedback=Object.fromEntries((payload.preparationIssues||[]).map(f=>[f.id,failureFeedback(f)]));
 delete payload.preparationError;delete payload.preparationIssues;
 let checkpoint=Promise.resolve(),obsolete=false;
 const save=failed=>{
  const copy=JSON.parse(JSON.stringify(payload));
  checkpoint=checkpoint.then(async()=>{
   if(obsolete)return;
   const ok=await call('save_preparation',{p_id:job.id,p_key:key,p_lease:job.lease,p_payload:copy,p_failed:failed});
   if(!ok){obsolete=true;throw Error('Preparation superseded')}
  });
  return checkpoint;
 };
 try{
  await save(false);
  const ready=new Map(payload.ready||[]),remaining=payload.plans.map((p,i)=>[i,p]).filter(([i])=>!ready.has(i));
  const groups=[];for(let i=0;i<remaining.length;i+=4)groups.push(remaining.slice(i,i+4));
  let cursor=0,duplicates=false;
  const work=async()=>{
   while(cursor<groups.length&&!obsolete){
    const group=groups[cursor++];
    let missing=group;
    for(let attempt=0;attempt<(remaining.length<=4?3:2)&&missing.length;attempt++){
     const known=[...ready];
     const items=generationItems(missing.map(([,p])=>p),job.learner,known);
     const questions=await generate(items,[...(job.learner.recentProblems||[]),...known.map(([,q])=>q.signature)].slice(-40),feedback);
     if(questions.failed?.length){payload.preparationIssues=[...(payload.preparationIssues||[]),...questions.failed];for(const f of questions.failed)feedback[f.id]=failureFeedback(f)}
     if(obsolete)return;
     const retry=[];
     for(const [i,p] of missing){
      const raw=questions.find(q=>String(q.id)===p.id);
      if(!raw){retry.push([i,p]);continue}
      if(!raw?.validation?.aiVerified||!raw.validation.deterministic||!raw.validation.checks?.coherentSituation)throw Error('Unverified prepared question');
      const q=browserQuestion(raw,p);
      const used=new Set([...(job.learner.words?.[p.w.w]?.usedPassageKeys||[]),...[...ready.values()].filter(v=>v.w.w===p.w.w).flatMap(v=>passageKeys(v.ctx,v.opts.map(o=>o.t)))]);
      if(passageKeys(q.ctx,q.opts.map(o=>o.t)).some(k=>used.has(k))){duplicates=true;feedback[p.id]=['이미 사용한 문장이 중복되었습니다. 이전 문장을 재사용하지 말고 다른 사건으로 새 지문을 작성하세요.','이전 실패 지문: '+q.ctx];retry.push([i,p]);continue}
      ready.set(i,q);
     }
     payload.ready=[...ready].sort(([a],[b])=>a-b);
     await save(false);
     missing=retry;
    }
   }
  };
  const results=await Promise.allSettled(Array.from({length:Math.min(3,groups.length)},work));
  const failed=results.find(r=>r.status==='rejected');
  if(failed)throw failed.reason;
  if(payload.ready.length<20)throw Error(duplicates?'Repeated sentence withheld':'Incomplete validated preparation');
 }catch(error){
  if(!obsolete){payload.preparationError=String(error?.message||error).slice(0,1000);checkpoint=checkpoint.catch(()=>{});await save(true)}
  throw error;
 }
 return payload;
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const id=req.body?.id,key=req.headers['x-preparation-key'];
 if(!uuid(id)||!uuid(key))return res.status(401).json({error:'Unauthorized'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'AI not configured'});
 try{
  const job=await rpc('claim_preparation',{p_id:id,p_key:key});
  if(!job)return res.status(202).json({accepted:false});
  waitUntil(prepare(job,key).catch(error=>{console.error(JSON.stringify({event:'preparation_retry',profile:job.profile,reason:String(error?.message||error).slice(0,300)}))}));
  return res.status(202).json({accepted:true});
 }catch{return res.status(503).json({error:'Preparation unavailable'})}
}
