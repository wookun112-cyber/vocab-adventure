import {rpc,T,askModel} from './review-lib.mjs';

const DOMAINS=['국어','사회','과학','수학·논리','감정·관계','생활'];

function makePrompt(rows){
  return [
    '한국어 어휘 교육과정 검수자 역할을 하세요.',
    '대상은 초1~고3용 어휘 DB입니다.',
    '단계: 1 초1~2, 2 초3~4, 3 초5~6, 4 중1, 5 중2, 6 중3, 7 고1, 8 고2, 9 고3.',
    '정착된 생활·교과·독해·수능 핵심어는 유지합니다.',
    '대학 전공 수준의 과도한 전문용어, 고유명사, 유행어, AI가 임의 조합한 듯한 길고 비정형적인 구는 replace 판정합니다.',
    '학년이 어긋나면 band를 조정하고 domain은 국어/사회/과학/수학·논리/감정·관계/생활 중 하나로 고칩니다.',
    '뜻과 예문이 틀리거나 어색하면 고쳐 씁니다. 정확하면 definition/example은 빈 문자열이어도 됩니다.',
    'replace는 단어 자체를 교체해야 할 때만 사용합니다.',
    '점수: 90~100 매우 적합, 75~89 적합, 60~74 보완, 0~59 교체 권장.',
    'flags는 too_specialized, noncanonical_phrase, band_issue, domain_issue, definition_issue, example_issue, ambiguous, duplicate_concept, ok 중에서 선택합니다.',
    'DATA='+JSON.stringify(rows)
  ].join('\n');
}

function makeSchema(n){
  return {
    type:'object',
    properties:{reviews:{type:'array',minItems:n,maxItems:n,items:{
      type:'object',
      properties:{
        id:{type:'integer'},
        verdict:{type:'string',enum:['keep','fix','replace']},
        band:{type:'integer',minimum:1,maximum:9},
        domain:{type:'string',enum:DOMAINS},
        definition:{type:'string'},
        example:{type:'string'},
        score:{type:'integer',minimum:0,maximum:100},
        flags:{type:'array',items:{type:'string',enum:['too_specialized','noncanonical_phrase','band_issue','domain_issue','definition_issue','example_issue','ambiguous','duplicate_concept','ok']}},
        reason:{type:'string'}
      },
      required:['id','verdict','band','domain','definition','example','score','flags','reason'],
      additionalProperties:false
    }}},
    required:['reviews'],
    additionalProperties:false
  };
}

export async function reviewBand(band){
  let done=0;
  while(true){
    const rows=await rpc('tmp_review_fetch_band_20261006',{p_token:T,p_band:band,p_after_id:0,p_limit:60});
    if(!rows.length) break;
    const result=await askModel(makePrompt(rows),makeSchema(rows.length));
    const applied=await rpc('tmp_review_apply_20261006',{p_token:T,p_reviews:result.reviews});
    done+=Number(applied||0);
    console.log('band',band,'reviewed',done);
  }
  return done;
}
