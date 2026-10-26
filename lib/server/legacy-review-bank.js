// Compatibility content for previously assigned seed vocabulary. Original
// meanings and bands remain immutable; no learner record or result is migrated.
// Authored and reviewed here, without runtime AI generation.
export const legacyReviewRows=[{
 word:'증여',definition:'살아 있는 사람이 재산을 대가 없이 주는 것',band:4,domain:'사회',
 example:'할머니는 자신이 가진 땅의 일부를 손녀에게 대가 없이 증여했다.',
 contrast:'증여는 살아 있는 사람이 재산을 대가 없이 주는 일이고, 상속은 사람이 죽은 뒤 재산이 이어지는 일이다.',
 revision:'vocab-bank-offline-20261014-v1',
 questions:[
  {slot:1,type:'mc_context',prompt:'빈칸에 가장 알맞은 말을 고르세요.',context:'할아버지는 자신이 소유한 밭을 자녀에게 대가 없이 주었다. 살아 있는 동안 재산을 무료로 넘긴 이 일은 ＿＿＿＿에 해당한다.',choices:['증여','상속','매매','대여','교환'],explanation:'살아 있는 사람이 재산을 대가 없이 넘겼으므로 증여입니다. 사망 뒤에 재산이 이어지는 상속과 구별합니다.'},
  {slot:2,type:'mc_context',prompt:'빈칸에 가장 알맞은 말을 고르세요.',context:'미술품 수집가는 자신이 가진 그림 한 점을 조카에게 주었다. 그림값을 받지 않았고 돌려받기로 약속하지도 않았다. 이 재산 이전은 ＿＿＿＿이다.',choices:['증여','대여','상속','매매','교환'],explanation:'돈이나 다른 대가를 받지 않고 자기 재산을 넘겼으므로 증여입니다. 나중에 돌려받는 대여와 다릅니다.'},
  {slot:3,type:'mc_context',prompt:'빈칸에 가장 알맞은 말을 고르세요.',context:'부모는 자신들이 소유한 집을 딸의 소유로 넘겨주었다. 집값을 받거나 다른 재산으로 바꾸지 않았다. 부모가 살아 있을 때 이루어진 이 일은 ＿＿＿＿이다.',choices:['증여','매매','대여','상속','교환'],explanation:'살아 있는 소유자가 집을 대가 없이 넘겨주었으므로 증여입니다. 값을 받고 파는 매매가 아닙니다.'},
  {slot:4,type:'mc_usage',prompt:'‘증여’의 뜻에 가장 알맞은 상황을 고르세요.',context:'',choices:['할머니가 살아 계실 때 자기 땅을 손녀에게 대가 없이 넘겨주었다.','할머니가 돌아가신 뒤 자녀들이 남겨진 재산을 물려받았다.','할머니가 땅값을 받고 이웃에게 땅을 팔았다.','할머니가 다음 달에 돌려받기로 하고 이웃에게 돈을 빌려주었다.','할머니와 이웃이 서로 소유한 땅을 맞바꾸었다.'],explanation:'살아 있는 사람이 소유한 재산을 대가 없이 넘기는 상황이 증여입니다. 나머지는 차례로 상속, 매매, 대여, 교환입니다.'},
  {slot:5,type:'mc_usage',prompt:'‘증여’의 뜻에 가장 알맞은 상황을 고르세요.',context:'',choices:['삼촌이 자기 그림을 조카에게 아무 대가 없이 주고 소유권도 넘겼다.','삼촌이 그림값을 전부 받은 뒤 구매자에게 그림을 넘겼다.','삼촌이 전시가 끝나면 돌려받기로 하고 조카에게 그림을 맡겼다.','삼촌이 돌아가신 아버지가 남긴 그림을 물려받았다.','삼촌이 친구의 그림과 자기 그림을 맞바꾸었다.'],explanation:'자기 재산인 그림을 아무 대가 없이 주는 일을 증여라고 쓴 문장이 알맞습니다. 값을 받거나 돌려받거나 맞바꾸는 일과 구별합니다.'},
  {slot:6,type:'mc_usage',prompt:'‘증여’에 해당하는 일을 고르세요.',context:'',choices:['아버지가 자기 예금을 아들에게 돌려받거나 대가를 받을 조건 없이 넘겨주었다.','아버지가 일을 마친 대가로 회사에서 급여를 받았다.','아버지가 은행에서 돈을 빌리고 매달 갚기로 했다.','아버지가 서점에서 책값을 내고 책을 샀다.','아버지가 세상을 떠난 뒤 딸이 남겨진 예금을 물려받았다.'],explanation:'자신의 재산을 대가 없이 다른 사람에게 넘기는 첫 상황이 증여입니다. 급여, 대출, 구매, 상속과 다릅니다.'}
 ].map(({choices,explanation,...q})=>({...q,options:choices.map((text,i)=>({text,correct:i===0,reason:i===0?explanation:'살아 있는 소유자가 대가 없이 재산을 넘겼는지 확인해 보세요.'})),acceptedAnswers:['증여'],explanation})).concat([
  {slot:7,type:'subjective_recall',prompt:'살아 있는 사람이 자기 재산을 다른 사람에게 대가 없이 주는 일입니다. 빈칸에 알맞은 어휘를 쓰세요.',context:'어머니는 자신의 예금을 자녀에게 아무 대가 없이 넘겼다. 이 일은 ＿＿＿＿에 해당한다.',options:[],acceptedAnswers:['증여'],explanation:'살아 있는 소유자가 재산을 대가 없이 넘기는 일은 증여입니다.'},
  {slot:8,type:'subjective_recall',prompt:'살아 있는 소유자가 돈이나 다른 대가를 받지 않고 재산을 넘겨주는 일입니다. 빈칸에 알맞은 어휘를 쓰세요.',context:'할아버지는 자신이 가진 건물을 손자에게 무료로 넘겨주었다. 가족은 이 재산 이전을 ＿＿＿＿(이)라고 불렀다.',options:[],acceptedAnswers:['증여'],explanation:'살아 계신 할아버지가 자기 재산을 대가 없이 넘겼으므로 증여입니다.'},
  {slot:9,type:'subjective_recall',prompt:'살아 있는 사람이 자기 재산을 무상으로 다른 사람에게 주는 일입니다. 빈칸에 알맞은 어휘를 쓰세요.',context:'이모는 자기 그림을 조카의 소유로 넘겼다. 그림값이나 돌려받을 조건 없이 주었으므로 ＿＿＿＿에 해당한다.',options:[],acceptedAnswers:['증여'],explanation:'재산의 소유권을 아무 대가 없이 넘기는 상황이 증여입니다.'},
  {slot:10,type:'subjective_use',prompt:'',context:'',options:[],acceptedAnswers:[],explanation:'목표 어휘의 뜻이 드러나는 자신의 문장을 써 보세요.'}
 ])
}];

// Explicit historical alias only: reuse reviewed prediction situations while
// preserving the original noun, definition, domain and band in old assignments.
export function legacyAliasRows(rows){
 const source=rows.find(r=>r.word==='예측하다');
 if(!source)throw Error('Reviewed prediction source missing');
 return [{...structuredClone(source),word:'예측',canonicalWord:undefined,
  definition:'근거나 정보를 바탕으로 앞으로를 미리 판단함',domain:'사고',band:3,answerForm:'예측',
  questions:source.questions.map(q=>({...structuredClone(q),prompt:q.prompt.replaceAll('‘예측하다’','‘예측’'),acceptedAnswers:q.type==='subjective_use'?[]:['예측',...(q.acceptedAnswers.includes('예상')?['예상']:[])]}))}];
}
