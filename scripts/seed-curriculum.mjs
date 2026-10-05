const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const model=process.env.OPENAI_MODEL||'gpt-6-luna';

const bands={
  1:{name:'초등 1~2학년',target:600},
  2:{name:'초등 3~4학년',target:600},
  3:{name:'초등 5~6학년',target:700},
  4:{name:'중학교 1학년',target:700},
  5:{name:'중학교 2학년',target:700},
  6:{name:'중학교 3학년',target:700},
  7:{name:'고등학교 1학년',target:700},
  8:{name:'고등학교 2학년',target:650},
  9:{name:'고등학교 3학년',target:650}
};

if(!process.env.OPENAI_API_KEY){
  throw new Error('OPENAI_API_KEY is missing in Vercel build environment');
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function rpc(name,body={}){
  const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error(name+' failed: '+r.status+' '+(await r.text()).slice(0,300));
  return r.json();
}

function outputText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  const parts=[];
  for(const item of data?.output||[]){
    for(const c of item?.content||[]){
      if(typeof c?.text==='string') parts.push(c.text);
    }
  }
  return parts.join('\n');
}

async function callOpenAI({band,count,exclude}){
  const b=bands[band];
  const prompt=[
    '한국 학생용 고정 어휘 데이터베이스를 구축합니다.',
    '현재 단계: '+band+'단계 ('+b.name+')',
    '이번에 새로 만들 어휘 수: '+count+'개',
    '전체 목표는 초등 저학년부터 고3까지 정확히 6,000개의 핵심 학습 어휘입니다.',
    '',
    '선정 원칙:',
    '- 해당 학년의 국어 독해와 국어·사회·과학·수학 교과 지문 이해에 실제로 도움이 되는 어휘를 우선합니다.',
    '- 단순히 어려운 한자어만 나열하지 말고 생활어, 추상어, 논리어, 감정·관계어, 교과 공통 학술어를 균형 있게 포함합니다.',
    '- 고유명사, 지나치게 전문적인 전공용어, 유행어, 은어는 제외합니다.',
    '- 활용형보다 기본형을 우선합니다.',
    '- 이미 아래에 있는 단어는 절대로 다시 만들지 않습니다.',
    '- definition은 학생 눈높이에 맞는 짧고 정확한 뜻풀이 한 문장입니다.',
    '- example은 자연스러운 한 문장 예시입니다.',
    '- confusion은 실제로 혼동하기 쉬운 다른 단어가 있을 때만 쓰고 없으면 빈 문자열입니다.',
    '- contrast는 confusion과의 차이를 한 문장으로 설명하고 confusion이 없으면 빈 문자열입니다.',
    '- domain은 국어, 사회, 과학, 수학·논리, 감정·관계, 생활 중 하나입니다.',
    '- 반환하는 모든 항목의 band는 반드시 '+band+'입니다.',
    '',
    '이미 구축된 전체 어휘:',
    exclude.join(', '),
    '',
    '정확히 '+count+'개의 서로 다른 새 단어를 반환하세요.'
  ].join('\n');

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
            domain:{type:'string',enum:['국어','사회','과학','수학·논리','감정·관계','생활']},
            example:{type:'string'},
            confusion:{type:'string'},
            contrast:{type:'string'}
          },
          required:['word','definition','domain','example','confusion','contrast'],
          additionalProperties:false
        }
      }
    },
    required:['words'],
    additionalProperties:false
  };

  let last='';
  for(let attempt=1;attempt<=8;attempt++){
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        reasoning:{effort:'low'},
        max_output_tokens:12000,
        input:prompt,
        text:{format:{type:'json_schema',name:'curriculum_seed',strict:true,schema}}
      })
    });
    if(r.ok){
      try{
        const parsed=JSON.parse(outputText(await r.json()).trim());
        if(Array.isArray(parsed.words)&&parsed.words.length===count) return parsed.words;
        last='Unexpected word count from model';
      }catch(err){
        last='JSON parse failed: '+String(err?.message||err);
      }
      console.log('OpenAI retry',attempt,last);
      await sleep(Math.min(30000,3000*attempt));
      continue;
    }
    last=await r.text();
    if(![408,409,429,500,502,503,504].includes(r.status)){
      throw new Error('OpenAI '+r.status+': '+last.slice(0,500));
    }
    console.log('OpenAI retry',attempt,'status',r.status);
    await sleep(Math.min(30000,3000*attempt));
  }
  throw new Error('OpenAI failed after retries: '+last.slice(0,500));
}

async function seedBand(band){
  const target=bands[band].target;
  while(true){
    const existingBand=await rpc('tmp_curriculum_band_existing_20261005',{p_band:band});
    const current=existingBand.length;
    if(current>=target){
      console.log('Band',band,bands[band].name,'complete',current+'/'+target);
      return;
    }

    const existingAll=await rpc('tmp_curriculum_existing_20261005');
    const need=Math.min(100,target-current);
    console.log('Band',band,bands[band].name,'current',current,'target',target,'generate',need,'global',existingAll.length);

    const generated=await callOpenAI({band,count:need,exclude:existingAll});
    const payload=generated.map(x=>({
      word:String(x.word||'').trim(),
      definition:String(x.definition||'').trim(),
      band,
      domain:x.domain,
      example:String(x.example||'').trim(),
      confusion:String(x.confusion||'').trim(),
      contrast:String(x.contrast||'').trim(),
      source:'gpt-6-luna curated'
    })).filter(x=>x.word&&x.definition);

    const inserted=await rpc('tmp_seed_curriculum_v2_20261005',{p_words:payload});
    console.log('Band',band,'generated',generated.length,'inserted',inserted);

    if(inserted<=0){
      console.log('No rows inserted; retrying band',band);
      await sleep(8000);
      continue;
    }
    await sleep(3000);
  }
}

for(let band=1;band<=9;band++){
  await seedBand(band);
}

const all=await rpc('tmp_curriculum_existing_20261005');
if(all.length!==6000){
  throw new Error('Expected exactly 6000 words, got '+all.length);
}
console.log('CURRICULUM_SEED_COMPLETE total='+all.length);
