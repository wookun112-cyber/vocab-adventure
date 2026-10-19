// Offline, editor-reviewed short cross-curricular reading prompts.
// These are reading exposures, NEVER independent recall or mastery receipts.
// Each task has exactly one question; the answers are meaning-focused, not trivia.
export const READING_EXPOSURE_POLICY='automatic-reading-breadth-20261019';
export const READING_PASSAGES=Object.freeze([
 {id:'volcano',topic:'과학 · 화산',words:['관찰','자료','분석','변화','근거','예측','영향','전달'],
  passage:'과학자들은 화산 주변 땅의 움직임을 계속 관찰했습니다. 여러 날 모은 자료를 분석하자 땅의 높이에 작은 변화가 나타났습니다. 과학자들은 이 자료를 근거로 화산이 활동할 가능성을 예측했습니다. 그리고 주민에게 미칠 영향을 살피고 안전 수칙을 전달했습니다.',
  tasks:[
   {word:'분석',prompt:'자료를 분석했다는 말은 어떤 행동에 가장 가까울까요?',options:['자료를 읽지 않고 버리는 것','자료를 나누어 살펴 특징과 관계를 알아보는 것','자료를 남몰래 보관하는 것','자료를 다른 곳으로 옮기는 것','자료가 없어도 짐작하는 것'],correct:1,explanation:'분석은 자료를 자세히 나누어 살펴 특징과 관계를 찾아내는 일이에요.'},
   {word:'예측',prompt:'과학자들이 화산 활동을 예측할 수 있었던 이유는 무엇일까요?',options:['근거 없이 소문을 믿었기 때문에','주민의 말을 모두 무시했기 때문에','기록과 관찰 자료를 근거로 판단했기 때문에','과거 사건을 그대로 외웠기 때문에','미래의 일을 실제로 보고 왔기 때문에'],correct:2,explanation:'예측은 관찰이나 자료 같은 근거를 이용해 앞으로의 일을 판단하는 거예요.'}
  ]},
 {id:'annals',topic:'역사 · 조선 시대 기록',words:['기록','사실','관점','비교','대조','증거','해석','판단'],
  passage:'조선 시대에 일어난 사건은 여러 기록에 남았습니다. 연구자는 기록을 읽고 확인할 수 있는 사실과 작성자의 관점을 구별합니다. 서로 다른 기록을 비교하고 대조하면 같은 사건도 다르게 설명됐다는 점을 알 수 있습니다. 연구자는 증거를 살핀 뒤 그 뜻을 해석하고 신중하게 판단합니다.',
  tasks:[
   {word:'관점',prompt:'같은 사건을 기록한 사람들의 관점이 다르다는 뜻은 무엇일까요?',options:['사건이 실제로 두 번 일어났다','사람들이 바라보고 생각하는 입장이 달랐다','기록을 모두 없애야 한다','사건의 날짜가 항상 바뀐다','어느 기록이나 반드시 거짓이다'],correct:1,explanation:'관점은 어떤 대상이나 사건을 바라보는 입장이에요.'},
   {word:'대조',prompt:'서로 다른 기록을 대조하는 까닭으로 가장 적절한 것은?',options:['모든 기록을 하나로 지우려고','글씨를 더 크게 쓰려고','기록을 외우기만 하려고','차이가 나는 부분을 뚜렷하게 살피려고','기록을 읽지 않으려고'],correct:3,explanation:'대조는 둘 이상을 맞대어 차이점을 분명히 살피는 활동이에요.'}
  ]},
 {id:'water',topic:'과학 · 물의 순환',words:['순환','증발','응결','온도','변화','원인','관찰','결과'],
  passage:'바다의 물은 태양열을 받아 증발하고 공기 중으로 올라갑니다. 수증기가 차가워지면 작은 물방울로 응결해 구름이 만들어집니다. 구름에서 내린 비가 다시 강과 바다로 모이는 과정을 물의 순환이라고 합니다. 과학자는 온도 변화를 관찰해 이런 현상의 원인과 결과를 설명합니다.',
  tasks:[
   {word:'순환',prompt:'이 글에서 물이 순환한다는 것은 어떤 뜻일까요?',options:['한곳에 영원히 멈춰 있는 것','정해진 과정을 거쳐 다시 이어지는 것','비가 한 번만 내리는 것','강이 바다보다 항상 뜨거운 것','물이 없어지는 것'],correct:1,explanation:'순환은 일정한 과정이 되풀이되어 이어지는 것이에요.'},
   {word:'원인',prompt:'수증기가 식으면 물방울로 변하는 현상에서 원인에 해당하는 것은?',options:['물방울이 만들어진 사실','하늘에 구름이 있는 위치','수증기가 차가워졌다는 조건','비를 맞은 사람의 반응','강물이 모이는 장소'],correct:2,explanation:'원인은 어떤 결과가 일어나게 만든 까닭이에요.'}
  ]},
 {id:'hangul',topic:'역사 · 훈민정음',words:['문자','표현','소통','기록','의미','백성','확산','영향'],
  passage:'조선의 세종은 많은 백성이 자신의 말을 글로 쉽게 표현하기 어렵다는 문제를 살폈습니다. 훈민정음이라는 문자가 만들어지면서 사람들은 생각과 의미를 글로 기록하고 소통할 새로운 길을 얻었습니다. 새로운 글자의 사용은 시간이 흐르며 확산했고 사람들의 삶에도 영향을 주었습니다.',
  tasks:[
   {word:'소통',prompt:'이 글에서 문자로 소통한다는 뜻에 가장 가까운 것은?',options:['상대의 생각을 무조건 막는 것','서로 생각과 뜻을 주고받는 것','글을 남기지 않고 숨기는 것','사람들을 멀리 떨어뜨리는 것','옛 기록을 모두 없애는 것'],correct:1,explanation:'소통은 생각이나 뜻을 주고받는 것이에요.'},
   {word:'확산',prompt:'글자 사용이 확산했다는 말의 뜻은?',options:['글자 하나가 사라졌다','글자의 모양이 모두 같아졌다','더 많은 곳과 사람에게 퍼졌다','기록이 한곳에만 남았다','글자가 쓰이지 않게 됐다'],correct:2,explanation:'확산은 어떤 현상이나 내용이 널리 퍼지는 것이에요.'}
  ]},
 {id:'elections',topic:'사회 · 의견을 모으는 과정',words:['시민','권리','공정','대표','주장','근거','결정','책임'],
  passage:'마을에서 새로운 공원을 만들 장소를 결정하려고 시민들이 모였습니다. 누구나 의견을 말할 권리가 있지만 다른 사람의 의견도 공정하게 들어야 합니다. 한 사람은 주장을 뒷받침하는 근거를 제시했습니다. 주민을 대표하는 사람들은 다양한 생각을 듣고 결과에 책임을 지기로 했습니다.',
  tasks:[
   {word:'근거',prompt:'주장을 뒷받침하는 근거로 알맞은 것은?',options:['막연히 좋을 것 같다는 느낌','상대방의 의견을 무시하는 말','주장과 관련된 조사 결과나 확인 가능한 사실','목소리를 크게 높이는 행동','내용과 상관없는 농담'],correct:2,explanation:'근거는 생각이나 주장을 뒷받침하는 까닭이나 자료예요.'},
   {word:'공정',prompt:'사람들의 의견을 공정하게 듣는 태도로 적절한 것은?',options:['친한 사람의 말만 듣기','서로 다른 사람의 의견도 같은 기준으로 살피기','큰소리만 내는 사람의 말 따르기','나와 다른 의견은 기록하지 않기','결과를 미리 정한 뒤 듣는 척하기'],correct:1,explanation:'공정은 한쪽에 치우치지 않고 같은 기준을 적용하는 것이에요.'}
  ]},
 {id:'forest',topic:'과학 · 숲의 생태계',words:['생물','환경','관찰','관계','변화','생존','영향','원인'],
  passage:'숲에는 서로 다른 생물이 함께 살아갑니다. 식물은 햇빛과 물이 필요하고, 곤충과 새는 먹이를 얻으며 복잡한 관계를 맺습니다. 과학자들은 숲의 환경을 관찰합니다. 나무의 수가 줄어드는 변화가 나타나면 생물의 생존에 어떤 영향을 주었는지, 그 원인은 무엇인지 살펴봅니다.',
  tasks:[
   {word:'관계',prompt:'이 글에서 생물들이 관계를 맺는다는 설명으로 적절한 것은?',options:['서로 아무 영향도 주지 않는다','한 생물이 모든 생물을 만든다','서로 연결되어 영향을 주고받는다','모든 생물이 똑같이 행동한다','숲 밖에서는 생물이 없다'],correct:2,explanation:'관계는 둘 이상의 대상이 서로 관련을 맺는 것이에요.'},
   {word:'영향',prompt:'나무가 줄어들어 새의 먹이가 부족해졌다면 어떤 설명이 맞을까요?',options:['나무의 변화가 새에게 영향을 주었다','새의 먹이는 항상 똑같다','나무와 새는 전혀 관련이 없다','새가 줄어들면 숲의 시간도 멈춘다','원인은 살펴볼 필요가 없다'],correct:0,explanation:'영향은 어떤 일이 다른 대상이나 상태에 변화를 일으키는 것이에요.'}
  ]},
 {id:'independence',topic:'역사 · 독립운동',words:['독립','권리','저항','협력','책임','기록','의미','공동'],
  passage:'일제강점기에는 나라의 독립을 바라는 사람들이 여러 곳에서 활동했습니다. 사람들은 자유와 권리를 지키기 위해 부당한 지배에 저항했고, 뜻을 같이하는 사람들과 협력했습니다. 각자의 행동에는 위험과 책임이 따랐습니다. 당시의 기록은 여러 사람이 공동의 목표를 향해 노력한 의미를 전합니다.',
  tasks:[
   {word:'협력',prompt:'사람들이 협력했다는 표현의 뜻으로 알맞은 것은?',options:['서로 힘을 합쳐 목표를 향해 일했다','혼자서 다른 사람을 모두 피했다','상대방에게 모든 책임을 떠넘겼다','정보를 일부러 숨기기만 했다','서로의 의견을 전혀 듣지 않았다'],correct:0,explanation:'협력은 서로 힘을 합하여 일을 해 나가는 것이에요.'},
   {word:'저항',prompt:'부당한 지배에 저항했다는 것은 무슨 뜻일까요?',options:['아무 문제 없이 받아들였다','나쁜 상황을 더 넓혔다','부당한 일에 맞서 거부하거나 행동했다','상황을 기록하지 않았다','책임이 없다고만 말했다'],correct:2,explanation:'저항은 부당하거나 원치 않는 것에 맞서 버티거나 행동하는 것이에요.'}
  ]},
 {id:'weather',topic:'과학 · 날씨를 예측하는 일',words:['기온','관찰','자료','분석','증가','변화','예측','판단'],
  passage:'기상 연구자들은 여러 지역의 기온과 바람을 관찰해 자료를 모읍니다. 기온이 오르는 지역과 내려가는 지역을 나누어 분석하면 날씨의 변화를 이해할 수 있습니다. 구름이 늘어나는 현상처럼 변화가 증가하는 모습을 살피고, 모은 정보를 바탕으로 내일의 날씨를 예측해 판단합니다.',
  tasks:[
   {word:'증가',prompt:'구름의 양이 증가했다는 말은?',options:['구름의 양이 줄었다','구름의 양이 더 많아졌다','구름이 움직이지 않는다','구름을 관찰하지 않았다','기온을 알 수 없게 됐다'],correct:1,explanation:'증가는 수나 양이 이전보다 늘어나는 것이에요.'},
   {word:'분석',prompt:'연구자들이 자료를 분석하는 목적과 가장 가까운 것은?',options:['근거를 살피지 않기 위해','관찰한 지역을 숨기기 위해','자료를 나누어 규칙이나 특징을 찾기 위해','기온을 마음대로 바꾸기 위해','비가 내리는 것을 막기 위해'],correct:2,explanation:'분석은 자료의 특징과 관계를 자세히 살펴 알아보는 활동이에요.'}
  ]},
 {id:'trade',topic:'사회 · 물건의 가격',words:['생산','공급','수요','소비','가격','변화','분석','결과'],
  passage:'과수원에서 사과를 생산한 사람은 시장에 사과를 공급합니다. 사과를 사서 소비하려는 사람이 많아지면 수요가 늘어납니다. 공급되는 사과의 양과 사람들의 수요에 따라 가격은 달라질 수 있습니다. 상인들은 판매 자료를 분석하여 가격 변화의 원인과 결과를 살펴봅니다.',
  tasks:[
   {word:'수요',prompt:'사과를 사고 싶어 하는 사람이 많아졌을 때 증가한 것은?',options:['공급된 사과의 무게만','사과를 사려는 수요','사과의 생산 날짜','과수원의 크기만','사과가 사라지는 속도'],correct:1,explanation:'수요는 어떤 물건이나 서비스를 필요로 하여 사거나 이용하려는 정도예요.'},
   {word:'공급',prompt:'과수원에서 수확한 사과를 시장에 공급한다는 뜻은?',options:['사과를 모두 숨겨 두는 것','사과를 한 번도 기르지 않는 것','필요로 하는 곳에 사과를 내어 주는 것','사과의 맛을 모른다고 하는 것','사과를 먹어 없애는 것'],correct:2,explanation:'공급은 필요한 재화나 물건을 내어 주는 것이에요.'}
  ]}
]);
function hash(str){let n=2166136261;for(const ch of String(str||''))n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0}
export function chooseReadingPassage(newWords=[],reviewWords=[],seed=''){
 const fresh=new Set(newWords.map(w=>typeof w==='string'?w:w?.w||w?.word));
 const review=new Set(reviewWords.map(w=>typeof w==='string'?w:w?.w||w?.word));
 const offset=hash(seed)%READING_PASSAGES.length;
 const ranked=READING_PASSAGES.map((item,i)=>{
  const novel=item.words.filter(w=>fresh.has(w)).length;
  const known=item.words.filter(w=>review.has(w)).length;
  return {item,score:novel*4+known*2,offset:(i-offset+READING_PASSAGES.length)%READING_PASSAGES.length};
 }).sort((a,b)=>b.score-a.score||a.offset-b.offset);
 return ranked[0].item;
}
export function readingPassageById(id){return READING_PASSAGES.find(item=>item.id===id)||null}
export function prepareReadingExposure(newWords=[],reviewWords=[],seed=''){
 const passage=chooseReadingPassage(newWords,reviewWords,seed);
 return {policy:READING_EXPOSURE_POLICY,id:passage.id,step:0,answers:[],completed:false,exposureRecorded:false};
}
export function recordedExposure(learner,word,day){
 const prev=learner.readingExposure||{},old=prev[word]||{};
 learner.readingExposure={...prev,[word]:{firstDay:old.firstDay||day,lastDay:day,count:Math.min(10000,(old.count||0)+1)}};
}
