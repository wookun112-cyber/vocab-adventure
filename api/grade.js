const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';

function extractText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  const parts=[];
  for(const item of data?.output||[]) for(const c of item?.content||[]) if(typeof c?.text==='string') parts.push(c.text);
  return parts.join('\n');
}
async function verifyUser(auth){
  if(!auth?.startsWith('Bearer ')) return false;
  const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:auth}});
  return r.ok;
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!(await verifyUser(req.headers.authorization))) return res.status(401).json({error:'Login required'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'AI not configured'});
  try{
    const {question,answer,source='typed',targetWord='',definition='',band=3}=req.body||{};
    if(!question||typeof answer!=='string') return res.status(400).json({error:'Bad request'});
    const prompt=`당신은 초등학생 한국어 어휘 학습 답안을 채점하는 엔진입니다.
목표 단어: ${targetWord}
문제: ${question}
입력 방식: ${source}
학생 답: ${answer}

규칙:
1. 사전식 암기보다 문맥 이해와 실제 사용을 평가합니다.
2. source가 voice이면 학생 답은 음성인식 결과입니다. 문맥상 명백한 STT 오인식만 내부적으로 자연스럽게 보정한 뒤 의미를 채점합니다.
3. 발음은 절대로 평가하거나 교정하지 않습니다.
4. 실제 의미 오류를 STT 오류라고 억지로 고치지 않습니다.
5. 결과는 ◎(독립적으로 정확), ○(정답), △(부분 이해/도움 필요), ?(우연 정답 의심), ×(오답) 중 하나입니다.
6. feedback은 짧고 아이가 이해하기 쉽게 씁니다.
반드시 JSON만 출력:
{"normalizedAnswer":"...","result":"◎|○|△|?|×","score":0.0,"feedback":"...","correctionApplied":false,"correctionNote":"..."}`;
    const model=process.env.OPENAI_MODEL||'gpt-6-luna';
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({
      model,
      reasoning:{effort:'low'},
      max_output_tokens:400,
      input:prompt,
      text:{format:{
        type:'json_schema',
        name:'vocab_grade',
        strict:true,
        schema:{
          type:'object',
          properties:{
            normalizedAnswer:{type:'string'},
            result:{type:'string',enum:['◎','○','△','?','×']},
            score:{type:'number',minimum:0,maximum:1},
            feedback:{type:'string'},
            correctionApplied:{type:'boolean'},
            correctionNote:{type:'string'}
          },
          required:['normalizedAnswer','result','score','feedback','correctionApplied','correctionNote'],
          additionalProperties:false
        }
      }}
    })});
    if(!r.ok){const t=await r.text();return res.status(502).json({error:'OpenAI '+r.status+': '+t.slice(0,180)})}
    let text=extractText(await r.json()).trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
    return res.status(200).json({...JSON.parse(text),model});
  }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}
