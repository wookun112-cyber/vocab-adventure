// A provider response is identified before waiting for its final grade. Recovery
// uses GET on that same ID; it never re-creates a paid request.
export const providerEnvelope=r=>({id:r.id,status:r.status,model:r.model,output:r.output,output_text:r.output_text,usage:r.usage,incomplete_details:r.incomplete_details,error:r.error});
export function createGradeProvider({request,decode,fetcher=(...args)=>fetch(...args),pause=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>Date.now(),fastWaitMs=6500}={}){
 const pending=response=>Object.assign(Error('Provider still running'),{code:'grading_provider_pending',providerResponse:response});
 async function read(response,p,onResponse){
  const envelope=providerEnvelope(response);
  if(typeof envelope.id!=='string'||!/^resp_[a-zA-Z0-9_-]+$/.test(envelope.id))throw Object.assign(Error('Invalid provider response ID'),{code:'grading_provider_invalid_id'});
  await onResponse(envelope);
  if(['queued','in_progress'].includes(envelope.status))throw pending(envelope);
  if(envelope.status!=='completed')throw Object.assign(Error('Provider response '+envelope.status),{code:envelope.status==='incomplete'?'grading_provider_incomplete':'grading_provider_failed',providerResponse:envelope});
  try{return await decode(p,envelope)}catch(error){if(!error.code)error.code='grading_provider_invalid_grade';throw error}
 }
 async function retrieve(p,id,{onResponse=async()=>{}}={}){
  if(typeof id!=='string'||!/^resp_[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid provider ID');
  const r=await fetcher('https://api.openai.com/v1/responses/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Object.assign(Error('Provider retrieval '+r.status),{code:r.status===404?'grading_provider_expired':'grading_provider_lookup_unavailable'});
  return read(await r.json(),p,onResponse);
 }
 return {
  decode:(p,response)=>read(response,p,async()=>{}),retrieve,
  async start(p,{onResponse=async()=>{}}={}){
   const end=clock()+fastWaitMs;
   const r=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({...request(p),background:true,store:true})});
   if(!r.ok)throw Error('OpenAI '+r.status+': '+(await r.text()).slice(0,220));
   const initial=await r.json();
   try{return await read(initial,p,onResponse)}catch(error){if(error.code!=='grading_provider_pending')throw error}
   while(clock()<end){
    await pause(600);
    try{return await retrieve(p,initial.id,{onResponse})}catch(error){if(error.code!=='grading_provider_pending')throw error}
   }
   throw pending(initial);
  }
 };
}
