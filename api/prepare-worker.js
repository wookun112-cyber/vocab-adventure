import {DAILY_POLICY} from '../lib/daily-practice.js';
import {LEARNING_MODEL,QUESTION_POLICY,isLearningTarget,SELECTION_POLICY,inTargetBand,REVIEW_POLICY,reviewFloor,calibratedWord} from '../lib/learning-model.js';
import {waitUntil} from '@vercel/functions';
import {buildValidated} from './questions.js';
import {makePreparedPlan,learnerSnapshot,generationItems,browserQuestion,passageKeys} from '../lib/prepared-plan.js';
import {hydrateFromBank,withReservedHistory,bankCompatible} from '../lib/question-bank.js';
import {authoredCurriculum,authoredEntry,authoredAvailability} from './authored-bank.js';
import {AUTHORED_REVISION} from '../lib/authored-policy.js';
import {sentenceUseQuestion,sentenceUseQuestionValid} from '../lib/sentence-use-template.js';
const URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function rpc(name,args){
 const r=await fetch(URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Preparation storage '+r.status);
 return r.json();
}
const generatePrepared=async(items,recent,initialFeedback)=>{
 const questions=[],missing=[];
 for(const item of items){const q=sentenceUseQuestion(item);if(q)questions.push(q);else missing.push(item)}
 if(missing.length){const generated=await buildValidated(missing,recent,{maxAttempts:1,partial:true,initialFeedback});questions.push(...generated);questions.failed=generated.failed}
 return questions;
};
export function reviewSupply(job,curriculum){
 const supply=authoredAvailability(job.learner,job.account,job.reserved||[]);
 for(const row of curriculum){
  const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain}),st=job.learner.words?.[row.word];
  if(!st?.seen&&!st?.introducedAt)continue;
  const used=new Set([...(st.usedPassageKeys||[]),...(st.problemHistory||[]).flatMap(h=>passageKeys(h.context,h.options||[])),...(job.reserved||[]).filter(q=>q.w?.w===w.w).flatMap(q=>passageKeys(q.ctx,(q.opts||[]).map(o=>o.t)))]);
  const taskDemand=w.band<reviewFloor(job.learner.difficulty)?'foundation-review':job.learner.difficulty>4.5?'advanced':'standard';
  if(['mc_usage','subjective_recall','subjective_use'].every(type=>(job.bank||[]).some(e=>bankCompatible(e,{w,type,taskDemand,supportLevel:st.supportLevel||0,needsCard:false},job.learner,job.account)&&!passageKeys(e.question.ctx,(e.question.opts||[]).map(o=>o.t)).some(k=>used.has(k)))))supply.review.add(w.w);
 }
 return supply;
}
export async function prepare(job,key,generate=generatePrepared,call=rpc){
 const recovering=job.payload?.resumeId&&job.payload.resumeId===job.learner.activeLesson?.id&&job.payload.account===job.account&&job.payload.profile===job.profile;
 const curriculum=[...(job.curriculum||[]),...authoredCurriculum(job.account)];
 let payload=recovering?job.payload:((job.payload?.reviewPolicy===REVIEW_POLICY&&job.payload?.engine===LEARNING_MODEL&&job.payload?.questionPolicy===QUESTION_POLICY&&job.payload?.selectionPolicy===SELECTION_POLICY&&job.payload?.budget?.policy===DAILY_POLICY&&job.payload?.snapshot===learnerSnapshot(job.learner)&&job.payload?.plans?.length>0&&job.payload.plans.every(p=>isLearningTarget(p.w?.w,p.w?.cat,p.w?.band)&&(p.review||inTargetBand(p.w,job.learner.difficulty))))?job.payload:makePreparedPlan(job.learner,job.catalog,curriculum,job.account,job.profile,{reviewOnly:job.kind==='reserve',supplyPreference:reviewSupply(job,curriculum)}));
 const generationLearner=withReservedHistory(job.learner,job.reserved||[]);
 if(job.kind==='reserve'){payload.reserve=true;payload.reserveSlot=job.slot;}
 payload.bankRevision=AUTHORED_REVISION;
 if(!recovering)payload.reviewPolicy=REVIEW_POLICY;
 payload.supplySelection='due-first-bank-ties-12.16.4';
 if(payload.budget?.waitingForReviews)payload.budget.waitingStudiedTotal=Object.values(job.learner.words||{}).filter(s=>s.seen||s.introducedAt).length;
 const authored=[];
 for(const [i,plan] of payload.plans.entries()){
  if((payload.ready||[]).some(([at])=>at===i))continue;
  const reserved=[...(job.reserved||[]),...authored.map(e=>e.question)];
  const cached=trial=>hydrateFromBank({account:job.account,plans:[trial],ready:[]},job.learner,job.bank||[],reserved)>0;
  let e=authoredEntry(plan,job.learner,job.account,reserved);
  // Keep the due target even when one question type has run out of fresh
  // sentences. Try another supplied type before requesting live generation.
  // Interrupted lessons retain their exact original tasks.
  if(!e&&!recovering&&plan.review&&!cached(plan)){
   for(const type of ['subjective_recall','subjective_use','mc_usage','mc_reading','mc_relation','mc_context'].filter(t=>t!==plan.type)){
    const trial={...plan,type,stage:type==='subjective_recall'?'check':type==='subjective_use'?'use':'bridge'};
    const alternative=authoredEntry(trial,job.learner,job.account,reserved);
    if(alternative||cached(trial)){Object.assign(plan,trial);e=alternative;break}
   }
  }
  if(e)authored.push(e);
 }
 hydrateFromBank(payload,job.learner,[...authored,...(job.bank||[])],job.reserved||[]);
 const supplied=new Map(payload.ready||[]);
 for(const [i,plan] of payload.plans.entries()){
  if(supplied.has(i))continue;
  const raw=sentenceUseQuestion(generationItems([plan],generationLearner)[0]);
  if(!raw)continue;
  const q=browserQuestion(raw,plan);
  q.bankReaderLevel=Number(job.learner.difficulty)||2;q.bankSupportLevel=plan.supportLevel||0;q.bankPassageKeys=[];
  if(!sentenceUseQuestionValid(q,plan))throw Error('Invalid sentence-use template');
  supplied.set(i,q);
 }
 payload.ready=[...supplied].sort(([a],[b])=>a-b);
 if(recovering)payload.snapshot=learnerSnapshot(job.learner);
 const failureFeedback=f=>[...f.issues,...(f.context?['이전 실패 지문: '+f.context]:[]),...(f.prompt?['이전 실패 질문: '+f.prompt]:[])];
 const feedback=Object.fromEntries((payload.preparationIssues||[]).map(f=>[f.id,failureFeedback(f)]));
 delete payload.preparationError;delete payload.preparationIssues;delete payload.preparationBlocked;
 let checkpoint=Promise.resolve(),obsolete=false;
 const save=failed=>{
  const copy=JSON.parse(JSON.stringify(payload));
  checkpoint=checkpoint.then(async()=>{
   if(obsolete)return;
   const ok=await call(job.kind==='reserve'?'save_reserve_preparation':'save_preparation',{p_id:job.id,p_key:key,p_lease:job.lease,p_payload:copy,p_failed:failed});
   if(!ok){obsolete=true;throw Error('Preparation superseded')}
  });
  return checkpoint;
 };
 try{
  await save(false);
  const ready=new Map(payload.ready||[]),remaining=payload.plans.map((p,i)=>[i,p]).filter(([i])=>!ready.has(i));
  const groupSize=remaining.some(([,p])=>p.taskDemand==='advanced')?2:4;
  const groups=[];for(let i=0;i<remaining.length;i+=groupSize)groups.push(remaining.slice(i,i+groupSize));
  let cursor=0,duplicates=false;
  const work=async()=>{
   while(cursor<groups.length&&!obsolete){
    const group=groups[cursor++];
    let missing=group;
    for(let attempt=0;attempt<(remaining.length<=4?3:2)&&missing.length;attempt++){
     const known=[...ready];
     const items=generationItems(missing.map(([,p])=>p),generationLearner,known);
     const questions=await generate(items,[...(job.learner.recentProblems||[]),...known.map(([,q])=>q.signature)].slice(-40),feedback);
     if(questions.failed?.length){
      payload.preparationIssues=[...(payload.preparationIssues||[]),...questions.failed];
      for(const f of questions.failed){
       feedback[f.id]=failureFeedback(f);
       const plan=payload.plans.find(p=>p.id===f.id);
       // Preserve ten written activities while replacing an overly broad blank
       // with independently reviewed productive use. Never rewrite a paused lesson.
       if(!recovering&&plan?.taskDemand==='advanced'&&['subjective_context','subjective_dialogue','subjective_recall'].includes(plan.type)&&f.issues.includes('review_failed:levelDemandFit')){
        plan.type='subjective_use';plan.stage='use';
        feedback[f.id].push('이 문항은 이제 subjective_use입니다. 빈칸을 만들지 말고 목표어를 보여준 뒤, 예문이나 상황 설명 없이 그 단어로 자신의 문장 하나를 직접 쓰게 하세요.');
       }else if(!recovering&&plan?.taskDemand==='advanced'&&plan.type==='mc_relation'&&f.issues.includes('review_failed:levelDemandFit')){
        plan.type=Number(plan.id)%4===0?'mc_usage':'mc_reading';plan.stage=plan.type==='mc_reading'?'transfer':'bridge';
        feedback[f.id].push('이 문항의 새 유형은 '+plan.type+'입니다. 목표 어휘는 그대로 유지하세요. 엉뚱한 오답이나 정의 재진술 대신, 가까운 상황의 조건·의도·결과를 구별하는 보기 다섯 개를 만드세요. 정답은 반드시 하나이며 이미 사용한 사건은 피하세요.');
       }
      }
     }
     if(obsolete)return;
     const retry=[];
     for(const [i,p] of missing){
      const raw=questions.find(q=>String(q.id)===p.id);
      if(!raw){retry.push([i,p]);continue}
      const q=browserQuestion(raw,p);q.bankReaderLevel=Number(job.learner.difficulty)||2;q.bankSupportLevel=p.supportLevel||0;q.bankPassageKeys=passageKeys(q.ctx,q.opts.map(o=>o.t));
      if(!sentenceUseQuestionValid(q,p)&&(!raw?.validation?.aiVerified||!raw.validation.deterministic||!raw.validation.checks?.coherentSituation||!raw.validation.checks?.levelDemandFit))throw Error('Unverified prepared question');
      const used=new Set([...(generationLearner.words?.[p.w.w]?.usedPassageKeys||[]),...(generationLearner.words?.[p.w.w]?.problemHistory||[]).flatMap(h=>passageKeys(h.context,h.options||[])),...[...ready.values()].filter(v=>v.w.w===p.w.w).flatMap(v=>passageKeys(v.ctx,v.opts.map(o=>o.t)))]);
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
  if(payload.ready.length<payload.plans.length)throw Error(duplicates?'Repeated sentence withheld':'Incomplete validated preparation');
 }catch(error){
  if(!obsolete){payload.preparationError=String(error?.message||error).slice(0,1000);if(/credit_balance_exhausted|insufficient_quota/.test(payload.preparationError))payload.preparationBlocked='ai_credit_exhausted';checkpoint=checkpoint.catch(()=>{});await save(true)}
  throw error;
 }
 return payload;
}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const id=req.body?.id,key=req.headers['x-preparation-key'];
 if(!uuid(id)||!uuid(key))return res.status(401).json({error:'Unauthorized'});
 // Stored authored questions need no generation-provider key.

 try{
  const job=await rpc('claim_preparation',{p_id:id,p_key:key});
  if(!job)return res.status(202).json({accepted:false});
  waitUntil(prepare(job,key).catch(error=>{console.error(JSON.stringify({event:'preparation_retry',profile:job.profile,reason:String(error?.message||error).slice(0,300)}))}));
  return res.status(202).json({accepted:true});
 }catch{return res.status(503).json({error:'Preparation unavailable'})}
}
