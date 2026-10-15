import {savedOfflineChoiceFeedback} from '../lib/server/offline-bank-runtime.js';
import {enrichStoredBankEntries} from '../lib/server/bank-wide-feedback.js';
import {savedChoiceFeedback} from './authored-bank.js';
const URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
// Read-only source-matched explanations; no grading or generation requests.
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const auth=req.headers.authorization;if(!auth?.startsWith('Bearer '))return res.status(401).json({error:'Login required'});
 try{
  const q=req.body?.question;
  if(!q||typeof q.q!=='string'||!Array.isArray(q.opts)||q.opts.length!==5||JSON.stringify(q).length>16000)return res.status(400).json({error:'Invalid question'});
  const identity=await fetch(URL+'/auth/v1/user',{headers:{apikey:KEY,Authorization:auth},signal:AbortSignal.timeout(3000)});
  if(!identity.ok)return res.status(401).json({error:'Login required'});
  const user=await identity.json();let reasons=savedChoiceFeedback(q,user.id)||savedOfflineChoiceFeedback(q,user.id);
  if(!reasons&&!q.authored){
   const stored=await fetch(URL+'/rest/v1/rpc/get_registered_choice_feedback_question',{method:'POST',headers:{apikey:KEY,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_question:q}),signal:AbortSignal.timeout(3000)});
   if(stored.ok){const canonical=await stored.json();if(canonical?.opts){const [enriched]=enrichStoredBankEntries([canonical]);reasons=enriched.opts.filter(o=>!o.ok&&o.reason).map(o=>({text:o.t,reason:o.reason}))}}
  }
  return res.status(200).json({found:!!reasons?.length,reasons:reasons||[],source:'registered_source_contrast',paidGenerationCalls:0});
 }catch{return res.status(503).json({error:'Stored explanation temporarily unavailable'})}
}
