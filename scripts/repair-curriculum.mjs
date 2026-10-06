import {rpc,T,askModel} from './review-lib.mjs';
import {reviewBand} from './review-band.mjs';

const TARGET_TOTAL=6000;
const TARGETS={1:600,2:600,3:700,4:700,5:700,6:700,7:700,8:650,9:650};
const BAND_NAMES={1:'초1~2',2:'초3~4',3:'초5~6',4:'중1',5:'중2',6:'중3',7:'고1',8:'고2',9:'고3'};
const DOMAINS=['국어','사회','과학','수학·논리','감정·관계','생활'];

function makeGenerationPrompt(band,count,existingBand){
  return [
    '한국 학생용 어휘 학습 DB의 빈자리를 채울 새 핵심 어휘를 만드세요.',
    '대상 단계: '+band+' ('+BAND_NAMES[band]+')',
    '필요 수: '+count,
    '반드시 실제로 널리 쓰이는 표준어 또는 정착된 교과·독해 용어만 사용하세요.',
    '대학 전공 수준의 지나치게 전문적인 용어, 고유명사, 유행어, 임의로 조합한 긴 설명식 표현은 제외하세요.',
    '가능하면 단일어 또는 널리 통용되는 짧은 복합어를 우선하세요.',
    '국어·사회·과학·수학논리·감정관계·생활 영역을 균형 있게 섞으세요.',
    'definition은 학생 눈높이의 정확한 한 문장 뜻풀이, example은 뜻이 드러나는 자연스러운 한 문장 예문입니다.',
    'confusion은 실제 헷갈리는 단어가 있을 때만, contrast는 그 차이이며 없으면 빈 문자열입니다.',
    '아래 기존 단어는 절대로 다시 쓰지 마세요.',
    existingBand.join(', '),
    '정확히 '+count+'개를 반환하세요.'
  ].join('\n');
}

function makeGenerationSchema(n){
  return {
    type:'object',
    properties:{words:{type:'array',minItems:n,maxItems:n,items:{
      type:'object',
      properties:{
        word:{type:'string'},
        definition:{type:'string'},
        domain:{type:'string',enum:DOMAINS},
        example:{type:'string'},
        confusion:{type:'string'},
        contrast:{type:'string'}
      },
      required:['word','definition','domain','example','confusion','contrast'],
      additionalProperties:false
    }}},
    required:['words'],
    additionalProperties:false
  };
}

async function activeStatus(){
  const rows=await rpc('tmp_repair_status_20261006',{p_token:T});
  const map={};
  for(const r of rows) map[Number(r.band)]={active:Number(r.active_count),rejected:Number(r.rejected_count)};
  for(let b=1;b<=9;b++) if(!map[b]) map[b]={active:0,rejected:0};
  return map;
}

function chooseBand(status){
  let best=1,bestNeed=-Infinity;
  for(let b=1;b<=9;b++){
    const need=TARGETS[b]-status[b].active;
    if(need>bestNeed){bestNeed=need;best=b}
  }
  if(bestNeed<=0){
    let minBand=1,minCount=Infinity;
    for(let b=1;b<=9;b++) if(status[b].active<minCount){minCount=status[b].active;minBand=b}
    return minBand;
  }
  return best;
}

async function generateAndInsert(band,count,existingSet){
  const ask=Math.min(50,Math.max(count,Math.ceil(count*1.35)));
  const existingBand=await rpc('tmp_repair_band_words_20261006',{p_token:T,p_band:band});
  const result=await askModel(makeGenerationPrompt(band,ask,existingBand),makeGenerationSchema(ask));
  const payload=[];
  for(const x of result.words||[]){
    const w=String(x.word||'').trim();
    if(!w||existingSet.has(w)) continue;
    existingSet.add(w);
    payload.push({
      word:w,
      definition:String(x.definition||'').trim(),
      band,
      domain:x.domain,
      example:String(x.example||'').trim(),
      confusion:String(x.confusion||'').trim(),
      contrast:String(x.contrast||'').trim()
    });
    if(payload.length>=count) break;
  }
  if(!payload.length) return 0;
  return Number(await rpc('tmp_repair_insert_20261006',{p_token:T,p_words:payload})||0);
}

async function fillTo6000(){
  const existing=new Set(await rpc('tmp_repair_all_words_20261006',{p_token:T}));
  let guard=0;
  while(guard++<80){
    const st=await activeStatus();
    const total=Object.values(st).reduce((a,x)=>a+x.active,0);
    if(total>=TARGET_TOTAL) return total;
    const band=chooseBand(st);
    const missing=TARGET_TOTAL-total;
    const desired=Math.max(1,TARGETS[band]-st[band].active);
    const batch=Math.min(40,missing,desired);
    const inserted=await generateAndInsert(band,batch,existing);
    console.log('repair generate band',band,'inserted',inserted,'active',total);
    if(inserted===0) await new Promise(r=>setTimeout(r,1500));
  }
  throw new Error('repair fill guard exceeded');
}

for(let pass=1;pass<=6;pass++){
  const before=await fillTo6000();
  console.log('repair pass',pass,'active before review',before);
  for(let b=1;b<=9;b++) await reviewBand(b);
  const st=await activeStatus();
  const active=Object.values(st).reduce((a,x)=>a+x.active,0);
  const unreviewed=await rpc('tmp_review_fetch_band_20261006',{p_token:T,p_band:1,p_after_id:0,p_limit:1});
  console.log('repair pass',pass,'active after review',active);
  if(active===TARGET_TOTAL){
    let any=false;
    for(let b=1;b<=9;b++){
      const rows=await rpc('tmp_review_fetch_band_20261006',{p_token:T,p_band:b,p_after_id:0,p_limit:1});
      if(rows.length){any=true;break}
    }
    if(!any){
      console.log('CURRICULUM_REPAIR_COMPLETE active='+active);
      process.exit(0);
    }
  }
}
throw new Error('curriculum repair did not converge');
