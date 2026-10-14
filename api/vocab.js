import {isLearningTarget,calibratedWord,inTargetBand} from '../lib/learning-model.js';
import {authoredCurriculum} from './authored-bank.js';
const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const authorization=req.headers.authorization;
 if(!authorization?.startsWith('Bearer '))return res.status(401).json({error:'Login required'});
 try{
  const auth=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return res.status(401).json({error:'Login required'});
  const user=await auth.json(),body=req.body||{},count=Math.max(12,Math.min(30,Number(body.count)||24));
  const mode=body.mode==='diagnostic'?'diagnostic':'daily',band=Math.max(2,Math.min(9,Math.round(Number(body.band)||3)));
  const exclude=new Set(Array.isArray(body.exclude)?body.exclude.filter(x=>typeof x==='string'):[]);
  const available=authoredCurriculum(user.id).map(row=>calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,pair:row.confusion||'',contrast:row.contrast||'',example:row.example||'',source:'fixed'})).filter(w=>!exclude.has(w.w)&&w.band>=2&&isLearningTarget(w.w,w.cat,w.band));
  let words=[];
  if(mode==='diagnostic'){
   const buckets=Array.from({length:8},(_,i)=>available.filter(w=>w.band===i+2));
   for(let round=0;words.length<count&&buckets.some(b=>round<b.length);round++)for(const bucket of buckets){if(words.length>=count)break;if(bucket[round])words.push(bucket[round])}
  }else words=available.filter(w=>inTargetBand(w,band)).sort((a,b)=>Math.abs(a.band-band)-Math.abs(b.band-band)||a.w.localeCompare(b.w,'ko')).slice(0,count);
  if(!words.length)return res.status(409).json({code:'bank_supply_required',error:'등록된 어휘 자료의 보충이 필요합니다. 유료 자동 생성은 하지 않습니다.'});
  return res.status(200).json({words,model:null,source:'reviewed_curriculum',paidGenerationCalls:0});
 }catch{return res.status(503).json({error:'등록된 어휘 자료를 불러오지 못했어요. 기존 학습 기록은 유지됩니다.'})}
}
