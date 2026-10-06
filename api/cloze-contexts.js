const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';

async function verifyUser(auth){
  if(!auth?.startsWith('Bearer ')) return false;
  const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:auth}});
  return r.ok;
}
function extractText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  const parts=[];
  for(const item of data?.output||[]) for(const c of item?.content||[]) if(typeof c?.text==='string') parts.push(c.text);
  return parts.join('\n');
}
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!(await verifyUser(req.headers.authorization))) return res.status(401).json({error:'Login required'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'AI not configured'});
  try{
    const items=Array.isArray(req.body?.items)?req.body.items.slice(0,15):[];
    if(!items.length) return res.status(400).json({error:'No items'});
    const clean=items.map((x,i)=>({
      id:String(x.id??i),
      word:String(x.word||'').trim(),
      definition:String(x.definition||'').trim(),
      example:String(x.example||'').trim(),
      band:Math.max(1,Math.min(9,Number(x.band)||3)),
      domain:String(x.domain||'국어')
    })).filter(x=>x.word&&x.definition);
    if(!clean.length)return res.status(400).json({error:'No valid items'});

    const prompt=[
      '한국어 어휘 학습 앱의 문맥 빈칸 문제를 만드세요.',
      '각 목표 어휘마다 학생이 사전 정의를 암기해서가 아니라 앞뒤 상황을 읽고 의미를 추론할 수 있는 2~3문장짜리 짧은 지문을 작성합니다.',
      '',
      '필수 규칙:',
      '- passage에는 빈칸 표시 ＿＿＿＿를 정확히 한 번 넣습니다.',
      '- 목표 어휘 자체는 passage 어디에도 쓰지 않습니다.',
      '- 목표 어휘의 뜻을 사전 문장처럼 그대로 복사하지 말고, 상황·원인·결과·행동을 통해 충분한 단서를 줍니다.',
      '- 너무 짧은 한 문장 문제를 만들지 않습니다. 반드시 자연스러운 2~3문장으로 만듭니다.',
      '- 학생이 빈칸에 목표 어휘를 넣었을 때 문법적으로 자연스러워야 합니다.',
      '- 학습 단계에 맞는 문장 길이와 어휘를 사용합니다.',
      '- 수학·과학 용어는 계산/실험/관찰 상황을 활용하고, 국어·사회·생활 어휘는 실제 상황이나 짧은 설명문을 활용합니다.',
      '- 정답을 노골적으로 알려주는 괄호 풀이, 동의어 나열, 첫 글자 힌트는 넣지 않습니다.',
      '',
      '대상 JSON:',
      JSON.stringify(clean)
    ].join('\n');

    const schema={
      type:'object',
      properties:{
        items:{
          type:'array',
          minItems:clean.length,
          maxItems:clean.length,
          items:{
            type:'object',
            properties:{id:{type:'string'},passage:{type:'string'}},
            required:['id','passage'],
            additionalProperties:false
          }
        }
      },
      required:['items'],
      additionalProperties:false
    };
    const model=process.env.OPENAI_MODEL||'gpt-6-luna';
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        reasoning:{effort:'low'},
        max_output_tokens:3500,
        input:prompt,
        text:{format:{type:'json_schema',name:'cloze_contexts',strict:true,schema}}
      })
    });
    if(!r.ok)return res.status(502).json({error:'OpenAI '+r.status+': '+(await r.text()).slice(0,220)});
    const parsed=JSON.parse(extractText(await r.json()).trim());
    const targetById=new Map(clean.map(x=>[x.id,x.word]));
    const result=[];
    for(const x of parsed.items||[]){
      const id=String(x.id),word=targetById.get(id),passage=String(x.passage||'').trim();
      if(!word||!passage||!passage.includes('＿＿＿＿')||passage.includes(word))continue;
      result.push({id,passage});
    }
    return res.status(200).json({items:result,model});
  }catch(e){return res.status(500).json({error:String(e?.message||e)})}
}