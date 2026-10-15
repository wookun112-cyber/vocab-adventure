import fs from 'node:fs';
import {seeds as essentialSeeds} from '../../database/essential-vocabulary-seeds.js';

// Compose explanations from registered editorial sources, without model calls.
// This does not certify independent human review or change a question's grade.
export const BANK_WIDE_FEEDBACK_REVISION='source-contrast-feedback-12.16.29';
const read=name=>JSON.parse(fs.readFileSync(new URL('../../database/'+name,import.meta.url),'utf8'));
const seeds=[...essentialSeeds,...read('level-four-seeds.json').map(x=>({word:x.word,...x.seed})),...read('level-five-six-seeds.json').map(x=>({word:x.word,...x.seed})),...read('level-nine-seeds.json').map(x=>({word:x.word,nearby:x.distractors,choices:x.labels}))];
const normalize=s=>String(s||'').normalize('NFKC').replace(/\\n/g,' ').replace(/\s+/g,' ').trim();
const shorten=(s,n=160)=>{s=normalize(s);return s.length>n?s.slice(0,n-1)+'…':s};
const quoted=(s,n=160)=>'‘'+shorten(s,n)+'’';
const meaningText=s=>normalize(s).replace(/[.!。]+$/,'');
const pairs=new Map();
for(const seed of seeds){if(!seed.word||!Array.isArray(seed.nearby)||seed.choices?.length!==5)continue;pairs.set(seed.word,new Map([seed.word,...seed.nearby].map((w,i)=>[w,seed.choices[i]])))}
const supplementalMeanings={
 '씻다':'물 등으로 때나 더러움을 없애다','재다':'도구나 기준으로 길이·크기·양을 알아보다','접다':'얇은 것을 구부려 한쪽을 다른 쪽에 겹치다',
 '불안':'마음이 편하지 않고 걱정되는 상태','분류':'공통된 성질에 따라 종류별로 나누는 일','숨기다':'다른 사람이 보거나 알지 못하게 하다','보관':'물건을 맡아 간직하고 관리하는 일','조사':'어떤 사실이나 상태를 자세히 알아보는 일',
 '안도':'걱정하던 일이 풀려 마음을 놓는 것','나열':'여러 항목을 차례로 늘어놓는 일','폐기':'필요 없거나 쓸 수 없는 것을 버리는 일','기록':'알거나 확인한 내용을 글이나 다른 수단으로 남기는 일',
 '만족':'필요나 바람이 채워져 흡족한 상태','상상':'직접 경험하지 않은 장면이나 일을 마음속에 그려 보는 일','암기':'내용을 외워 기억하는 일','삭제':'기록이나 항목을 지워 없애는 일','명령':'무엇을 하도록 지시하는 말',
 '무관심':'관심을 두거나 주의를 기울이지 않는 상태','방치하다':'돌보거나 필요한 조치를 하지 않은 채 내버려 두다','과장법':'정도나 크기를 실제보다 크게 또는 작게 표현하는 방법',
 '수량':'수와 양','이름':'대상을 구별해 부르는 말','감사':'고맙게 여기는 마음','구매':'물건을 사는 일','보고서':'조사나 업무의 내용과 결과를 정리한 글','우연':'뜻하지 않게 일어난 일',
 '취미':'즐거워서 즐겨 하는 활동','기부':'도움이나 공익을 위해 돈이나 물건 등을 내놓는 일','존경':'상대의 인품이나 행동 등을 높이 평가하여 공경하는 마음','소문':'사람들 사이에 퍼져 전해지는 말',
 '줄거리':'이야기의 중심 사건을 간추린 내용','감정':'상황을 겪으며 느끼는 마음의 상태','은폐':'사실이나 대상을 드러나지 않게 감추는 일','모방':'다른 것의 모습이나 방식을 본떠 따르는 일',
 '직유':'비슷한 성질을 가진 다른 대상에 직접 빗대는 표현','후보자':'어떤 자리나 역할에 뽑힐 대상으로 나선 사람','전체':'빠짐없이 모두를 합한 것','기쁨':'마음이 즐겁고 좋은 느낌',
 '또는':'여러 항목 중에서 하나를 선택할 수 있음을 나타내는 말','관람객':'공연이나 전시 등을 보러 온 사람','성격':'개인이나 대상이 지닌 고유한 성질','막연히':'내용이나 경계가 뚜렷하지 않게',
 '거절':'제안이나 부탁 등을 받아들이지 않는 일','원자재':'물건을 만드는 데 바탕이 되는 재료','인기도':'사람들에게 관심이나 호감을 얻는 정도','누적':'조금씩 더해져 쌓이는 것'
};
const actionClues=[
 [/길이|두 끝 사이|양끝 사이|한쪽 끝에서 다른 끝|얼마나 긴/,'길이나 두 끝 사이의 거리'],
 [/바람.*(?:방향|어느 쪽|어디서)|불어오는 방향/,'바람이 불어오는 방향'],
 [/공기가.*(?:압력|누르|미는 힘)/,'공기가 누르는 압력'],
 [/(?:차지하는|차지하).*(?:공간)|공간.*(?:크기|차지)/,'물체가 차지하는 공간의 크기'],
 [/(?:농작물|곡식|채소).*(?:거두|베어 모|따)|밭에서.*거두/,'자란 농작물을 거두는 행동'],
 [/씨.*싹|싹.*(?:나오|틔우)/,'씨앗에서 새싹이 나오는 변화'],
 [/(?:작품|물건|그림).*(?:관람|감상|보게|보도록)/,'다른 사람이 볼 수 있게 작품이나 물건을 내놓는 행동'],
 [/(?:빌린|대여한|맡아 쓴).*(?:돌려|반납)/,'빌린 물건을 돌려주는 행동'],
 [/(?:마지막 날짜|정해진 때|돌려줘야 할 때)/,'일을 마쳐야 하는 날짜나 기간'],
 [/(?:중심|가운데 기둥).*(?:빙|돌|움직)/,'한 중심을 둘러 도는 움직임'],
 [/(?:발|발바닥).*(?:누르|눌러)/,'발로 누르는 행동'],
 [/(?:접힌|접어 둔|구겨진).*(?:펼|반듯)/,'접히거나 구겨진 것을 펴는 행동'],
 [/불에 닿|불꽃|재로 바뀌|불이 붙/,'불이 붙어 타는 변화'],
 [/높이|키를 재|얼마나 높은/,'높이를 알아보는 일'],[/무게|얼마나 무거/,'무게를 알아보는 일'],
 [/온도계|온도를|얼마나 뜨거/,'현재 온도를 재거나 확인하는 일'],[/개수|몇 개|낱말이 몇 번|글자 수|글자수/,'대상의 수나 횟수를 세는 일'],
 [/색을 칠|색깔|가방 색/,'색이나 겉모습을 살피거나 바꾸는 일'],[/소리 크기|목소리.*크게|큰 목소리/,'소리나 목소리의 크기'],
 [/앞으로.*(?:날짜|시기).*정|계획을 세|날짜를 정/,'앞으로 할 일이나 시기를 정하는 일'],[/기부/,'도움을 주기 위해 돈이나 물건을 내놓는 일'],
 [/암기|외워/,'내용을 외워 기억하는 일'],[/복사|그대로.*옮/,'내용을 그대로 옮기는 일'],[/정리|이름순|차례로 늘어/,'항목을 정돈하거나 순서대로 나열하는 일']
];
function evidence(q){
 const ctx=normalize(q.context);if(!ctx)return '';
 const sentences=ctx.match(/[^.!?。！？]+[.!?。！？]?/g)||[ctx];
 const substantive=sentences.filter(s=>!/(?:무엇인가요|고르세요|어휘를 고르|알맞은.*(?:말|낱말)|상황에 맞는 어휘)/.test(s));
 const usable=substantive.length?substantive:sentences;
 // Preserve later clauses: they often distinguish cause from effect or a
 // single-species population from a community. Never invent a replacement.
 return shorten(usable.join(' '),220);
}
function selectiveContrast(row,q,option,lexicon){
 const target=meaningText(row.definition),correct=q.options.find(o=>o.correct)?.text;
 const selected=normalize(option.text),pair=pairs.get(row.word),prompt=shorten(q.prompt,100),clue=evidence(q);
 if(q.type==='mc_context'){
  const alternative=pair?.get(selected)||lexicon.get(selected)||supplementalMeanings[selected];
  if(alternative){const sense=meaningText(alternative),focus=meaningText(pair?.get(row.word)||target);
   return `고른 보기 ${quoted(selected)}의 뜻은 ${quoted(sense)}입니다. 이 글에서 필요한 뜻은 ${quoted(focus)}입니다.${clue?' 지문 근거: '+quoted(clue,220)+'.':''} 두 뜻의 차이를 보면 정답은 ${quoted(row.word)}입니다.`;
  }
  return `고른 보기는 ${quoted(selected)}입니다. 하지만 이 글에서 필요한 뜻은 ${quoted(target)}입니다.${clue?' 지문 근거: '+quoted(clue,220)+'.':''} 관련된 말인지보다 이 뜻 전체에 맞는지를 살펴야 해요. 정답은 ${quoted(correct)}입니다.`;
 }
 if(q.context)return `고른 보기(${quoted(selected)})와 정답 보기(${quoted(correct)})는 서로 다른 뜻을 설명해요. 목표 어휘 ${quoted(row.word)}의 뜻풀이는 ${quoted(target)}입니다.${clue?' 지문 근거: '+quoted(clue,220)+'.':''} 이 문맥에 맞는 설명은 ${quoted(correct)}입니다.`;
 const action=actionClues.find(([pattern])=>pattern.test(selected))?.[1];
 const asksException=/(?:않|아닌|잘못|반대|피한|벗어난)/.test(q.prompt||'');
 const goal=asksException?`질문에서 요구한 조건(${quoted(prompt)})`:`목표 어휘 ${quoted(row.word)}의 뜻(${quoted(target)})`;
 return `고른 보기는 ${quoted(selected)}입니다.${action?' 이 보기에서 확인할 수 있는 것은 '+quoted(action)+'입니다.':''} 이 문제에서는 ${goal}까지 살펴야 해요. 정답 보기 ${quoted(correct)}에는 이 조건이 드러나요. 두 장면이 무엇을 하고 있는지 비교해 보세요.`;
}
export function enrichBankWideReasons(rows){
 const lexicon=new Map();for(const row of rows)if(row.word&&row.definition&&!lexicon.has(row.word))lexicon.set(row.word,row.definition);
 let questions=0,reasons=0,added=0;const words=new Set(),methods={};
 for(const row of rows)for(const q of row.questions||[]){
  if(!q.type?.startsWith('mc_')||q.options?.length!==5||q.options.filter(o=>o.correct).length!==1)continue;
  let count=0;
  for(const option of q.options){
   if(option.correct)continue;
   if(!option.reason||option.reasonRevision===BANK_WIDE_FEEDBACK_REVISION){option.reason=selectiveContrast(row,q,option,lexicon);option.reasonRevision=BANK_WIDE_FEEDBACK_REVISION;option.reasonMethod='registered-source-contrast';added++}
   if(option.reason){count++;reasons++;const method=option.reasonMethod||'editorial';methods[method]=(methods[method]||0)+1}
  }
  if(count===4){questions++;words.add(row.word)}
 }
 return {questions,reasons,added,words:words.size,methods,revision:BANK_WIDE_FEEDBACK_REVISION};
}
export function enrichStoredBankEntries(entries){
 return entries.map(entry=>{
  const raw=entry?.question||entry;if(!raw?.type?.startsWith('mc_')||raw.opts?.length!==5)return entry;
  const q=structuredClone(raw);
  const row={word:q.w?.w,definition:q.w?.d,questions:[{type:q.type,prompt:q.q,context:q.ctx,options:q.opts.map(o=>({text:o.t,correct:!!o.ok,reason:o.reason||''}))}]};
  enrichBankWideReasons([row]);q.opts=q.opts.map((o,i)=>({...o,reason:row.questions[0].options[i].reason||o.reason||''}));
  return entry.question?{...entry,question:q}:q;
 });
}
