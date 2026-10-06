const U='https://qhqumfgbbsurgmlpyira.supabase.co';
const K='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
export const T='curriculum-review-session-oct06';

export async function rpc(name,body={}){
  const r=await fetch(U+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:K,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error(name+' '+r.status+' '+(await r.text()).slice(0,300));
  return r.json();
}

export function outputText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  const parts=[];
  for(const item of data?.output||[]) for(const c of item?.content||[]) if(typeof c?.text==='string') parts.push(c.text);
  return parts.join('\n');
}

export async function askModel(prompt,schema){
  let last='';
  for(let i=1;i<=6;i++){
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||'gpt-6-luna',
        reasoning:{effort:'low'},
        max_output_tokens:7000,
        input:prompt,
        text:{format:{type:'json_schema',name:'curriculum_review',strict:true,schema}}
      })
    });
    if(r.ok) return JSON.parse(outputText(await r.json()).trim());
    last=await r.text();
    await new Promise(x=>setTimeout(x,Math.min(12000,1500*i)));
  }
  throw new Error(last.slice(0,400));
}
