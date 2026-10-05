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
const bandNames={
  1:'초등 1~2학년',
  2:'초등 3~4학년',
  3:'초등 5~6학년',
  4:'중학교 1학년',
  5:'중학교 2학년',
  6:'중학교 3학년',
  7:'고등학교 1학년',
  8:'고등학교 2학년',
  9:'고등학교 3학년'
};
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!(await verifyUser(req.headers.authorization))) return res.status(401).json({error:'Login required'});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'AI not configured'});
  try{
    const body=req.body||{};
    const count=Math.max(12,Math.min(30,Number(body.count)||24));
    const mode=body.mode==='diagnostic'?'diagnostic':'daily';
    const band=Math.max(1,Math.min(9,Math.round(Number(body.band)||3)));
    const exclude=Array.isArray(body.exclude)?body.exclude.filter(x=>typeof x==='string').slice(-500):[];
    const distribution=mode==='diagnostic'
      ? '1~9단계가 모두 포함되도록 각 단계에서 비슷한 수로 고르게 뽑으세요.'
      : '중심 단계는 '+band+'단계('+bandNames[band]+')입니다. 약 65%는 '+band+'단계, 20%는 한 단계 쉬운 어휘, 15%는 한 단계 어려운 어휘로 구성하세요.';
    const prompt='한국어 어휘 학습 앱의 교육과정용 어휘 데이터 편집자입니다.\n'
      +'대상 범위는 초등 1학년부터 고등학교 3학년까지입니다.\n'
      +'이번 작업은 '+(mode==='diagnostic'?'진단평가용':'일일 학습용')+' 새 어휘 '+count+'개를 만드는 것입니다.\n\n'
      +'난이도 단계:\n'
      +'1 = 초등 1~2학년 핵심 생활·기초 학습어\n'
      +'2 = 초등 3~4학년 교과·독해 핵심어\n'
      +'3 = 초등 5~6학년 교과·추론·추상어\n'
      +'4 = 중학교 1학년 국어·사회·과학 독해 핵심어\n'
      +'5 = 중학교 2학년 논리·학술·추상어\n'
      +'6 = 중학교 3학년 고난도 독해·논증·교과 공통 학술어\n'
      +'7 = 고등학교 1학년 비문학·교과 공통 학술어\n'
      +'8 = 고등학교 2학년 논증·추상·개념어\n'
      +'9 = 고등학교 3학년 수능·고난도 독해 핵심어\n\n'
      +'구성 지침:\n'
      +'- '+distribution+'\n'
      +'- 국어/독해, 사회, 과학, 수학/논리, 감정/관계, 일상/생활을 균형 있게 섞습니다.\n'
      +'- 실제 학교 지문과 설명문을 이해하는 데 도움이 되는 고빈도 어휘를 우선합니다.\n'
      +'- 지나치게 전문적인 전공용어, 고유명사, 유행어, 외래어 나열은 피합니다.\n'
      +'- 같은 뜻의 단어만 반복하지 않습니다.\n'
      +'- 아래 제외 단어는 절대로 다시 내지 않습니다.\n'
      +'- definition은 사전 문장을 그대로 베끼지 말고 아이가 문맥에서 이해할 수 있게 간결히 설명합니다.\n'
      +'- example은 자연스러운 한 문장 예시입니다.\n'
      +'- confusion은 실제로 헷갈리기 쉬운 다른 단어 하나가 있을 때만 넣고, 없으면 빈 문자열입니다.\n'
      +'- contrast는 confusion과의 차이를 한 문장으로 설명하고, confusion이 없으면 빈 문자열입니다.\n'
      +'- band는 반드시 1~9의 정수입니다.\n\n'
      +'제외 단어:\n'+exclude.join(', ')+'\n\n'
      +'정확히 '+count+'개의 서로 다른 단어를 반환하세요.';

    const schema={
      type:'object',
      properties:{
        words:{
          type:'array',
          minItems:count,
          maxItems:count,
          items:{
            type:'object',
            properties:{
              word:{type:'string'},
              definition:{type:'string'},
              band:{type:'integer',minimum:1,maximum:9},
              domain:{type:'string',enum:['국어','사회','과학','수학·논리','감정·관계','생활']},
              confusion:{type:'string'},
              contrast:{type:'string'},
              example:{type:'string'}
            },
            required:['word','definition','band','domain','confusion','contrast','example'],
            additionalProperties:false
          }
        }
      },
      required:['words'],
      additionalProperties:false
    };
    const model=process.env.OPENAI_MODEL||'gpt-6-luna';
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        reasoning:{effort:'low'},
        max_output_tokens:6500,
        input:prompt,
        text:{format:{type:'json_schema',name:'vocab_batch',strict:true,schema}}
      })
    });
    if(!r.ok){
      const t=await r.text();
      return res.status(502).json({error:'OpenAI '+r.status+': '+t.slice(0,300)});
    }
    const text=extractText(await r.json()).trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
    const parsed=JSON.parse(text);
    const seen=new Set(exclude);
    const words=[];
    for(const x of parsed.words||[]){
      const w=String(x.word||'').trim();
      if(!w||seen.has(w)) continue;
      seen.add(w);
      words.push({
        w,
        d:String(x.definition||'').trim(),
        band:Number(x.band)||band,
        cat:String(x.domain||'국어'),
        pair:String(x.confusion||'').trim(),
        contrast:String(x.contrast||'').trim(),
        example:String(x.example||'').trim(),
        source:'ai'
      });
    }
    return res.status(200).json({words,model});
  }catch(e){
    return res.status(500).json({error:String(e?.message||e)});
  }
}