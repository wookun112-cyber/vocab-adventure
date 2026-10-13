import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {calibratedWord,inTargetBand,isLearningTarget,selectCoverageWords,COVERAGE_POLICY,REALTIME_LEVEL_POLICY} from '../lib/learning-model.js';
import {buildDailyPlan,MINIMUM_STUDY_POLICY} from '../lib/daily-practice.js';
import {authoredCurriculum,authoredEntry} from './authored-bank.js';
import {hydrateFromBank} from '../lib/question-bank.js';
import {bundlePractice} from './practice-pool.js';

const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const fingerprint=text=>{let n=2166136261;for(const ch of text)n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0};

// These are downloaded candidates, not introduced words or extra lessons.
// Only the client completion boundary introduces one when time is short.
export function buildStudyTopups(learner,account,excluded=[],seed='',count=5,options={}){
 const blocked=new Set(excluded),level=Number(learner.difficulty)||2;
 const all=authoredCurriculum(account).map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,example:row.example||'',pair:row.confusion||'',contrast:row.contrast||'',source:'fixed'}));
 const coverage=options.coverage===true?selectCoverageWords(all,learner,2,{excluded,unseenOnly:true,newLimit:count}):[];
 for(const w of coverage)blocked.add(w.w);
 const candidates=[...coverage,...all
  .filter(w=>!blocked.has(w.w)&&!learner.words?.[w.w]?.seen&&!learner.words?.[w.w]?.introducedAt&&isLearningTarget(w)&&inTargetBand(w,level))
  .sort((a,b)=>Math.abs(a.band-level)-Math.abs(b.band-level)||fingerprint(seed+'|'+a.w)-fingerprint(seed+'|'+b.w))];
 const targets=[];
 for(const w of candidates){
  const plan=buildDailyPlan([w],[],()=>({}),level,{assessment:false})[0];
  if(!plan)continue;plan.id='time:'+w.w;
  const entry=authoredEntry(plan,learner,account);
  if(!entry?.question?.learningCard?.example)continue;
  const packet={account,plans:[plan],ready:[]};
  if(!hydrateFromBank(packet,learner,[entry]))continue;
  bundlePractice(packet,learner,account);
  targets.push({plan,question:packet.ready[0][1],practicePool:packet.practicePool});
  if(targets.length>=Math.max(1,Math.min(5,Number(count)||5)))break;
 }
 return {policy:MINIMUM_STUDY_POLICY,coveragePolicy:options.coverage?COVERAGE_POLICY:null,level,targets,exhausted:targets.length===0};
}

// Unintroduced candidates from neighboring bands, not additional reserve sets.
// They are downloaded with the lesson so a level change never invokes generation.
export function buildRealtimePool(learner,account,excluded=[],seed=''){
 const originLevel=Number(learner.difficulty)||2,targets=[],held=new Set(excluded);
 const floor=Math.max(2,Math.floor(originLevel)-1),ceiling=Math.min(9,Math.floor(originLevel)+2);
 for(let band=floor;band<=ceiling;band++){
  const reader={...learner,difficulty:band};
  const pool=buildStudyTopups(reader,account,[...held],seed+'|adaptive:'+band);
  for(const t of pool.targets.filter(t=>t.plan.w.band===band).slice(0,4)){
   const probePlan={...t.plan,type:'subjective_recall',stage:'check',firstLearning:true,needsCard:false,review:false,
    taskDemand:band>4.5?'advanced':'standard',realtimeProbe:true,realtimeLevelPolicy:REALTIME_LEVEL_POLICY};
   const entry=authoredEntry(probePlan,reader,account),packet={account,plans:[probePlan],ready:[]};
   if(!entry||!hydrateFromBank(packet,reader,[entry]))continue;
   const probeQuestion=packet.ready[0][1];
   if(probeQuestion.showTarget||probeQuestion.learningCard)continue;
   targets.push({...t,plan:{...t.plan,realtimeLevelPolicy:REALTIME_LEVEL_POLICY},probePlan,probeQuestion});held.add(t.plan.w.w);
  }
 }
 return {policy:REALTIME_LEVEL_POLICY,originLevel,floor,ceiling,targets};
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const authorization=req.headers?.authorization;
 if(!authorization?.startsWith('Bearer '))return res.status(401).json({error:'Login required'});
 if(!['ayoung','inseong','guest'].includes(req.body?.profile))return res.status(400).json({error:'Invalid profile'});
 if(!Number.isFinite(Number(req.body?.level)))return res.status(400).json({error:'Invalid level'});
 try{
  const headers={apikey:SUPABASE_KEY,Authorization:authorization};
  const auth=await fetch(SUPABASE_URL+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return res.status(401).json({error:'Login required'});
  const user=await auth.json();
  if(user.id!==AUTHORED_OWNER)return res.status(403).json({error:'Question bank unavailable for this account'});
  const stored=await fetch(SUPABASE_URL+'/rest/v1/app_state?user_id=eq.'+encodeURIComponent(user.id)+'&select=state',{headers,signal:AbortSignal.timeout(10000)});
  if(!stored.ok)throw Error('State unavailable');
  const rows=await stored.json(),learner=rows[0]?.state?.users?.[req.body.profile];
  if(!learner)return res.status(409).json({error:'Learner unavailable'});
  if(Math.abs(Number(req.body.level)-Number(learner.difficulty))>.35)return res.status(409).json({error:'Learner level changed; reload the saved lesson'});
  const excluded=(Array.isArray(req.body.excluded)?req.body.excluded:[]).slice(0,4000).filter(x=>typeof x==='string'&&x.length<=80);
  excluded.push(...(learner.activeLesson?.baseWords||[]).map(w=>w.w));
  const seed=String(req.body.seed||'').slice(0,150),pool=buildStudyTopups(learner,user.id,excluded,seed,5,{coverage:true});
  if(req.body.adaptive===true)pool.adaptivePool=buildRealtimePool(learner,user.id,excluded,seed);
  return res.status(200).json(pool);
 }catch{
  return res.status(503).json({error:'추가 새 단어를 불러오지 못했어요. 기존 학습은 저장되어 있습니다.'});
 }
}
