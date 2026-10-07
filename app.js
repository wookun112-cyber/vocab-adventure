import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {LEARNING_MODEL,LEARNING_TYPES,LEARNING_LABELS,STAGE_LABELS,learningDay,dateAfter,daysBetween,studyBudget,buildLearningPlan,masteryConfirmed,recordLearningEvidence,researchSchedule,updateLearningLevels,summarizeEvidence} from './lib/learning-model.js';
const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const today=()=>learningDay();
const dayOffset=n=>dateAfter(today(),n);
const isDue=date=>!date||date<=today();

const SEED_WORDS=[
{w:'근거',d:'생각이나 주장을 뒷받침하는 까닭이나 자료',pair:'주장',cat:'사고',lv:2},
{w:'객관적',d:'개인의 느낌보다 확인 가능한 사실을 바탕으로 하는',pair:'주관적',cat:'사고',lv:3},
{w:'구체적',d:'내용이 자세하고 분명한',cat:'국어',lv:2},
{w:'예측',d:'근거나 정보를 바탕으로 앞으로를 미리 판단함',pair:'추측',cat:'사고',lv:3},
{w:'추측',d:'확실한 근거가 부족한 상태에서 짐작함',pair:'예측',cat:'사고',lv:3},
{w:'결과',d:'어떤 원인이나 행동 뒤에 생긴 일',pair:'원인',cat:'사고',lv:2},
{w:'원인',d:'어떤 일이 생기게 만든 까닭',pair:'결과',cat:'사고',lv:2},
{w:'비교',d:'둘 이상의 공통점과 차이점을 살펴봄',pair:'대조',cat:'국어',lv:3},
{w:'대조',d:'서로 다른 점이 뚜렷하게 드러나도록 견주어 봄',pair:'비교',cat:'국어',lv:3},
{w:'주장',d:'자신의 생각이나 의견을 내세움',pair:'근거',cat:'국어',lv:3},
{w:'사실',d:'실제로 있었거나 확인할 수 있는 일',pair:'의견',cat:'국어',lv:2},
{w:'의견',d:'어떤 일에 대한 사람의 생각이나 판단',pair:'사실',cat:'국어',lv:2},
{w:'의도',d:'어떤 행동을 하려고 마음먹은 목적이나 생각',pair:'결과',cat:'사고',lv:3},
{w:'상속',d:'사망한 사람의 재산이나 권리를 이어받는 것',pair:'증여',cat:'사회',lv:4},
{w:'증여',d:'살아 있는 사람이 재산을 대가 없이 주는 것',pair:'상속',cat:'사회',lv:4},
{w:'영향',d:'어떤 것이 다른 것에 미치는 작용',cat:'사회',lv:2},
{w:'변화',d:'이전과 달라짐',cat:'과학',lv:2},
{w:'관찰',d:'대상을 자세히 살펴보고 알아봄',cat:'과학',lv:2},
{w:'특징',d:'다른 것과 구별되게 하는 성질',cat:'국어',lv:2},
{w:'과정',d:'일이 진행되어 가는 순서나 단계',cat:'사고',lv:2},
{w:'해석',d:'말이나 자료의 뜻을 풀어 이해함',cat:'국어',lv:4},
{w:'맥락',d:'말이나 글이 앞뒤로 이어지는 관계와 상황',cat:'국어',lv:4},
{w:'타당하다',d:'이치에 맞고 옳다고 받아들일 만하다',cat:'사고',lv:4},
{w:'반박',d:'다른 사람의 주장이나 의견이 옳지 않다고 근거를 들어 말함',cat:'국어',lv:4},
{w:'요약',d:'중요한 내용을 짧게 줄여 정리함',cat:'국어',lv:3},
{w:'공통점',d:'둘 이상의 대상이 함께 가진 점',cat:'국어',lv:2},
{w:'차이점',d:'서로 같지 않은 점',cat:'국어',lv:2},
{w:'조건',d:'어떤 일이 이루어지기 위해 필요한 사항',cat:'수학',lv:3},
{w:'기준',d:'판단하거나 비교할 때 바탕이 되는 것',cat:'사고',lv:3},
{w:'효율',d:'들인 노력이나 시간에 비해 얻는 결과의 정도',cat:'생활',lv:4}
].map(x=>({...x,band:x.band||x.lv||3,source:'seed',example:x.example||'',contrast:x.contrast||''}));
const BAND_NAMES={1:'초1~2',2:'초3~4',3:'초5~6',4:'중1',5:'중2',6:'중3',7:'고1',8:'고2',9:'고3'};
const bandLabel=v=>BAND_NAMES[clamp(Math.round(Number(v)||3),1,9)];
const FIXED_CACHE=new Map();
let WORDS=[...SEED_WORDS];
const byWord=w=>WORDS.find(x=>x.w===w);
const freshWord=()=>({
 seen:0,correct:0,wrong:0,assisted:0,streak:0,days:[],level:1,mastered:false,last:null,types:{},confusions:[],
 independentCorrect:0,contextSuccess:0,targetRecall:0,recallDays:[],hintedCorrect:0,revealed:0,
 usedPassageKeys:[],problemHistory:[],contextKeys:[],reviewStage:0,nextReviewAt:null,lastReviewAt:null,supportLevel:0,introducedAt:null
});
const hydrateWordState=raw=>{
 const x={...freshWord(),...(raw||{})};
 x.days=Array.isArray(x.days)?x.days:[];
 x.recallDays=Array.isArray(x.recallDays)?x.recallDays:[];
 x.contextKeys=Array.isArray(x.contextKeys)?x.contextKeys:[];
 x.usedPassageKeys=Array.isArray(x.usedPassageKeys)?x.usedPassageKeys:[];
 x.problemHistory=Array.isArray(x.problemHistory)?x.problemHistory:[];
 x.confusions=Array.isArray(x.confusions)?x.confusions:[];
 x.types=x.types&&typeof x.types==='object'?x.types:{};
 return x;
};

// Exploration levels reward practice; school-stage difficulty remains independent.
const CHARACTERS=[
 ['puppy','구름 강아지','#f2c78e','dog'],['dragon','불꽃 드래곤','#86cba7','horn'],
 ['cat','달빛 고양이','#baacf0','cat'],['fox','햇살 여우','#f3aa75','cat'],
 ['bear','꿀곰','#cba580','round'],['panda','대나무 판다','#ecedf4','panda'],
 ['rabbit','별토끼','#e8bcdf','long'],['wolf','눈꽃 늑대','#9fb9ce','cat'],
 ['lion','용기 사자','#edc16c','lion'],['tiger','번개 호랑이','#eda875','tiger'],
 ['frog','초록 개구리','#a1d887','frog'],['slime','젤리 슬라임','#9edbcf','slime'],
 ['robot','탐험 로봇','#a6c8ed','robot'],['monster','꼬마 몬스터','#b3a6e5','horn'],
 ['owl','지혜 부엉이','#c6aa8c','owl'],['penguin','얼음 펭귄','#a3b9d3','penguin'],
 ['chick','콩알 병아리','#f3d37c','chick'],['koala','나무 코알라','#b6c2cc','round'],
 ['unicorn','꿈빛 유니콘','#d7bce9','unicorn'],['dino','숲속 공룡','#a8cf8a','dino']
].map(([id,name,color,shape])=>({id,name,color,shape}));
const DEFAULT_CHARACTERS={ayoung:'puppy',inseong:'dragon',guest:'robot'};
const EVOLUTION_FORMS=[
 ['씨앗','#a5b4ca','작은 반짝임'],['새싹','#70bc9b','빛나는 스카프'],['견습','#66a8d8','보석 별 배지'],
 ['모험가','#6f90de','금빛 테두리 망토'],['수호자','#a187da','보석 수호 장비'],['정예','#d580af','빛나는 보석 갑옷'],
 ['영웅','#e6a16c','겹겹이 펼친 빛의 날개'],['별빛','#e3b85d','별자리와 이중 오라'],['전설','#d4a44b','보석 왕관과 황금 날개'],
 ['궁극','#9174dd','무지개 날개·왕관·은하 오라']
].map(([name,color,feature],i)=>({stage:i+1,name,color,feature,minRank:91-i*10,maxRank:100-i*10}));
const evolutionForRank=rank=>clamp(11-Math.ceil(clamp(Number(rank)||100,1,100)/10),1,10);
function evolutionState(c){
 const raw=c.characterEvolution||{},unlockedStage=clamp(Math.floor(Number(raw.unlockedStage)||1),1,10);
 return {version:1,unlockedStage,equippedStage:clamp(Math.floor(Number(raw.equippedStage)||unlockedStage),1,unlockedStage),bestRank:Number.isInteger(raw.bestRank)&&raw.bestRank>=1&&raw.bestRank<=100?raw.bestRank:null,awardedAt:Number.isFinite(Date.parse(raw.awardedAt))?raw.awardedAt:null};
}
let characterSvgSequence=0;
function characterSvg(id,evolution=1){
 const a=CHARACTERS.find(x=>x.id===id)||CHARACTERS[0],c=a.color,k=a.shape,stage=clamp(Math.floor(Number(evolution)||1),1,10),form=EVOLUTION_FORMS[stage-1],accent=form.color;
 const uid='evo-'+(++characterSvgSequence),power=['horn','dino','robot','lion','tiger'].includes(k)||a.id==='wolf';
 const tint=(hex,amount)=>'#'+hex.slice(1).match(/../g).map(v=>{const n=parseInt(v,16);return Math.round(amount>=0?n+(255-n)*amount:n*(1+amount)).toString(16).padStart(2,'0')}).join('');
 const paint=name=>`url(#${uid}-${name})`;
 const defs=`<defs><radialGradient id="${uid}-skin" cx="35%" cy="25%" r="80%"><stop stop-color="${tint(c,.55)}"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="${tint(c,-.18)}"/></radialGradient><linearGradient id="${uid}-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${tint(accent,.65)}"/><stop offset=".38" stop-color="${accent}"/><stop offset=".62" stop-color="${tint(accent,.35)}"/><stop offset="1" stop-color="${tint(accent,-.32)}"/></linearGradient><linearGradient id="${uid}-gold" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#fff9d2"/><stop offset=".4" stop-color="#ffe495"/><stop offset=".7" stop-color="#eab74a"/><stop offset="1" stop-color="#bd7d27"/></linearGradient><linearGradient id="${uid}-wing" x1="0" y1="0" x2="1" y2="1">${(stage===10?['#a6ebf2','#b8b6ff','#f7b7dd','#fff1a7']:['#fffde9',tint(accent,.58),accent]).map((color,i,arr)=>`<stop offset="${i/(arr.length-1)}" stop-color="${color}"/>`).join('')}</linearGradient><radialGradient id="${uid}-aura"><stop offset=".35" stop-color="${tint(accent,.3)}" stop-opacity="0"/><stop offset=".75" stop-color="${accent}" stop-opacity="${stage>=8?.2:.1}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><linearGradient id="${uid}-gem" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7ffff"/><stop offset=".4" stop-color="${stage>=9?'#8be7df':tint(accent,.48)}"/><stop offset="1" stop-color="${stage>=9?'#3b9cc2':tint(accent,-.25)}"/></linearGradient></defs>`;
 let ears='';
 if(['cat','tiger'].includes(k))ears=`<path d="M24 42 20 17 43 31M56 31 80 17 76 42" fill="${c}" stroke="#39465c" stroke-width="2"/>`;
 else if(k==='dog')ears=`<ellipse cx="24" cy="46" rx="12" ry="22" fill="#bd8d66"/><ellipse cx="76" cy="46" rx="12" ry="22" fill="#bd8d66"/>`;
 else if(k==='long')ears=`<ellipse cx="36" cy="26" rx="9" ry="22" fill="${c}"/><ellipse cx="64" cy="26" rx="9" ry="22" fill="${c}"/><path d="M36 11v23M64 11v23" stroke="#f7e5ef" stroke-width="5" stroke-linecap="round"/>`;
 else if(['horn','unicorn','dino'].includes(k))ears=k==='unicorn'?'<path d="m43 33 7-25 9 25" fill="#f5cd77" stroke="#cda559" stroke-width="2"/>':`<path d="m23 37 3-22 16 17m19 0 13-17 3 22" fill="#f6cf80" stroke="#bb9363" stroke-width="2"/>`;
 else if(['round','panda'].includes(k))ears=`<circle cx="27" cy="31" r="13" fill="${k==='panda'?'#55617c':c}"/><circle cx="73" cy="31" r="13" fill="${k==='panda'?'#55617c':c}"/>`;
 else if(k==='robot')ears='<path d="M50 30V15" stroke="#55617c" stroke-width="4"/><circle cx="50" cy="12" r="5" fill="#f5c46d"/><rect x="14" y="44" width="12" height="22" rx="5" fill="#7295bd"/><rect x="74" y="44" width="12" height="22" rx="5" fill="#7295bd"/>';
 else if(k==='frog')ears=`<circle cx="32" cy="32" r="13" fill="${c}"/><circle cx="68" cy="32" r="13" fill="${c}"/>`;
 let detail='';
 if(k==='lion')ears='<circle cx="50" cy="53" r="39" fill="#c79158"/>';
 if(['panda','owl'].includes(k))detail='<ellipse cx="36" cy="48" rx="11" ry="13" fill="#55617c"/><ellipse cx="64" cy="48" rx="11" ry="13" fill="#55617c"/>';
 if(k==='penguin')detail='<ellipse cx="50" cy="59" rx="24" ry="28" fill="#f8fbff"/>';
 if(k==='tiger')detail='<path d="m26 50 9 4-9 4m48-8-9 4 9 4M45 32l5 9 5-9" stroke="#906445" stroke-width="3" fill="none" stroke-linecap="round"/>';
 if(k==='dino')detail='<path d="m44 32 6-10 6 10" fill="#76a465"/>';
 const face=k==='robot'?`<rect x="24" y="30" width="52" height="49" rx="15" fill="${paint('skin')}" stroke="${tint(c,-.2)}" stroke-width="1"/>`:k==='slime'?`<path d="M17 68Q18 24 50 28q31 0 33 40Q50 90 17 68" fill="${paint('skin')}" stroke="${tint(c,-.2)}" stroke-width="1"/>`:`<ellipse cx="50" cy="55" rx="29" ry="29" fill="${paint('skin')}" stroke="${tint(c,-.2)}" stroke-width="1"/>`;
 const mouth=['chick','owl','penguin'].includes(k)?'<path d="m43 60 7 8 7-8" fill="#efaa54"/>':'<path d="M42 64q8 9 16 0" stroke="#39465c" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
 const star=(x,y,size,color)=>`<path d="M${x} ${y-size}l${size*.3} ${size*.7} ${size*.7} ${size*.3}-${size*.7} ${size*.3}-${size*.3} ${size*.7}-${size*.3}-${size*.7}-${size*.7}-${size*.3} ${size*.7}-${size*.3}Z" fill="${color}"/>`;
 const gem=(x,y,r)=>`<path d="M${x} ${y-r} ${x+r*.75} ${y} ${x} ${y+r} ${x-r*.75} ${y}Z" fill="${paint('gem')}" stroke="#fff6d5" stroke-width=".7"/><path d="M${x} ${y-r}v${r*2}m${-r*.75} ${-r}h${r*1.5}" stroke="#fff" opacity=".6" stroke-width=".6"/>`;
 let back=`<circle class="evo-aura" cx="50" cy="50" r="57" fill="${paint('aura')}"/>`,front='';
 if(stage>=4)back+=`<path d="M29 62Q16 75 10 99l18-3 22 6 22-6 18 3Q84 75 71 62Z" fill="${paint('metal')}" stroke="${stage>=6?'#f9dc89':tint(accent,.6)}" stroke-width="1.6"/><path d="M29 72 20 93l30-5 30 5-9-21" fill="none" stroke="#fff4cf" stroke-width="1.5" opacity=".65"/>`;
 if(stage>=7){
  const wing=power?'M28 72C10 67 1 55-4 29l14 9L5 17l16 16L19 9l17 28 1 27Z':'M28 74C11 69-1 52 0 29c8 3 14 9 20 17C12 31 11 21 13 13c12 9 21 27 23 50Z';
  const feather=power?'M27 64 6 36m24 20L12 25m20 23L22 19':'M28 65Q10 49 7 36m24 23Q18 38 18 27m8 43Q9 62 5 54';
  back+=`<g class="evo-wings" fill="${paint('wing')}" stroke="${stage>=9?'#e7b956':accent}" stroke-width="1.2"><path d="${wing}"/><path d="${wing}" transform="translate(100 0) scale(-1 1)"/><g fill="none" stroke="#fff9e5" stroke-width="1.3" opacity=".8"><path d="${feather}"/><path d="${feather}" transform="translate(100 0) scale(-1 1)"/></g></g>`;
 }
 if(stage>=8){
  back+=`<g class="evo-orbit" fill="none" stroke="${paint('gold')}"><circle cx="50" cy="48" r="48" stroke-width="1.6"/><circle cx="50" cy="48" r="43" stroke-width=".6" stroke-dasharray="7 5" opacity=".8"/></g>`;
  for(let i=0;i<(stage===10?10:6);i++){const angle=i*Math.PI*2/(stage===10?10:6),x=50+48*Math.cos(angle),y=48+48*Math.sin(angle);back+=`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.8" fill="${i%2?'#fff0af':tint(accent,.45)}"/>`;}
 }
 if(stage===10){
  back+=`<ellipse class="evo-orbit" cx="50" cy="48" rx="56" ry="43" transform="rotate(-27 50 48)" fill="none" stroke="#a4dcf0" stroke-width="1.3" stroke-dasharray="20 5 3 5"/><ellipse cx="50" cy="48" rx="56" ry="43" transform="rotate(27 50 48)" fill="none" stroke="#e6b9f2" stroke-width="1.1" opacity=".85"/>`;
  front+=`<path d="m23 72-10 12 13-2m51-10 10 12-13-2" fill="${paint('wing')}" stroke="#ffe7a8" stroke-width="1"/>`;
 }
 if(stage>=2)front+=`<path d="M27 74q23 10 46 0l-4 10q-19 7-38 0Z" fill="${paint('metal')}" stroke="${tint(accent,.6)}" stroke-width=".8"/><path d="m59 81 9 17 7-15" fill="${paint('metal')}"/><path d="M30 77q20 8 40 0" fill="none" stroke="#fff" stroke-width="1" opacity=".7"/>`;
 if(stage>=3)front+=`<circle cx="37" cy="81" r="6.5" fill="${paint('gold')}" stroke="#e8bc64" stroke-width=".8"/>${star(37,81,4.5,tint(accent,-.2))}${gem(37,81,2.4)}`;
 if(stage>=5)front+=`<path d="m24 69 11 5-4 15-12-7m57-13-11 5 4 15 12-7" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="1.8"/><path d="m23 75 9 3m45-3-9 3" stroke="#fff6cd" stroke-width="1"/>${gem(25,78,3.3)}${gem(75,78,3.3)}`;
 if(stage>=6)front+=`<path d="M33 83q17 8 34 0l-3 14H36Z" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="1.6"/><path d="m37 86 13 8 13-8m-26 6 8-3m18 3-8-3" stroke="#fff1c0" stroke-width="1" fill="none"/>${gem(50,88,stage>=9?6:4.5)}`;
 if(stage>=9)front+=`<path d="m33 24-3-16 11 7L50 1l9 14 11-7-3 16Z" fill="${paint('gold')}" stroke="#c68b38" stroke-width="1"/><path d="M33 24q17 4 34 0v5q-17 4-34 0Z" fill="${paint('metal')}" stroke="#ffe8a4" stroke-width=".8"/>${gem(50,17,5)}${gem(37,23,2.6)}${gem(63,23,2.6)}<circle cx="30" cy="8" r="2" fill="#fff0ab"/><circle cx="50" cy="1" r="2.6" fill="#fff3c2"/><circle cx="70" cy="8" r="2" fill="#fff0ab"/>`;
 const spots=[[84,77],[15,18],[87,22],[10,82],[90,58],[12,51],[25,5],[77,5],[29,100],[74,98],[50,-4],[50,106]];
 let sparks='';for(let i=0;i<Math.min(spots.length,1+Math.floor(stage*1.1));i++){const [x,y]=spots[i];sparks+=`<g class="evo-spark" style="--spark-delay:${(i*.23).toFixed(2)}s">${star(x,y,stage>=8?(i%3===0?4.5:2.7):2.2,i%3===1?tint(accent,.25):'#f9d477')}</g>`;}
 if(stage>=8&&!power)back+=`<path d="M7 73q-7-7 0-10 7 3 0 10m87-30q-7-7 0-10 7 3 0 10" fill="${tint(accent,.25)}" opacity=".8"/>`;
 const shine=stage>=5?`<path d="M31 37q11-7 21-3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".4"/>`:'';
 return `<svg class="evo-character" data-evo-stage="${stage}" viewBox="-12 -14 124 124" role="img" aria-label="${a.name} · 진화 ${stage}단계 ${form.name}" xmlns="http://www.w3.org/2000/svg">${defs}<circle cx="50" cy="51" r="46" fill="${c}" opacity=".12"/><ellipse cx="50" cy="101" rx="28" ry="3" fill="${accent}" opacity=".16"/>${back}${ears}${face}${detail}${shine}<circle cx="36" cy="49" r="4.3" fill="#25344d"/><circle cx="64" cy="49" r="4.3" fill="#25344d"/><circle cx="35" cy="48" r="1.6" fill="white"/><circle cx="63" cy="48" r="1.6" fill="white"/><ellipse cx="30" cy="61" rx="6" ry="3" fill="#e98b96" opacity=".5"/><ellipse cx="70" cy="61" rx="6" ry="3" fill="#e98b96" opacity=".5"/>${mouth}${front}${sparks}</svg>`;
}

function exploration(c,profile=state.selected){
 if(!CHARACTERS.some(a=>a.id===c.characterId))c.characterId=DEFAULT_CHARACTERS[profile]||'puppy';
 if(c.exploration?.version!==1){
  const words=Object.values(c.words||{});
  c.exploration={version:1,xp:words.reduce((n,w)=>n+Math.max(0,Number(w.seen)||0)*5+Math.max(0,Number(w.independentCorrect)||0)*3,0),days:{}};
 }
 c.exploration.xp=Math.max(0,Math.floor(Number(c.exploration.xp)||0));
 c.exploration.days=c.exploration.days&&typeof c.exploration.days==='object'?c.exploration.days:{};
 return c.exploration;
}
const explorationLevel=xp=>1+Math.floor(xp/200);
function rewardAnswer(q,independent){
 if(!authUser||!session?.lessonId||session.account!==authUser.id||session.profile!==state.selected)return 0;
 const game=exploration(child()),date=today(),day=game.days[date]||(game.days[date]={keys:[],bonus:false});
 const key=session.lessonId+':'+session.results.length;
 // Same question across lessons on one day counts once; resuming also counts once.
 const passage=q.signature||[q.w.w,q.type,q.ctx,q.q].join('|');
 if(day.keys.length>=30||day.keys.some(x=>x.key===key||x.passage===passage))return 0;
 const xp=5+(independent?3:0);day.keys.push({key,passage});game.xp+=xp;
 for(const old of Object.keys(game.days).sort().slice(0,-60))delete game.days[old];
 return xp;
}
function rewardCompletion(){
 if(!authUser||session.account!==authUser.id||session.profile!==state.selected||session.mode==='level'||session.results.length<20)return 0;
 const game=exploration(child()),day=game.days[today()]||(game.days[today()]={keys:[],bonus:false});
 if(day.bonus)return 0;day.bonus=true;game.xp+=40;return 40;
}
const BASE_RIVAL_NAMES=['별빛대장','용감한참새','책먹는공룡','우주고양이','초록번개','달토끼','구름기사','문장마법사','호기심곰','바람여우','반짝연필','숲속탐정','젤리전사','파도펭귄','불꽃소년','꿈꾸는별','햇살강아지','나무부엉이','꼬마로봇','은빛늑대','새싹요정','민트구름','복숭아곰','파란혜성','작은용','도토리친구','느긋한코알라','콩알병아리','무지개토끼','첫걸음탐험가'];
const RIVAL_PREFIXES=['푸른','노을','반짝','새벽','봄빛','달빛','초록','은하','바다','햇살'];
const RIVAL_FRIENDS=['고래','여우','토끼','사자','판다','호랑이','다람쥐','강아지','수달','부엉이'];
const VIRTUAL_NAMES=[...new Set([...BASE_RIVAL_NAMES,...RIVAL_PREFIXES.flatMap(prefix=>RIVAL_FRIENDS.map(friend=>prefix+friend))])].slice(0,98);
// Baseline distribution remains stable; daily changes stay inside each group.
const VIRTUAL_DIFFICULTIES=[9,8.5,8,7.5,7,6.5,
 ...Array.from({length:20},(_,i)=>Math.round((6.2-i*2.5/19)*10)/10),
 ...Array.from({length:71},(_,i)=>Math.round((3.4-i*2.3/70)*10)/10),1];
const rankingDifficulty=value=>Math.round(clamp(Number.isFinite(Number(value))?Number(value):2,1,9)*10)/10;
// A Seoul calendar day gives every device the same daily roster without AI calls.
const LEAGUE_DAY_MS=86400000;
const leagueDay=(date=new Date())=>Math.floor((date.getTime()+9*3600000)/LEAGUE_DAY_MS);
const leagueDate=(date=new Date())=>new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
function dailyRivalDifficulty(index,day=leagueDay()){
 const base=VIRTUAL_DIFFICULTIES[index];
 const wave=.18*Math.sin((day+index*17)*2*Math.PI/(10+index%7))+.08*Math.sin((day+index*11)*2*Math.PI/(7+index%5));
 const [low,high]=index<6?[6.4,9]:index<26?[3.5,6.3]:[1,3.4];
 return rankingDifficulty(clamp(base+wave,low,high));
}
function rivalDailyChange(index,day=leagueDay()){
 return Math.round((dailyRivalDifficulty(index,day)-dailyRivalDifficulty(index,day-1))*10)/10;
}
const dailyChangeLabel=change=>change>0?'▲ '+change.toFixed(1)+' 상승':change<0?'▼ '+Math.abs(change).toFixed(1)+' 하락':'— 변동 없음';
let renderedLeagueDate='';
const rankCaption=row=>(row.tied?'공동 ':'')+row.rank+'위';
function explorationRanking(c=child(),profile=state.selected,day=leagueDay()){
 const familyIds=['ayoung','inseong',...(profile==='guest'?['guest']:[])];
 const family=familyIds.map(id=>{
  const learner=id===profile?c:state.users[id];exploration(learner,id);
  return {id,name:learner.name,characterId:learner.characterId,difficulty:rankingDifficulty(learner.leagueLevel??learner.difficulty),virtual:false,family:true,isMe:id===profile};
 });
 const friends=VIRTUAL_NAMES.slice(0,100-family.length).map((name,i)=>({id:'virtual-'+i,name,characterId:CHARACTERS[(i*7+1)%CHARACTERS.length].id,difficulty:dailyRivalDifficulty(i,day),dailyChange:rivalDailyChange(i,day),virtual:true,family:false,isMe:false}));
 const rows=[...friends,...family].sort((a,b)=>b.difficulty-a.difficulty||Number(a.virtual)-Number(b.virtual)||a.id.localeCompare(b.id));
 let rank=0;
 return rows.map((x,i)=>{if(!i||x.difficulty!==rows[i-1].difficulty)rank=i+1;return {...x,rank,tied:rows.some((r,j)=>j!==i&&r.difficulty===x.difficulty)}});
}
function awardRankEvolutions(rows){
 if(!authUser)return [];
 const upgrades=[];let changed=false;
 for(const row of rows.filter(x=>x.family)){
  const c=state.users[row.id],previous=evolutionState(c),stage=Math.max(previous.unlockedStage,evolutionForRank(row.rank)),bestRank=Math.min(previous.bestRank||100,row.rank);
  if(!c.characterEvolution||c.characterEvolution.version!==1||stage>previous.unlockedStage||bestRank!==previous.bestRank){
   const improved=stage>previous.unlockedStage;
   c.characterEvolution={...previous,unlockedStage:stage,equippedStage:improved?stage:previous.equippedStage,bestRank,awardedAt:improved||!previous.awardedAt?new Date().toISOString():previous.awardedAt};
   storeLearnerCheckpoint(row.id);changed=true;
   if(improved)upgrades.push({profile:row.id,stage,rank:row.rank});
  }
 }
 if(changed){localSave();cloudSave().catch(()=>{})}
 return upgrades;
}
function equipEvolution(stage){
 const c=child(),owned=evolutionState(c),next=Number(stage);
 if(!authUser||!Number.isInteger(next)||next<1||next>owned.unlockedStage)return;
 c.characterEvolution={...owned,equippedStage:next};storeLearnerCheckpoint(state.selected);localSave();cloudSave().catch(()=>{});renderExploration();
 if($('characterStatus'))$('characterStatus').textContent='진화 '+next+'단계 '+EVOLUTION_FORMS[next-1].name+' 적용 완료';
}
function refreshDailyLeague(){if(renderedLeagueDate!==leagueDate())renderExploration()}
const leagueRefreshDelay=(now=Date.now())=>Math.max(1000,(leagueDay(new Date(now))+1)*LEAGUE_DAY_MS-9*3600000-now+50);
function scheduleDailyLeague(){setTimeout(()=>{refreshDailyLeague();scheduleDailyLeague()},leagueRefreshDelay())}
function selectCharacter(id){
 if(!authUser||!CHARACTERS.some(a=>a.id===id))return;
 child().characterId=id;exploration(child());storeLearnerCheckpoint(state.selected);localSave();cloudSave();renderExploration();
 $('characterStatus').textContent=CHARACTERS.find(a=>a.id===id).name+' 선택 완료';
}
function renderExploration(){
 if($('characterStatus'))$('characterStatus').textContent='';
 const date=new Date();renderedLeagueDate=leagueDate(date);
 const c=child(),rows=explorationRanking(c,state.selected,leagueDay(date)),me=rows.find(x=>x.isMe),ahead=rows.filter(x=>x.difficulty>me.difficulty).pop();
 awardRankEvolutions(rows);const owned=evolutionState(c),awardedToday=owned.awardedAt&&leagueDate(new Date(owned.awardedAt))===renderedLeagueDate;
 const rowSvg=x=>characterSvg(x.characterId,x.virtual?evolutionForRank(x.rank):evolutionState(state.users[x.id]).equippedStage);
 for(const id of ['ayoung','inseong','guest']){
  const u=state.users[id];exploration(u,id);
  for(const prefix of ['profileAvatar-','reportAvatar-'])if($(prefix+id))$(prefix+id).innerHTML=characterSvg(u.characterId,evolutionState(u).equippedStage);
 }
 if($('explorerAvatar'))$('explorerAvatar').innerHTML=characterSvg(c.characterId,owned.equippedStage);
 if($('explorerName'))$('explorerName').textContent=c.name+' · '+bandLabel(me.difficulty)+' 단계';
 if($('explorerRank'))$('explorerRank').textContent='현재 '+rankCaption(me)+' / '+rows.length+'명';
 if($('rankDifficultyLabel'))$('rankDifficultyLabel').textContent='리그 등급 '+me.difficulty.toFixed(1)+' · 출제 난이도 '+c.difficulty.toFixed(1)+' · 학습용 추정값';
 const nextRank=ahead?1+rows.filter(x=>!x.isMe&&x.difficulty>ahead.difficulty).length:me.rank;
 const target=ahead?'리그 등급 '+ahead.difficulty.toFixed(1)+'에 도달하면 '+(me.rank-nextRank)+'계단 올라갈 수 있어요! '+ahead.name+'에게 도전해요.':'최상위 등급이에요! 새로운 문맥에서도 이해를 이어가요.';
 if($('rankDailyUpdate'))$('rankDailyUpdate').textContent=renderedLeagueDate.replaceAll('-','.')+' · 매일 자정에 새 등급 반영';
 if($('rankTarget'))$('rankTarget').textContent=target;
 if($('characterTitle'))$('characterTitle').textContent=c.name+'의 캐릭터';
 if($('characterGrid'))$('characterGrid').innerHTML=CHARACTERS.map(a=>`<button type="button" class="character-choice${a.id===c.characterId?' selected':''}" data-character="${a.id}" aria-pressed="${a.id===c.characterId}">${characterSvg(a.id,owned.equippedStage)}<strong>${a.name}</strong><small>${a.id===c.characterId?'선택됨':'선택하기'}</small></button>`).join('');
 if($('evolutionSummary'))$('evolutionSummary').textContent='진화 '+owned.equippedStage+'단계 · '+EVOLUTION_FORMS[owned.equippedStage-1].name;
 if($('evolutionGoal'))$('evolutionGoal').textContent=owned.unlockedStage===10?'10단계 보상을 모두 획득했어요!':(100-owned.unlockedStage*10)+'위 안에 들면 다음 진화형을 받아요.';
 if($('evolutionNotice')){$('evolutionNotice').textContent=awardedToday?'✨ 최고 '+owned.bestRank+'위 · 진화 '+owned.unlockedStage+'단계 '+EVOLUTION_FORMS[owned.unlockedStage-1].name+' 획득':'';$('evolutionNotice').classList.toggle('hidden',!awardedToday)}
 if($('evolutionGrid'))$('evolutionGrid').innerHTML=EVOLUTION_FORMS.map(form=>{const unlocked=form.stage<=owned.unlockedStage;return `<button type="button" class="evolution-form${unlocked?' unlocked':' locked'}${form.stage===owned.equippedStage?' equipped':''}" data-evolution="${form.stage}" ${unlocked?'':'disabled'} aria-pressed="${form.stage===owned.equippedStage}">${characterSvg(c.characterId,form.stage)}<span class="evolution-range">${form.minRank}~${form.maxRank}위</span><strong>${form.stage}단계 · ${form.name}</strong><small>${form.feature}</small><b>${form.stage===owned.equippedStage?'사용 중':unlocked?'적용하기':'🔒 순위 보상'}</b></button>`}).join('');
 const card=x=>`<div class="podium-avatar">${rowSvg(x)}</div><span class="podium-place">${x.rank===1?'🥇':x.rank===2?'🥈':'🥉'} ${rankCaption(x)}</span><strong>${escapeHtml(x.name)}</strong><b>${bandLabel(x.difficulty)}</b><small>등급 ${x.difficulty.toFixed(1)}</small><small>진화 ${x.virtual?evolutionForRank(x.rank):evolutionState(state.users[x.id]).equippedStage}단계</small>${x.isMe?'<small>나</small>':x.family?'<small>가족</small>':''}`;
 if($('rankPodium'))$('rankPodium').innerHTML=[rows[1],rows[0],rows[2]].map(x=>`<div class="podium place-${x.rank}">${card(x)}</div>`).join('');
 if($('rankFamilyOverview'))$('rankFamilyOverview').innerHTML=rows.filter(x=>['ayoung','inseong'].includes(x.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(x=>`<div class="rank-family-card${x.isMe?' selected':''}"><div class="rank-avatar">${rowSvg(x)}</div><div><strong>${escapeHtml(x.name)}</strong><b>${rankCaption(x)}</b><small>${bandLabel(x.difficulty)} · 등급 ${x.difficulty.toFixed(1)}</small></div></div>`).join('');
 if($('rankMySummary'))$('rankMySummary').innerHTML=`<div class="rank-avatar">${characterSvg(c.characterId,owned.equippedStage)}</div><div><strong>${escapeHtml(c.name)} · ${rankCaption(me)}</strong><p>${escapeHtml(target)}</p></div><span class="level-badge">${bandLabel(me.difficulty)}<small>등급 ${me.difficulty.toFixed(1)}</small></span>`;
 if($('rankList'))$('rankList').innerHTML=rows.map(x=>`<li class="rank-row${x.family?' rank-family':''}${x.isMe?' rank-me':''}" data-rank-profile="${x.id}"><span class="rank-number">${x.rank}${x.tied?'<small>공동</small>':''}</span><div class="rank-avatar">${rowSvg(x)}</div><div class="rank-name"><strong>${escapeHtml(x.name)}</strong><small class="${x.virtual?'rank-change '+(x.dailyChange>0?'up':x.dailyChange<0?'down':'steady'):''}">${x.virtual?dailyChangeLabel(x.dailyChange):(x.isMe?'나 · ':'가족 · ')+'회상 기록 기반 등급'}</small></div><span class="level-badge">${bandLabel(x.difficulty)}<small>등급 ${x.difficulty.toFixed(1)}</small></span></li>`).join('');
}

const freshChild=name=>({
 name,difficulty:2,confidence:0,learningDays:0,sessions:[],
 words:Object.fromEntries(SEED_WORDS.map(x=>[x.w,freshWord()])),
 lastDate:null,levelTestCompleted:false,recentProblems:[]
});
const initial=()=>({v:5,curriculum:'elementary-to-high-3',selected:'ayoung',catalog:{},users:{ayoung:freshChild('아영'),inseong:freshChild('인성'),guest:freshChild('게스트')},updatedAt:Date.now()});
let state=initial(),authUser=null,deferredPrompt=null,session=null,current=0,selectedOption=null,answerSource='typed',saving=false,reportProfile=null,hintLevel=0,introIndex=0;

function child(){return state.users[state.selected]}
function wordState(w){
 const c=child(),current=c.words[w];
 if(!current)c.words[w]=freshWord();
 else if(current.__v!==2)c.words[w]={...hydrateWordState(current),__v:2};
 return c.words[w];
}
function localSave(){localStorage.setItem('vocab-adventure-v8',JSON.stringify(state))}
async function cloudLoad(){
 const {data,error}=await sb.from('app_state').select('state').eq('user_id',authUser.id).maybeSingle();
 if(error) throw error;
 state=mergeState(data?.state||initial());
 const recovered=mergeLearnerCheckpoints();
 localSave();renderAll();
 if(!data?.state||recovered)await cloudSave();
}
function rebuildCatalog(){
 WORDS=[...SEED_WORDS];
 const seen=new Set(WORDS.map(x=>x.w));
 for(const x of Object.values(state.catalog||{})){
   const studied=Object.values(state.users||{}).some(u=>(u?.words?.[x?.w]?.seen||0)>0||u?.words?.[x?.w]?.introducedAt);
   if(!studied||!x?.w||seen.has(x.w))continue;
   seen.add(x.w);
   WORDS.push({...x,band:clamp(Number(x.band)||3,1,9)});
 }
 for(const x of FIXED_CACHE.values()){
   if(!x?.w||seen.has(x.w))continue;
   seen.add(x.w);
   WORDS.push(x);
 }
}
function mergeState(raw){
 const base=initial(); const src=raw&&typeof raw==='object'?raw:{};
 base.catalog=src.catalog&&typeof src.catalog==='object'?src.catalog:{};
 base.selected=['ayoung','inseong','guest'].includes(src.selected)?src.selected:'ayoung';
 base.updatedAt=src.updatedAt||Date.now();
 for(const id of ['ayoung','inseong','guest']){
   const childSrc=src.users?.[id]||{},dst=base.users[id];
   Object.assign(dst,childSrc);
   dst.recentProblems=Array.isArray(childSrc.recentProblems)?childSrc.recentProblems.slice(-60):[];
   dst.words={...dst.words};
   for(const [w,st] of Object.entries(childSrc.words||{}))dst.words[w]={...hydrateWordState(st),__v:2};
   exploration(dst,id);
 }
 state=base;
 rebuildCatalog();
 return state;
}
let cloudSavePending=false,cloudSaveTask=null;
async function cloudSave(silent=true){
 if(!authUser)return;
 cloudSavePending=true;
 if(cloudSaveTask)return cloudSaveTask;
 const account=authUser.id;
 cloudSaveTask=(async()=>{
  saving=true;
  try{
   do{
    cloudSavePending=false;state.updatedAt=Date.now();localSave();
    const snapshot=JSON.parse(JSON.stringify(state));
    const {error}=await sb.from('app_state').upsert({user_id:account,state:snapshot,updated_at:new Date().toISOString()});
    $('cloudPill').textContent=error?'저장 오류':'클라우드 저장됨';$('cloudPill').classList.toggle('on',!error);
    if(error&&!silent)alert('클라우드 저장에 실패했어요. 인터넷 연결을 확인해 주세요.');
    if(error)break;
   }while(cloudSavePending&&authUser?.id===account);
  }finally{saving=false;cloudSaveTask=null}
 })();
 return cloudSaveTask;
}
function learnerCheckpointKey(profile,account=authUser?.id){return 'vocab-lesson-'+account+'-'+profile}
function savedLesson(profile=state.selected){
 const saved=state.users[profile]?.activeLesson;
 if(!saved||!authUser)return null;
 return saved.account===authUser?.id&&saved.profile===profile?saved:null;
}
function renderResumeButton(){
 if(preparingSession)return;
 const saved=savedLesson();
 $('startDaily').textContent=saved?(saved.nextIndex>=saved.target?'학습 완료 확인':'이어서 학습 · '+(saved.nextIndex+1)+'번째 문제'):'오늘의 학습 시작';
}
function storeLearnerCheckpoint(profile){
 if(!authUser)return;
 const c=state.users[profile];
 c.lessonCheckpointAt=Math.max(Date.now(),(c.lessonCheckpointAt||0)+1);
 try{localStorage.setItem(learnerCheckpointKey(profile),JSON.stringify({account:authUser.id,profile,savedAt:c.lessonCheckpointAt,learner:c,catalog:state.catalog}))}catch{}
}
function checkpointSession(){
 const active=session,p=active?.preparation;
 if(!authUser||!p||active.completed||active.account!==authUser.id||active.profile!==state.selected)return false;
 const nextIndex=active.results.length;
 state.users[active.profile].activeLesson={
  version:1,engine:active.engine||PREPARATION_ENGINE,id:active.lessonId,account:active.account,profile:active.profile,
  mode:active.mode,created:p.created,difficulty:active.difficulty,ability:active.ability,
  target:active.target,max:active.max,newWords:active.newWords,baseWords:active.baseWords,
  plans:p.plans,ready:[...p.ready],results:active.results,nextIndex,
  model:active.model,introAt:active.introAt,introWords:active.introWords,introCursor:active.introCursor,introDone:active.introDone,activeMs:activeTime(active),
  hintLevel:current===nextIndex?hintLevel:0
 };
 // Serialize immediately: a close before the cloud write completes still has
 // both the last result and its corresponding word statistics on this device.
 storeLearnerCheckpoint(active.profile);renderResumeButton();return true;
}
function mergeLearnerCheckpoints(){
 let changed=false;
 for(const profile of ['ayoung','inseong','guest']){
  let saved;try{saved=JSON.parse(localStorage.getItem(learnerCheckpointKey(profile))||'null')}catch{continue}
  const c=state.users[profile];
  if(saved?.account!==authUser?.id||saved.profile!==profile||!saved.learner||!(saved.savedAt>(c.lessonCheckpointAt||0)))continue;
  state.users[profile]=saved.learner;
  state.catalog={...state.catalog,...(saved.catalog||{})};changed=true;
 }
 if(changed)state=mergeState(state);
 return changed;
}
async function resumeLesson(saved){
 const profile=state.selected,account=authUser?.id;
 if(saved.version!==1||![PREPARATION_ENGINE,'10.8.0'].includes(saved.engine)||saved.profile!==profile||saved.account!==account||
  !Array.isArray(saved.plans)||saved.plans.length<20||saved.plans.length>30||
  !Array.isArray(saved.results)||!Number.isInteger(saved.target)||saved.target<1||saved.target>30||
  saved.results.length>saved.target||saved.nextIndex!==saved.results.length||!Array.isArray(saved.ready))throw new Error('저장된 학습 정보를 확인하지 못했어요. 기록은 보관되어 있습니다.');
 const ready=new Map(saved.ready);
 for(const [index,q] of ready)if(!Number.isInteger(index)||index<0||index>=saved.plans.length||!validPreparedQuestion(q,saved.plans[index]))throw new Error('저장된 문제의 검수 정보를 확인하지 못했어요.');
 for(let i=0;i<saved.results.length;i++)if(!ready.has(i))throw new Error('채점된 문제의 저장 정보를 확인하지 못했어요.');
 for(const plan of saved.plans)if(plan.w?.source==='fixed')FIXED_CACHE.set(plan.w.w,plan.w);
 rebuildCatalog();
const needsRecovery=saved.mode==='daily'&&Array.from({length:20},(_,i)=>i).some(i=>!ready.has(i));
 let remote=null;
 if(needsRecovery){
  remote=await serverLesson(profile);
  if(remote?.payload?.resumeId!==saved.id)throw new Error('남은 문제를 서버에서 준비 중이에요. 채점 기록은 유지됩니다. 잠시 뒤 다시 눌러 주세요.');
 }
 let p;
 if(!needsRecovery&&session?.lessonId===saved.id&&session.account===account&&session.profile===profile&&!session.preparation.cancelled)p=session.preparation;
 else{
  if(session?.preparation)session.preparation.cancel();
  const meta={engine:saved.engine,model:saved.model,key:preparationKey(saved.mode,profile,account),account,profile,mode:saved.mode,snapshot:preparationSnapshot(profile),created:saved.created,difficulty:saved.difficulty,newWords:saved.newWords,baseWords:saved.baseWords,plans:saved.plans,adopted:true};
  p=needsRecovery?createServerPreparation({...meta,serverId:remote.id},remote.payload.ready||saved.ready):createPreparation(meta,saved.ready);
 }
 // The lesson was consumed on its first start. Resuming must never consume it
 // again or ask the server for a replacement lesson.
 session={engine:saved.engine,model:saved.model,introAt:saved.introAt||0,introWords:saved.introWords||[],introCursor:saved.introCursor||0,introDone:saved.introDone!==false,activeMs:saved.activeMs||0,clockStarted:Date.now(),mode:saved.mode,queue:p.queue,preparation:p,results:saved.results.slice(),target:saved.target,max:saved.max||30,difficulty:saved.difficulty,ability:saved.ability,intros:[],newWords:saved.newWords,baseWords:saved.baseWords,validated:true,loadingQuestions:null,profile,account,lessonId:saved.id};
 Object.defineProperty(session,'pendingPlans',{get:()=>p.plans.slice(p.queue.length)});
 current=saved.nextIndex;introIndex=0;hintLevel=0;$('next').disabled=false;
 if(current>=session.target){finishSession();return}
 prepareExtensions(session);
 await withDeadline(needsRecovery?Promise.all(Array.from({length:20},(_,i)=>p.waitFor(i,true))):p.waitFor(current,true),QUESTION_WAIT_MS,'이어서 풀 문제를 서버에서 준비 중이에요. 채점 기록은 유지됩니다. 잠시 뒤 다시 눌러 주세요.');
 if(state.selected!==profile||authUser?.id!==account||session.preparation!==p)return;
 show('learn');renderQuestion(saved.hintLevel||0);
}

async function expandCatalog(band=3,mode='daily',count=24){
 if(!authUser)return 0;
 const {data}=await withDeadline(sb.auth.getSession(),10000,'로그인 상태 확인이 지연됐어요. 다시 눌러 주세요.'); const token=data.session?.access_token;
 if(!token)return 0;
 const oldText=$('cloudPill').textContent;
 $('cloudPill').textContent=mode==='diagnostic'?'진단 어휘 준비 중':'새 어휘 준비 중';
 try{
   const exclude=WORDS.map(x=>x.w).slice(-500);
   const r=await fetch('/api/vocab',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({band,mode,count,exclude})});
   if(!r.ok)return 0;
   const j=await r.json(); let added=0;
   for(const x of j.words||[]){
     if(!x?.w||byWord(x.w))continue;
     state.catalog[x.w]={...x,band:clamp(Number(x.band)||band,1,9)};
     added++;
   }
   rebuildCatalog(); localSave(); await cloudSave();
   return added;
 }catch{return 0}
 finally{$('cloudPill').textContent=oldText||'클라우드 연결'}
}
async function loadFixedCurriculum(bands,perBand=180){
 if(!authUser)return 0;
 let added=0;
 const studiedWords=Object.entries(child().words||{}).filter(([,st])=>(st?.seen||0)>0).map(([w])=>w);
 await Promise.all(bands.map(async b0=>{
   const b=clamp(Math.round(b0),1,9);
   const cached=[...FIXED_CACHE.values()].filter(x=>x.band===b).map(x=>x.w);
   const exclude=[...new Set([...studiedWords,...cached])].slice(-2500);
   const {data,error}=await sb.rpc('get_curriculum_sample',{p_band:b,p_limit:Math.min(200,perBand),p_exclude:exclude});
   if(error)return;
   for(const x of data||[]){
     if(FIXED_CACHE.has(x.word))continue;
     FIXED_CACHE.set(x.word,{
       w:x.word,d:x.definition,band:x.band,cat:x.domain,
       example:x.example||'',pair:x.confusion||'',contrast:x.contrast||'',source:'fixed'
     });
     added++;
   }
 }));
 if(added)rebuildCatalog();
 return added;
}
async function ensureCatalog(band=3,mode='daily'){
 const b=clamp(Math.round(Number(band)||3),1,9);
 const unseen=b0=>[...FIXED_CACHE.values()].filter(w=>w.band===b0&&!(child().words[w.w]?.seen)&&!child().words[w.w]?.introducedAt).length;
 if(mode==='diagnostic'){
   const missing=[1,2,3,4,5,6,7,8,9].filter(x=>unseen(x)<25);
   if(missing.length)await loadFixedCurriculum(missing,80);
   return;
 }
 const bands=[b-1,b,b+1].filter(x=>x>=1&&x<=9);
 const missing=bands.filter(x=>unseen(x)<25);
 if(missing.length)await loadFixedCurriculum(missing,180);
 const near=WORDS.filter(w=>w.source==='fixed'&&Math.abs((w.band||3)-b)<=1&&!(child().words[w.w]?.seen)&&!child().words[w.w]?.introducedAt).length;
 if(near<25)await loadFixedCurriculum(bands,200);
}
async function curriculumStatus(){
 const {data,error}=await sb.rpc('curriculum_status');
 if(error)return null;
 return Object.fromEntries((data||[]).map(x=>[Number(x.band),Number(x.word_count)]));
}
async function buildFixedCurriculum(){
 const btn=$('buildCurriculum'),progress=$('curriculumProgress');
 if(!authUser)return;
 const counts=await curriculumStatus();
 if(!counts){
   progress.textContent='어휘 목록을 확인할 수 없어요. 연결을 확인해 주세요.';
   btn.textContent='다시 확인';btn.disabled=false;
   return;
 }
 const total=Object.values(counts).reduce((a,b)=>a+Number(b||0),0);
 const ready=total>=5000&&total<=7000;
 progress.textContent=ready
   ?'2차 선별 완료 · 학습용 어휘 '+total.toLocaleString()+'개 · 단계는 권장 수준입니다.'
   :'현재 사용 가능 어휘 '+total.toLocaleString()+'개 · 목록을 점검해 주세요.';
 btn.textContent=ready?'어휘 DB 확인 완료':'다시 확인';
 btn.disabled=ready;
}
function scorePriority(w){
 const st=wordState(w.w);
 let p=st.wrong*6+(5-Math.min(5,st.streak))*2+(st.supportLevel||0)*4+(st.seen?2:0);
 if(isDue(st.nextReviewAt))p+=10;
 if(st.targetRecall<2)p+=4;
 if(st.mastered&&!isDue(st.nextReviewAt))p-=30;
 if(st.streak>=5&&!isDue(st.nextReviewAt))p-=25;
 return p+Math.random()*2;
}
function chooseNew(n=5){
 const target=child().difficulty;
 return WORDS.filter(w=>!(child().words[w.w]?.seen)&&!child().words[w.w]?.introducedAt)
   .map(w=>({w,score:Math.abs((w.band||3)-target)*5+(w.source==='fixed'?-3:2)+Math.random()*4}))
   .sort((a,b)=>a.score-b.score).slice(0,n).map(x=>x.w);
}
function chooseReview(n=15){
 const seen=WORDS.filter(w=>child().words[w.w]?.seen||child().words[w.w]?.introducedAt);
 const due=seen.filter(w=>isDue(wordState(w.w).nextReviewAt)).sort((a,b)=>scorePriority(b)-scorePriority(a));
 const active=seen.filter(w=>{
   const st=wordState(w.w);
   return !isDue(st.nextReviewAt)&&st.streak<5&&!st.mastered;
 }).sort((a,b)=>scorePriority(b)-scorePriority(a));
 const out=[];
 for(const w of [...due,...active]){
   if(out.some(x=>x.w===w.w))continue;
   out.push(w);if(out.length>=n)break;
 }
 return out;
}
function scheduleReview(st,{credit=0,independent=false,revealed=false,hintUsed=false}={}){
 if(credit>=1&&!independent&&!revealed&&!hintUsed)return;
 let days=1;
 const alreadyReviewedToday=st.lastReviewAt===today();
 if(revealed||credit<.5){
   st.reviewStage=0;days=1;
 }else if(hintUsed||credit<1){
   st.reviewStage=Math.min(st.reviewStage||0,1);days=1;
 }else if(independent){
   if(alreadyReviewedToday)return;
   const intervals=[1,3,7,14,30];
   const stage=Math.max(0,Math.min(intervals.length-1,Number(st.reviewStage)||0));
   days=intervals[stage];
   st.reviewStage=Math.min(stage+1,intervals.length-1);
 }
 st.lastReviewAt=today();
 st.nextReviewAt=dayOffset(days);
}
const QUIZ_TYPES=['mc_context','mc_usage','subjective_context','subjective_dialogue'];
const TYPE_SEQUENCE=[
 'mc_context','mc_usage','mc_context','mc_usage','mc_context',
 'subjective_context','mc_usage','subjective_dialogue','subjective_context','mc_context',
 'subjective_dialogue','mc_usage','subjective_context','subjective_dialogue','mc_context',
 'subjective_context','mc_usage','subjective_dialogue','subjective_context','subjective_dialogue',
 'mc_context','subjective_context','mc_usage','subjective_dialogue','mc_context',
 'subjective_context','mc_usage','subjective_dialogue','mc_context','subjective_context'
];
const TYPE_LABELS=LEARNING_LABELS;
const apiDomain=cat=>({'사고':'수학·논리','수학':'수학·논리','논리':'수학·논리'}[cat]||(['국어','사회','과학','수학·논리','감정·관계','생활'].includes(cat)?cat:'국어'));

function pickLeastUsed(candidates,usage,lastWord){
 const pool=candidates.filter(Boolean);
 if(!pool.length)return null;
 const sorted=[...pool].sort((a,b)=>(usage.get(a.w)||0)-(usage.get(b.w)||0)||Math.random()-.5);
 return sorted.find(x=>x.w!==lastWord)||sorted[0];
}
function makeQuestionPlan(newWords,reviewWords,total=20,mode='daily'){
 const plans=[],usage=new Map(),newQueue=[...newWords],all=[...reviewWords,...newWords];
 let lastWord='',objectiveSlot=0;
 for(let i=0;i<total;i++){
   const type=TYPE_SEQUENCE[i%TYPE_SEQUENCE.length];
   const objective=type.startsWith('mc_');
   let w=null;
   if(mode==='daily'&&i<5&&objective&&newQueue.length)w=newQueue.shift();
   if(!w){
     const candidates=all;
     w=pickLeastUsed(candidates,usage,lastWord);
   }
   if(!w)continue;
   usage.set(w.w,(usage.get(w.w)||0)+1);lastWord=w.w;
   const st=wordState(w.w);
   plans.push({
     id:String(i),type,w,
     answerSlot:objective?(objectiveSlot++%5):0,
     supportLevel:st.supportLevel||0,
     successStreak:st.streak||0,
     firstLearning:st.seen===0
   });
 }
 return plans;
}
function passageKeys(context,options=[]){
 const texts=[context,...options];
 const keys=new Set();
 for(const text of texts){
   const units=[String(text||''),...String(text||'').split(/[.!?。！？\n]+/)];
   for(const unit of units){
     const clean=unit.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
     if(clean.length<12)continue;
     let a=2166136261,b=5381;
     for(let i=0;i<clean.length;i++){a=Math.imul(a^clean.charCodeAt(i),16777619);b=Math.imul(b,33)^clean.charCodeAt(i);}
     keys.add((a>>>0).toString(16)+'-'+(b>>>0).toString(16));
   }
 }
 return [...keys];
}
function questionMemory(q){return {word:q.w.w,signature:q.signature||'',context:q.ctx||'',options:(q.opts||[]).map(o=>o.t)}}
function rememberQuestion(q){
 if(q.w?.source==='fixed')state.catalog[q.w.w]=q.w;
 const st=wordState(q.w.w),memory=questionMemory(q);
 st.usedPassageKeys=[...new Set([...(st.usedPassageKeys||[]),...passageKeys(memory.context,memory.options)])];
 if(!(st.problemHistory||[]).some(x=>x.context===memory.context&&JSON.stringify(x.options)===JSON.stringify(memory.options))){
   st.problemHistory=[...(st.problemHistory||[]),memory].slice(-8);
 }
}
const QUESTION_BATCH_SIZE=4;
const FIRST_QUESTION_COUNT=1;
let preparingSession=false;
const QUESTION_WAIT_MS=15000;
function withDeadline(task,milliseconds,message){
 let timer;
 return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds)})]).finally(()=>clearTimeout(timer));
}
async function fetchValidatedQuestions(plans,extraRecent=[],preparedQuestions=[],profile=state.selected){
 const {data}=await withDeadline(sb.auth.getSession(),10000,'로그인 상태 확인이 지연됐어요. 다시 눌러 주세요.'); const token=data.session?.access_token;
 if(!token)throw new Error('로그인이 필요합니다.');
 const body={
   items:plans.map(p=>{
     const st=state.users[profile].words[p.w.w]||{},queued=[...(session?.profile===profile?session.queue:[]),...preparedQuestions].filter(q=>q.w.w===p.w.w).map(questionMemory);
     return ({
     id:p.id,type:p.type,word:p.w.w,definition:p.w.d,band:p.w.band||3,domain:apiDomain(p.w.cat),
     example:p.w.example||'',contextSeed:p.contextSeed||'',answerSlot:p.answerSlot,supportLevel:p.supportLevel,
     successStreak:p.successStreak,firstLearning:p.firstLearning,needsCard:!!p.needsCard,structureNote:p.structureNote||'',stage:p.stage||'',
     previousContexts:[...(st.problemHistory||[]),...queued].slice(-4),
     usedPassageKeys:[...new Set([...(st.usedPassageKeys||[]),...queued.flatMap(q=>passageKeys(q.context,q.options))])]
   })}),
   recent:[...(state.users[profile].recentProblems||[]),...(extraRecent||[])].slice(-40)
 };
 const r=await fetch('/api/questions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
 if(!r.ok){
   const j=await r.json().catch(()=>({}));
   throw new Error([502,503,504].includes(r.status)?'문제를 준비하는 서버 응답이 늦어졌어요. 잠시 뒤 다시 눌러 주세요.':(j.error||'문제 검증에 실패했습니다.'));
 }
 const j=await r.json();
 if(!j.validated||!Array.isArray(j.questions)||j.questions.length!==plans.length)throw new Error('검증된 문제 수가 맞지 않습니다.');
 const planMap=new Map(plans.map(p=>[p.id,p]));
 return j.questions.map(q=>{
   const p=planMap.get(String(q.id)); if(!p)throw new Error('문제 연결 오류');
   return {
     w:p.w,type:q.type,stage:p.stage,needsCard:p.needsCard,learningCard:q.learningCard,answerForm:q.answerForm||p.w.w,label:TYPE_LABELS[q.type]||'문맥',q:q.prompt,ctx:q.context||'',
     showTarget:!!q.showTarget,open:q.type.startsWith('subjective_'),hideWord:!q.showTarget,
     opts:(q.options||[]).map(o=>({t:o.text,ok:!!o.correct,reason:o.reason||''})),
     acceptedAnswers:q.acceptedAnswers||[],hints:q.hints||[],feedbackCorrect:q.feedbackCorrect||'',
     signature:q.signature||'',validation:q.validation||null
   };
 });
}
const PREPARATION_ENGINE=LEARNING_MODEL;
const PREPARATION_CONCURRENCY=4;
const PREPARATION_TTL=36*60*60*1000;
const preparations=new Map(),preparationLoads=new Map();
const SCENARIOS=['집에서 가족과 계획을 세우는 일','학교에서 친구들과 함께 해결하는 일','동네에서 이웃을 돕는 일','숲에서 동식물을 살피는 일','가게에서 물건을 고르는 일','도서관에서 정보를 찾는 일','여행에서 새로운 곳을 알아보는 일','운동이나 놀이를 하는 일','과학 활동에서 작은 실험을 하는 일','비나 바람 때문에 계획을 바꾸는 일','공원이나 거리의 불편을 개선하는 일','친구와 의견이 달라 대화하는 일'];
function preparationSnapshot(profile){
 const c=state.users[profile];
 const words=Object.entries(c.words||{}).filter(([,s])=>s.seen>0||s.introducedAt).sort(([a],[b])=>a.localeCompare(b)).map(([w,s])=>[w,s.seen,s.correct,s.wrong,s.streak,s.supportLevel,s.nextReviewAt,s.lastFeedbackDate,(s.usedPassageKeys||[]).length,s.introducedAt||null]);
 return JSON.stringify([c.difficulty,c.levelTestCompleted,words,c.lastDate||null]);
}
function preparationKey(mode,profile=state.selected,account=authUser?.id){return 'vocab-prepared-'+account+'-'+profile+'-'+mode}
function assignScenarios(plans){
 const counts=new Map(),offset=Math.floor(Math.random()*SCENARIOS.length);
 for(const plan of plans){
   const count=counts.get(plan.w.w)||0;counts.set(plan.w.w,count+1);
   plan.contextSeed=SCENARIOS[(offset+count)%SCENARIOS.length];
 }
 return plans;
}
function validPreparedQuestion(q,plan){return q?.w?.w===plan?.w?.w&&q.type===plan.type&&(!plan.needsCard||!!q.learningCard?.example)&&q.validation?.deterministic===true&&q.validation?.aiVerified===true&&q.validation?.checks?.coherentSituation===true}
function questionPassageKeys(q){return passageKeys(q.ctx,(q.opts||[]).map(o=>o.t))}
function savePreparation(p){
 if(p.adopted||p.cancelled)return;
 try{localStorage.setItem(p.key,JSON.stringify({engine:p.engine||PREPARATION_ENGINE,model:p.model,target:p.target,introAt:p.introAt,plannedFor:p.plannedFor,budget:p.budget,created:p.created,account:p.account,profile:p.profile,snapshot:p.snapshot,mode:p.mode,difficulty:p.difficulty,newWords:p.newWords,baseWords:p.baseWords,plans:p.plans,serverId:p.serverId,ready:[...p.ready]}))}catch{}
}
function createPreparation(meta,saved=[]){
 const p={...meta,queue:[],ready:new Map(),jobs:[],waiters:[],running:0,adopted:!!meta.adopted,cancelled:false};
 p.notify=()=>{
   while(p.ready.has(p.queue.length))p.queue.push(p.ready.get(p.queue.length));
   const waiting=p.waiters;p.waiters=[];
   for(const w of waiting){
     const job=p.jobs.find(j=>j.indices.includes(w.index));
     if(p.cancelled)w.reject(new Error('문제 준비가 취소되었습니다.'));
     else if(p.ready.has(w.index))w.resolve(p.ready.get(w.index));
     else if(job?.error)w.reject(job.error);
     else p.waiters.push(w);
   }
   savePreparation(p);
   if(p.adopted&&!p.cancelled&&session?.preparation===p&&checkpointSession()){localSave();cloudSave()}
   if(!p.adopted&&!p.cancelled&&p.mode==='daily'&&authUser?.id===p.account&&state.selected===p.profile&&!preparingSession&&(!session||current>=session.target)){
     const failed=p.jobs.find(j=>j.indices.includes(0))?.error;
     $('cloudPill').textContent=failed?'문제 준비 지연 · 시작 버튼으로 재시도':p.queue.length>=20?'학습 준비 완료':p.queue.length?'전체 문제 준비 중':'학습 문제 미리 준비 중';
   }
 };
 p.append=(plans)=>{
   const start=p.plans.length;p.plans.push(...plans);
   for(let i=start;i<p.plans.length;){
     const size=i===0?FIRST_QUESTION_COUNT:QUESTION_BATCH_SIZE;
     const indices=Array.from({length:Math.min(size,p.plans.length-i)},(_,n)=>i+n);
     p.jobs.push({indices,running:false,error:null,duplicateRetries:0});i+=indices.length;
   }
 };
 const plans=p.plans;p.plans=[];p.append(plans);
 for(const [index,q] of saved){
   if(Number.isInteger(index)&&validPreparedQuestion(q,p.plans[index]))p.ready.set(index,q);
 }
 p.notify();
 p.pump=()=>{
   if(p.cancelled||authUser?.id!==p.account||state.selected!==p.profile)return;
   if(!p.adopted&&preparationSnapshot(p.profile)!==p.snapshot){p.cancel();return}
   for(const job of p.jobs){
     if(p.running>=PREPARATION_CONCURRENCY)break;
     const missing=job.indices.filter(i=>!p.ready.has(i));
     if(!missing.length||job.running||job.error)continue;
     job.running=true;p.running++;
     const batch=missing.map(i=>({...p.plans[i]}));
     const known=[...p.ready.values()];
     fetchValidatedQuestions(batch,known.map(q=>q.signature).filter(Boolean),known,p.profile).then(questions=>{
       if(p.cancelled)return;
       let duplicate=false;
       questions.forEach((q,n)=>{
         const index=missing[n],plan=p.plans[index];
         if(!validPreparedQuestion(q,plan))throw new Error('문제 검증 정보를 확인하지 못했습니다.');
         const previous=new Set([...(state.users[p.profile].words[q.w.w]?.usedPassageKeys||[]),...[...p.ready.values()].filter(prev=>prev.w.w===q.w.w).flatMap(questionPassageKeys)]);
         if(questionPassageKeys(q).some(key=>previous.has(key))){duplicate=true;return}
         p.ready.set(index,q);
       });
       if(duplicate){
         if(job.duplicateRetries++<1){
           for(const index of job.indices.filter(i=>!p.ready.has(i)))p.plans[index].contextSeed=SCENARIOS[(SCENARIOS.indexOf(p.plans[index].contextSeed)+5)%SCENARIOS.length];
         }else job.error=new Error('이전 문장과 겹쳐 새 문제를 다시 준비해야 합니다.');
       }
     }).catch(error=>{job.error=error}).finally(()=>{job.running=false;p.running--;p.notify();p.pump()});
   }
 };
 p.waitFor=(index,retry=false)=>{
   if(p.ready.has(index))return Promise.resolve(p.ready.get(index));
   const job=p.jobs.find(j=>j.indices.includes(index));
   if(!job)return Promise.reject(new Error('출제 계획을 찾지 못했습니다.'));
   if(retry){job.error=null;job.duplicateRetries=0}
   const result=new Promise((resolve,reject)=>p.waiters.push({index,resolve,reject}));
   p.pump();p.notify();return result;
 };
 p.cancel=()=>{p.cancelled=true;p.notify()};
 return p;
}
async function serverLesson(profile,activeId=null){
 if(!['ayoung','inseong','guest'].includes(profile))return null;
 const {data,error}=await withDeadline(sb.rpc('get_prepared_lesson',{p_profile:profile,p_active_id:activeId}),10000,'저장된 문제를 불러오는 응답이 늦어졌어요. 다시 눌러 주세요.');
 if(error)throw new Error('저장된 학습 문제를 확인하지 못했어요. 다시 눌러 주세요.');
 return data;
}
function createServerPreparation(meta,saved){
 const p=createPreparation(meta,saved),ordinaryPump=p.pump;
 let polling=false,timer=null;
 p.pump=()=>{
  if(p.cancelled||authUser?.id!==p.account||state.selected!==p.profile||polling)return;
  if(p.ready.size>=p.plans.length){if(p.plans.length>20)ordinaryPump();return}
  // Adaptive additions use the existing validated API after the server's base lesson.
  if(p.ready.size>=20){ordinaryPump();return}
  polling=true;
  serverLesson(p.profile,p.serverId).then(remote=>{
   if(p.cancelled)return;
   if(remote?.id!==p.serverId)throw new Error('학습 기록이 바뀌어 준비된 문제를 다시 확인해야 해요.');
   if(remote.status==='failed'){
    throw new Error('문제 준비가 지연됐어요. 잠시 뒤 다시 눌러 주세요.');
   }
   for(const [i,q] of remote.payload?.ready||[]){
    if(!validPreparedQuestion(q,p.plans[i]))throw new Error('문제 검증 정보를 확인하지 못했습니다.');
    p.ready.set(i,q);
   }
   for(const job of p.jobs)job.error=null;
  }).catch(error=>{for(const job of p.jobs)job.error=error}).finally(()=>{
   polling=false;p.notify();
   if(!p.cancelled&&p.ready.size<20&&!p.jobs.some(j=>j.error))timer=setTimeout(()=>p.pump(),2000);
  });
 };
 const cancel=p.cancel;p.cancel=()=>{clearTimeout(timer);cancel()};
 return p;
}
async function getPreparation(mode='daily'){
 const profile=state.selected,account=authUser?.id,key=preparationKey(mode,profile,account);
 if(!account)throw new Error('로그인이 필요합니다.');
 const snapshot=preparationSnapshot(profile),existing=preparations.get(key);
 if(existing&&!existing.adopted&&!existing.cancelled&&existing.snapshot===snapshot&&Date.now()-existing.created<PREPARATION_TTL){existing.pump();return existing}
 if(preparationLoads.has(key))return preparationLoads.get(key);
 if(existing)existing.cancel();
 const loading=(async()=>{
   let saved=null;
   try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}
   if(mode==='daily'&&['ayoung','inseong','guest'].includes(profile)){
     let remote=await serverLesson(profile),tries=0;
     while(remote&&['pending','working'].includes(remote.status)&&!remote.payload&&tries++<4){
       $('cloudPill').textContent='맞춤 학습 문제를 서버에서 미리 준비 중';
       await new Promise(resolve=>setTimeout(resolve,2000));
       if(authUser?.id!==account||state.selected!==profile)throw new Error('학습 프로필이 변경되었습니다.');
       remote=await serverLesson(profile);
     }
     if(authUser?.id!==account||state.selected!==profile)throw new Error('학습 프로필이 변경되었습니다.');
     if(remote?.payload?.snapshot===snapshot&&remote.payload.engine===PREPARATION_ENGINE&&remote.payload.plans?.length===20&&remote.status!=='failed'){
       const data=remote.payload;
       for(const plan of data.plans)if(plan.w?.source==='fixed')FIXED_CACHE.set(plan.w.w,plan.w);
       rebuildCatalog();
       const p=createServerPreparation({...data,key,serverId:remote.id},data.ready||[]);
       preparations.set(key,p);p.pump();return p;
     }
     // Pending, failed or outdated server work must not start duplicate browser generation.
     if(remote)throw new Error(remote.status==='failed'?'문제 검수가 지연됐어요. 준비된 문제는 보관되어 있습니다. 잠시 뒤 다시 눌러 주세요.':'서버에서 맞춤 문제를 준비 중이에요. 앱을 닫아도 준비는 계속됩니다. 잠시 뒤 다시 눌러 주세요.');
     // Missing storage responses must never fall back to live daily generation.
     throw new Error('저장된 맞춤 문제를 확인하지 못했어요. 학습 기록은 유지됩니다. 다시 눌러 주세요.');
   }
   let meta;
   const restored=saved?.engine===PREPARATION_ENGINE&&saved.account===account&&saved.profile===profile&&saved.snapshot===snapshot&&Date.now()-saved.created<PREPARATION_TTL&&saved.mode===mode&&saved.plans?.length===20;
   if(restored){
     meta={...saved,key};
     for(const plan of saved.plans)if(plan.w?.source==='fixed')FIXED_CACHE.set(plan.w.w,plan.w);
     rebuildCatalog();
   }else{
     await withDeadline(ensureCatalog(state.users[profile].difficulty,mode==='level'?'diagnostic':'daily'),20000,'어휘를 불러오는 응답이 늦어졌어요. 다시 눌러 주세요.');
     if(authUser?.id!==account||state.selected!==profile)throw new Error('학습 프로필이 변경되었습니다.');
     let newWords=[],reviewWords=[];
     if(mode==='level')reviewWords=WORDS.filter(w=>!(child().words[w.w]?.seen)&&!child().words[w.w]?.introducedAt).sort(()=>Math.random()-.5).slice(0,30);
     else if(mode==='review')reviewWords=chooseReview(20);
     else{const budget=studyBudget(child());newWords=chooseNew(budget.newCount);reviewWords=chooseReview(20-newWords.length)}
     const baseWords=[...newWords,...reviewWords];
     if(!baseWords.length)throw new Error(mode==='review'?'아직 복습할 기록이 충분하지 않아요. 오늘의 학습을 먼저 진행해 주세요.':'출제할 어휘를 준비하지 못했습니다.');
     meta={key,account,profile,mode,snapshot:preparationSnapshot(profile),created:Date.now(),difficulty:child().difficulty,newWords:newWords.map(w=>w.w),baseWords,model:LEARNING_MODEL,target:mode==='level'?20:16,introAt:mode==='daily'?Math.min(6,reviewWords.length):0,plans:assignScenarios(buildLearningPlan(newWords,reviewWords,20,mode,w=>wordState(w)))};
   }
   const p=createPreparation(meta,restored?saved.ready||[]:[]);
   preparations.set(key,p);p.pump();return p;
 })();
 preparationLoads.set(key,loading);
 try{return await loading}finally{preparationLoads.delete(key)}
}
function warmDailyQuestions(){
 if(!authUser||preparingSession||savedLesson()||(session&&current<session.target))return;
 getPreparation('daily').catch(()=>{});
}
function activeTime(active=session){return (active?.activeMs||0)+(active?.clockStarted?Math.max(0,Date.now()-active.clockStarted):0)}
function pauseLearningClock(){if(session?.clockStarted){session.activeMs=activeTime(session);session.clockStarted=null}}
function renderIntro(){
 const active=session,list=active?.introWords||[];
 if(!active||active.introCursor>=list.length){if(active)active.introDone=true;show('learn');renderQuestion();return}
 const name=list[active.introCursor],q=active.queue.find(q=>q.w.w===name&&q.learningCard?.example),w=q?.w||byWord(name),card=q?.learningCard;
 if(!w||!card?.example)throw new Error('새 단어 학습 자료를 확인하지 못했어요.');
 const st=wordState(w.w);if(!st.introducedAt)st.introducedAt=today();st.lastExposureAt=today();
 if(w.source==='fixed')state.catalog[w.w]=w;
 $('introCounter').textContent=(active.introCursor+1)+'번째 새 단어';$('introWord').textContent=w.w;
 $('introDefinition').textContent=card.definition||w.d;$('introExample').textContent=card.example;
 if($('introNonExample'))$('introNonExample').textContent=card.nonExample;
 if($('introStructure')){$('introStructure').textContent=card.structureNote||'';$('introStructure').classList.toggle('hidden',!card.structureNote)}
 $('introNext').textContent=active.introCursor===list.length-1?'다른 활동으로 이어가기':'다음 단어 익히기';
 checkpointSession();localSave();cloudSave();
}
function nextIntro(){if(!session)return;session.introCursor++;checkpointSession();localSave();cloudSave();renderIntro()}

async function buildSession(mode='daily'){
 if(preparingSession)return;
 preparingSession=true;
 const profile=state.selected,account=authUser?.id,button=mode==='level'?'levelTest':mode==='review'?'startReview':'startDaily',oldText=$(button).textContent;
 for(const id of ['startDaily','startReview','levelTest'])$(id).disabled=true;
 $(button).textContent='준비된 문제를 불러오는 중…';$('cloudPill').textContent='문제 준비 중';
 try{
   const paused=savedLesson(profile);
   if(paused){await resumeLesson(paused);return}
   // The background queue keeps preparing after this bounded UI wait ends.
   const p=await withDeadline((async()=>{
     const prepared=await getPreparation(mode);
     if(prepared.model===LEARNING_MODEL&&prepared.plannedFor>today())throw new Error('오늘 예정된 학습을 마쳤어요. 다음 학습 날짜는 '+prepared.plannedFor+'입니다. 복습 버튼으로 배운 단어를 연습할 수 있어요.');
     if(prepared.serverId||mode==='daily'){
       // Start a cloud lesson only when every base question is saved, so moving
       // through the lesson never waits for generation or a background retry.
       await Promise.all(prepared.plans.slice(0,20).map((_,i)=>prepared.waitFor(i,true)));
     }else await prepared.waitFor(0,true);
     return prepared;
   })(),QUESTION_WAIT_MS,'맞춤 문제를 서버에서 준비 중이에요. 앱을 닫아도 준비는 계속됩니다. 잠시 뒤 다시 눌러 주세요.');
   if(state.selected!==profile||authUser?.id!==account)return;
   if(p.serverId){
     const {data,error}=await withDeadline(sb.rpc('consume_prepared_lesson',{p_profile:profile,p_id:p.serverId}),10000,'학습 시작 확인이 지연됐어요. 기록은 유지됩니다. 다시 눌러 주세요.');
     if(error||!data){p.cancel();preparations.delete(p.key);localStorage.removeItem(p.key);throw new Error('이 학습은 이미 시작되었거나 기록이 바뀌었어요. 시작 버튼을 다시 눌러 주세요.')}
     if(state.selected!==profile||authUser?.id!==account)return;
   }
   p.adopted=true;preparations.delete(p.key);
   try{localStorage.removeItem(p.key)}catch{}
   session={engine:p.engine||PREPARATION_ENGINE,model:p.model,introAt:p.introAt||0,introWords:p.model===LEARNING_MODEL?(p.newWords||[]):[],introCursor:0,introDone:!p.newWords?.length||p.model!==LEARNING_MODEL,activeMs:0,clockStarted:Date.now(),mode,queue:p.queue,preparation:p,results:[],target:p.model===LEARNING_MODEL?(p.target||16):20,max:p.model===LEARNING_MODEL?20:30,difficulty:p.difficulty,ability:clamp(p.difficulty||3,1,9),intros:[],newWords:p.newWords,baseWords:p.baseWords,validated:true,loadingQuestions:null,profile,account,lessonId:p.serverId||('lesson-'+Date.now()+'-'+Math.random().toString(36).slice(2))};
   Object.defineProperty(session,'pendingPlans',{get:()=>p.plans.slice(p.queue.length)});
   current=0;introIndex=0;hintLevel=0;$('next').disabled=false;
   show('learn');renderQuestion();prefetchQuestions();
 }catch(e){
   if(state.selected===profile&&authUser?.id===account){alert('문제 준비를 완료하지 못했어요. 학습 기록은 유지됩니다.\n'+String(e?.message||e));show('home')}
 }finally{
   preparingSession=false;
   $(button).textContent=oldText;
   for(const id of ['startDaily','startReview','levelTest'])$(id).disabled=false;
   renderResumeButton();
   $('cloudPill').textContent='클라우드 연결';$('cloudPill').classList.add('on');
 }
}
function renderQuestion(savedHint=0){
 if(current>=session.queue.length||current>=session.target){finishSession();return}
 if(session.model===LEARNING_MODEL&&!session.introDone&&current>=session.introAt){show('intro');renderIntro();return}
 const q=session.queue[current];rememberQuestion(q); selectedOption=null; answerSource='typed';hintLevel=clamp(savedHint,0,(q.hints||[]).length);
 $('learnType').textContent=STAGE_LABELS[q.stage]||(session.mode==='level'?'시작 수준 확인':session.mode==='review'?'집중 복습':'오늘의 학습');
 if($('learningPath'))$('learningPath').textContent=session.model===LEARNING_MODEL?'확인 → 익히기 → 회상 → 적용 → 사용':'';
 if($('studyTime'))$('studyTime').textContent=Math.floor(activeTime()/60000)+'분 · 약 15분 목표';
 if($('breakNotice')){$('breakNotice').textContent='20분 동안 학습했어요. 지금 마치거나 잠시 쉬어도 괜찮아요.';$('breakNotice').classList.toggle('hidden',activeTime()<20*60000)}
 if($('finishEarly'))$('finishEarly').classList.toggle('hidden',session.results.length<1);
 $('counter').textContent=(current+1)+'번째 문제'; $('progressBar').style.width=Math.round(current/session.target*100)+'%';
 $('qTag').textContent=q.label; $('difficulty').textContent=bandLabel(child().difficulty)+' · '+child().difficulty.toFixed(1);
 $('qWord').textContent=q.showTarget?q.w.w:'';
 $('qWord').classList.toggle('hidden',!q.showTarget);
 $('qText').textContent=q.q;
 $('qContext').classList.toggle('hidden',!q.ctx); $('qContext').textContent=q.ctx||'';
 $('feedback').className='feedback hidden'; $('hintBox').className='feedback hidden'; $('hintBox').textContent='';
 $('next').classList.add('hidden'); $('answer').value='';
 $('options').innerHTML='';
 $('answer').classList.toggle('hidden',!q.open); $('voiceRow').classList.toggle('hidden',!q.open); $('submit').classList.toggle('hidden',!q.open);
 $('answer').placeholder=q.type==='subjective_use'?'이 단어를 넣어 나만의 문장을 써 보세요.':q.type==='subjective_dialogue'?'대화에 어울리는 어휘를 써 보세요.':'빈칸에 들어갈 어휘를 써 보세요.';
 $('hint').classList.remove('hidden'); $('hint').disabled=false; $('hint').textContent='힌트';
 if(q.opts?.length)q.opts.forEach((o,i)=>{
   const b=document.createElement('button');b.className='option';b.textContent=o.t;
   b.onclick=()=>{if($('next').classList.contains('hidden')){selectedOption=i;document.querySelectorAll('.option').forEach((x,j)=>x.classList.toggle('selected',j===i));gradeCurrent(false)}};
   $('options').appendChild(b);
 });
 if(hintLevel){
   $('hintBox').textContent='힌트 '+hintLevel+': '+q.hints[hintLevel-1];$('hintBox').className='feedback';
   $('hint').textContent=hintLevel<q.hints.length?'힌트 하나 더':'힌트 모두 사용';$('hint').disabled=hintLevel>=q.hints.length;
 }
 checkpointSession();localSave();cloudSave();prefetchQuestions();
}
function resultCredit(result){return result==='◎'||result==='○'?1:result==='△'?.5:result==='?'?.25:0}
function applyResult(q,result,feedback,normalized='',meta={}){
 exploration(child());
 rememberQuestion(q);
 const st=wordState(q.w.w),priorExposure=st.lastExposureAt||st.lastFeedbackDate||st.introducedAt;
 let credit=Number.isFinite(meta.credit)?clamp(meta.credit,0,1):resultCredit(result);
 const hintUsed=Boolean(meta.hintUsed);
 const revealed=Boolean(meta.revealed);
 const contextSuccess=meta.contextSuccess??credit>=.5;
 const targetRecall=q.showTarget||q.type==='subjective_use'?false:Boolean(meta.targetRecall);
 const practiceOnly=st.lastFeedbackDate===today()||session.results.some(r=>r.word===q.w.w);
 const independent=!practiceOnly&&Boolean(meta.independent??(!hintUsed&&!revealed&&credit>=1));
 if(hintUsed&&credit>=1){credit=.75;result='△'}
 st.seen++;st.last=result;st.types[q.type]=(st.types[q.type]||0)+1;
 st.lastFeedbackDate=today();
 if(credit>=1){st.correct++}else if(credit>0){st.assisted++}else{st.wrong++}
 if(independent&&contextSuccess&&credit>=1){
   st.streak++;st.independentCorrect++;
   if(!st.days.includes(today()))st.days.push(today());
 }else if(credit<1||hintUsed||revealed)st.streak=0;
 if(contextSuccess)st.contextSuccess++;
 if(targetRecall){
   st.targetRecall++;
   if(independent&&!st.recallDays.includes(today()))st.recallDays.push(today());
 }
 if(hintUsed&&contextSuccess)st.hintedCorrect++;
 if(revealed)st.revealed++;
 if(credit<.5)st.supportLevel=clamp((st.supportLevel||0)+1,0,3);
 else if(independent&&credit>=1)st.supportLevel=clamp((st.supportLevel||0)-1,0,3);
 if(q.signature&&independent&&contextSuccess){
   if(!st.contextKeys.includes(q.signature))st.contextKeys.push(q.signature);
   st.contextKeys=st.contextKeys.slice(-12);
 }
 st.level=clamp(1+Math.floor((st.independentCorrect||0)/2)-Math.floor(st.wrong/2),1,5);
 st.mastered=st.streak>=5&&st.days.length>=3&&st.contextKeys.length>=3&&(st.independentCorrect||0)>=5&&(st.targetRecall||0)>=2&&st.recallDays.length>=2;
 if(session.model!==LEARNING_MODEL)scheduleReview(st,{credit,independent,revealed,hintUsed});
 if(q.w.pair&&credit<.5&&!st.confusions.includes(q.w.pair))st.confusions.push(q.w.pair);
 const rec={word:q.w.w,result,credit,type:q.type,band:q.w.band||3,contextSuccess,targetRecall,independent,practiceOnly,hintUsed,revealed,signature:q.signature||''};
 if(session.model===LEARNING_MODEL){const exposureAfter=st.lastFeedbackDate;st.lastExposureAt=priorExposure;const evidence=recordLearningEvidence(child(),st,q,rec);st.lastFeedbackDate=exposureAfter;researchSchedule(st,evidence,rec);rec.evidence=evidence}
 rec.xp=rewardAnswer(q,independent);
 session.results.push(rec);
 if(q.signature){
   const c=child();c.recentProblems=Array.isArray(c.recentProblems)?c.recentProblems:[];
   const optionKey=q.opts?.length?'|'+q.opts.map(o=>o.t).join('§'):'';c.recentProblems.push(q.signature+optionKey);c.recentProblems=c.recentProblems.slice(-60);
 }
 const recent=session.results.filter(x=>!x.practiceOnly).slice(-6),bad=recent.filter(x=>x.credit<.75).length;
 if(session.mode==='level'){
   const answered=session.results.length;
   if(answered%4===0){
     const last=session.results.slice(-4),g=last.reduce((sum,x)=>sum+x.credit,0);
     if(g>=3)session.ability=clamp(session.ability+.5,1,9); else if(g<=1.5)session.ability=clamp(session.ability-.5,1,9);
   }
   if(answered===20){
     const ratio=session.results.reduce((sum,x)=>sum+x.credit,0)/20;
     if(ratio>=.35&&ratio<=.85)session.target=Math.min(26,session.max);
   }else if(answered===26&&session.target===26){
     const last6=session.results.slice(-6).reduce((sum,x)=>sum+x.credit,0);
     if(last6>=2&&last6<=4.5)session.target=Math.min(30,session.max);
   }
 }else if(session.model!==LEARNING_MODEL){
   if(!practiceOnly&&recent.length>=6){
     if(bad>=4)child().difficulty=clamp(child().difficulty-.3,1,9);
     else if(bad<=1)child().difficulty=clamp(child().difficulty+.2,1,9);
   }
   if(session.target===20&&current>=14&&bad>=3)session.target=Math.min(26,session.max);
   else if(session.target===26&&current>=24&&bad>=3)session.target=Math.min(30,session.max);
 }
 const full=credit>=.99&&!hintUsed,partial=credit>0&&!full;
 $('feedback').className='feedback '+(full?'good':credit<=0?'bad':'');
 $('feedback').innerHTML='<strong>'+(full?'○ 잘했어요!':partial?'△ 부분 이해':'× 다시 살펴봐요')+'</strong><br>'+escapeHtml(q.w.w)+' · '+escapeHtml(q.w.d)+'<br>'+escapeHtml(feedback)+(practiceOnly&&full?'<br><small>이번 정답은 연습 기록이에요. 숙달은 다른 날 새 문맥에서 다시 확인해요.</small>':'')+(normalized&&normalized!==$('answer').value?'<br><small>제가 이해한 답: '+escapeHtml(normalized)+'</small>':'');
 $('feedback').classList.remove('hidden');$('next').classList.remove('hidden');$('submit').classList.add('hidden');$('hint').classList.add('hidden');
 checkpointSession();localSave();cloudSave();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function showHint(){
 if(!session?.queue?.[current]||!$('next').classList.contains('hidden'))return;
 const q=session.queue[current],hints=q.hints||[];
 if(!hints.length){$('hint').classList.add('hidden');return}
 hintLevel=Math.min(hints.length,hintLevel+1);
 $('hintBox').textContent='힌트 '+hintLevel+': '+hints[hintLevel-1];
 $('hintBox').className='feedback';
 $('hint').textContent=hintLevel<hints.length?'힌트 하나 더':'힌트 모두 사용';
 if(hintLevel>=hints.length)$('hint').disabled=true;
 checkpointSession();localSave();cloudSave();
}
const normalizeTyped=s=>String(s||'').replace(/[\s"'“”‘’.,!?()\[\]{}]/g,'').trim();

async function gradeCurrent(dontKnow){
 const active=session,q=active.queue[current];if(active.results.length>current||!$('next').classList.contains('hidden'))return;
 const hintUsed=hintLevel>0;
 if(dontKnow){
   const clue=q.feedbackCorrect||('정답은 “'+q.w.w+'”입니다.');
   applyResult(q,'×',clue+' 정답을 본 뒤 따라 쓰는 것은 숙달로 계산하지 않아요.','',{
     credit:0,contextSuccess:false,targetRecall:false,independent:false,hintUsed,revealed:true
   });
   return;
 }
 if(q.opts?.length){
   if(selectedOption==null)return;
   const selected=q.opts[selectedOption],correct=q.opts.find(o=>o.ok),ok=Boolean(selected?.ok);
   document.querySelectorAll('.option').forEach((x,i)=>{
     if(q.opts[i].ok)x.classList.add('correct');
     else if(i===selectedOption&&!ok)x.classList.add('wrong');
   });
   const feedback=ok
     ?(q.feedbackCorrect||'지문의 핵심 단서와 이 어휘의 쓰임이 잘 맞아요.')
     :((selected?.reason?selected.reason+' ':'')+(q.feedbackCorrect||('정답은 “'+(correct?.t||q.w.w)+'”입니다.')));
   applyResult(q,ok?'○':'×',feedback,'',{
     credit:ok?1:0,contextSuccess:ok,targetRecall:false,independent:ok&&!hintUsed,hintUsed,revealed:false
   });
   return;
 }
 const answer=$('answer').value.trim();
 if(!answer)return alert('답을 쓰거나 “모르겠어”를 눌러주세요.');
 const expected=normalizeTyped(q.w.w),typed=normalizeTyped(answer);
 const listed=(q.acceptedAnswers||[]).find(x=>typeof x==='object'&&normalizeTyped(x.text)===typed);
 if(q.type!=='subjective_use'&&(typed===expected||typed===normalizeTyped(q.answerForm||'')||listed)){
   const credit=listed?Number(listed.credit):1;
   if(typed!==expected&&typed!==normalizeTyped(q.answerForm||'')&&listed){applyResult(q,credit===1?'○':'△',q.feedbackCorrect||'문맥에 맞는 표현이에요.',answer,{credit,contextSuccess:credit>=1,targetRecall:false,independent:credit>=1&&!hintUsed,hintUsed,revealed:false});return}
   applyResult(q,'◎',q.feedbackCorrect||'문맥의 단서를 보고 목표 어휘를 직접 떠올렸어요.',answer,{
     credit:1,contextSuccess:true,targetRecall:true,independent:!hintUsed,hintUsed,revealed:false
   });
   return;
 }
 $('submit').disabled=true;$('submit').textContent='문맥 채점 중…';
 try{
   const {data}=await sb.auth.getSession();const token=data.session?.access_token;
   if(!token)throw new Error('로그인이 필요합니다.');
   const r=await fetch('/api/grade',{
     method:'POST',
     headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
     body:JSON.stringify({
       taskType:q.type==='subjective_use'?'sentence_use':'context_answer',
       question:q.q+'\n지문: '+q.ctx,
       targetWord:q.w.w,definition:q.w.d,band:q.w.band||3,
       acceptedAnswers:q.acceptedAnswers||[],answer,source:answerSource
     })
   });
   if(!r.ok)throw new Error('채점 서버 오류');
   const j=await r.json();
   if(session!==active||state.selected!==active.profile)return;
   const credit=Number(j.score)===1?1:Number(j.score)===0.5?.5:0;
   const result=credit===1?'○':credit===.5?'△':'×';
   applyResult(q,result,j.feedback||q.feedbackCorrect||'문맥에 맞는지 확인했어요.',j.normalizedAnswer||answer,{
     credit,contextSuccess:Boolean(j.contextSuccess),targetRecall:q.type==='subjective_use'?false:Boolean(j.targetRecall),
     independent:credit===1&&!hintUsed,hintUsed,revealed:false
   });
 }catch(e){
   if(session===active&&state.selected===active.profile)alert('채점을 완료하지 못했어요. 답은 기록하지 않았습니다. 인터넷 연결을 확인한 뒤 다시 채점해 주세요.');
 }finally{
   if(session===active){$('submit').disabled=false;$('submit').textContent='채점하기'}
 }
}
function fallbackOpen(q,answer){
 const key=q.w.w,def=q.w.d; const words=def.replace(/[.,()]/g,'').split(/\s+/).filter(x=>x.length>=2).slice(0,5);
 const hit=answer.includes(key)||words.some(x=>answer.includes(x)); applyResult(q,hit?'△':'×',hit?'AI 연결 전이라 임시 채점했어요. 뜻의 방향은 맞아 보여요.':'AI 연결 전이라 임시 채점했어요. 핵심 뜻을 다시 확인해 보세요: '+def,answer);
}
function makeExtensionPlan(start,count){
 const base=session?.baseWords||session?.queue?.map(q=>q.w)||[];
 const usage=new Map();
 for(const q of session.queue||[])usage.set(q.w.w,(usage.get(q.w.w)||0)+1);
 let lastWord=session.queue?.at(-1)?.w?.w||'';
 let objectiveSlot=(session.queue||[]).filter(q=>q.type?.startsWith('mc_')).length%5;
 const plans=[];
 for(let i=start;i<start+count;i++){
   const type=TYPE_SEQUENCE[i%TYPE_SEQUENCE.length],objective=type.startsWith('mc_');
   const w=pickLeastUsed(base,usage,lastWord);if(!w)break;
   usage.set(w.w,(usage.get(w.w)||0)+1);lastWord=w.w;
   const st=wordState(w.w);
   plans.push({
     id:String(i),type,w,answerSlot:objective?(objectiveSlot++%5):0,
     supportLevel:st.supportLevel||0,successStreak:st.streak||0,firstLearning:false
   });
 }
 return plans;
}
function prepareExtensions(active){
 const p=active.preparation;
 if(p.plans.length<active.target){
   const plans=assignScenarios(makeExtensionPlan(p.plans.length,active.target-p.plans.length));
   p.append(plans);
   if(checkpointSession()){localSave();cloudSave()}
 }
 p.pump();
}
async function extendSessionQuestions(){
 const active=session;
 if(active.loadingQuestions)return active.loadingQuestions;
 if(active.queue.length>=active.target)return true;
 prepareExtensions(active);
 const index=active.queue.length;
 $('cloudPill').textContent='추가 문제 준비 중';
 active.loadingQuestions=active.preparation.waitFor(index,true).then(()=>session===active&&state.selected===active.profile);
 try{return await active.loadingQuestions}
 finally{active.loadingQuestions=null;$('cloudPill').textContent='클라우드 연결'}
}
function prefetchQuestions(){
 if(session?.preparation&&state.selected===session.profile)prepareExtensions(session);
}
async function nextQuestion(){
 if($('next').disabled||!session)return;
 const active=session,nextIndex=current+1,oldText=$('next').textContent;
 $('next').disabled=true;
 try{
   if(nextIndex>=active.queue.length&&nextIndex<active.target){
     $('next').textContent='다음 문제 준비 중…';
     prepareExtensions(active);
     await withDeadline(active.preparation.waitFor(nextIndex,true),QUESTION_WAIT_MS,'다음 문제 준비가 지연됐어요. 잠시 뒤 다시 눌러 주세요.');
   }
   if(session!==active||state.selected!==active.profile)return;
   current=nextIndex;renderQuestion();
 }catch(e){
   if(session===active&&state.selected===active.profile)alert('다음 문제를 아직 준비하지 못했어요. 학습 기록은 유지됩니다. 잠시 뒤 다음 문제를 다시 눌러 주세요.');
 }finally{
   if(session===active){$('next').disabled=false;$('next').textContent=oldText}
 }
}
function finishSession(){
 if(!session||session.completed)return;
 session.completed=true;
 const c=child(),r=session.results,total=r.length,good=r.filter(x=>['◎','○'].includes(x.result)).length,ind=r.filter(x=>x.result==='◎').length,wrong=r.filter(x=>x.result==='×').length,score=Math.round(r.reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0)/Math.max(1,total)*100);
 if(session.mode!=='level'){
   if(c.lastDate!==today()){c.learningDays++;c.lastDate=today()}
   if(session.model===LEARNING_MODEL)updateLearningLevels(c,r);
   c.sessions.unshift({date:today(),score,total,good,wrong,difficulty:c.difficulty,model:session.model,activeMinutes:Math.round(activeTime()/6000)/10,recognition:r.filter(x=>x.type.startsWith('mc_')).length,recall:r.filter(x=>x.evidence?.kind==='recall').length,use:r.filter(x=>x.evidence?.kind==='use').length});
   c.sessions=c.sessions.slice(0,60);
 }else{
   const weighted=r.reduce((sum,x)=>sum+((x.credit??resultCredit(x.result))*(x.band||3)),0);
   const creditTotal=Math.max(.5,r.reduce((sum,x)=>sum+(x.credit??resultCredit(x.result)),0));
   const evidence=weighted/creditTotal;
   c.difficulty=clamp((session.ability*0.65+evidence*0.35),1,9);
   c.confidence=clamp(total/30,0,1);
   c.levelTestCompleted=true;
   if(c.leagueLevel==null)c.leagueLevel=c.difficulty;
 }
 rewardCompletion();
 c.activeLesson=null;
 c.preparationRevision=(c.preparationRevision||0)+1;
 storeLearnerCheckpoint(session.profile);localSave();
 cloudSave().then(()=>warmDailyQuestions()); renderAll(); show(state.selected==='guest'?'home':'report');
 alert(session.mode==='level'?'시작 수준 확인 완료 · 출제 난이도 '+c.difficulty.toFixed(1):'오늘 학습 완료! '+total+'번의 활동을 기록했어요. 배운 단어는 다른 날 다시 확인해요.');
}
function renderAll(){
 renderResumeButton();
 const c=child(); document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===state.selected));
 $('ayoungLevel').textContent='현재 단계 '+bandLabel(state.users.ayoung.difficulty)+' · '+state.users.ayoung.difficulty.toFixed(1);
 $('inseongLevel').textContent='현재 단계 '+bandLabel(state.users.inseong.difficulty)+' · '+state.users.inseong.difficulty.toFixed(1);
 $('guestLevel').textContent='현재 단계 '+bandLabel(state.users.guest.difficulty)+' · '+state.users.guest.difficulty.toFixed(1);
 $('hello').textContent=c.name+'의 오늘 탐험'; $('subtitle').textContent=c.name+' · '+bandLabel(c.difficulty)+' 단계';
 $('statScore').textContent=c.sessions[0]?.score??'-'; $('statWords').textContent=Object.values(c.words).filter(x=>x.seen>0).length; $('statMaster').textContent=summarizeEvidence(c).mastered; $('statDay').textContent=Math.max(1,c.learningDays);
 renderStudySummary();renderWordbook();renderReport();renderExploration();
}
function renderStudySummary(){
 const c=child(),budget=studyBudget(c),saved=savedLesson(),summary=summarizeEvidence(c);
 if($('dailyTitle'))$('dailyTitle').textContent=budget.newCount?'새 단어 최대 '+budget.newCount+'개 + 맞춤 복습':'오늘은 배운 단어를 단단하게';
 if($('dailyDescription'))$('dailyDescription').textContent='약 15분 · 새 단어 하루 최대 2개, 최근 7일 최대 8개 · 복습이 밀리면 새 단어를 줄여요.';
 if($('dailyBudget'))$('dailyBudget').textContent='복습 예정 '+budget.due+'개 · 최근 7일 새 단어 '+budget.weeklyNew+'/'+budget.weeklyLimit+'개';
 if($('learningEvidenceHome'))$('learningEvidenceHome').textContent='장기 확인 '+summary.mastered+'개 · '+(summary.retention7.attempts?'7일 이상 회상 '+summary.retention7.percent+'%':'7일 뒤 기억을 확인할 기록을 모으고 있어요.');
 if(saved?.model===LEARNING_MODEL&&!saved.introDone&&saved.nextIndex>=saved.introAt)$('startDaily').textContent='이어서 새 단어 익히기';
}
function renderWordbook(){
 const c=child(),arr=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0).sort((a,b)=>((c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0))||((c.words[b.w]?.seen||0)-(c.words[a.w]?.seen||0)));
 $('wordList').innerHTML=arr.length?arr.map(w=>{const s=hydrateWordState(c.words[w.w]);return '<div class="item row between"><div><strong>'+w.w+'</strong><br><small>'+w.d+'</small><br><small>문맥 이해 '+(s.contextSuccess||0)+' · 목표어 직접 회상 '+(s.targetRecall||0)+' · 오답 '+(s.wrong||0)+'</small><br><small>도움 없이 '+(s.independentCorrect||0)+'회 · 직접 회상 '+(s.independentRecallDays?.length||0)+'일 · 다음 복습 '+(s.nextReviewAt||'미정')+'</small></div><span class="tag">Lv.'+s.level+(masteryConfirmed(s)?' 장기 확인':s.mastered?' 이전 숙달':' 연습 중')+'</span></div>'}).join(''):'<div class="card muted">아직 학습 기록이 없어요.</div>';
}
function renderReport(){
 const reportId=['ayoung','inseong'].includes(reportProfile)?reportProfile:(['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung');reportProfile=reportId;
 const c=state.users[reportId],stats=summarizeEvidence(c),budget=studyBudget(c),studied=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0||c.words[w.w]?.introducedAt);
 const weak=studied.filter(w=>!masteryConfirmed(c.words[w.w])).sort((a,b)=>(c.words[b.w].wrong||0)-(c.words[a.w].wrong||0)).slice(0,5);
 $('reportTitle').textContent=c.name+' 부모 리포트';document.querySelectorAll('[data-report-profile]').forEach(b=>b.classList.toggle('active',b.dataset.reportProfile===reportId));
 const metric=(label,x,description)=>`<div class="evidence-card"><span>${label}</span><strong>${x.percent==null?'기록 대기':x.percent+'%'}</strong><small>${x.attempts?x.success+'/'+x.attempts+'회 · ':''}${description}</small></div>`;
 $('reportBody').innerHTML=`<div class="grid4"><div class="stat"><strong>${studied.length}</strong><span>학습 단어</span></div><div class="stat"><strong>${stats.mastered}</strong><span>장기 확인 단어</span></div><div class="stat"><strong>${c.difficulty.toFixed(1)}</strong><span>출제 난이도</span></div><div class="stat"><strong>${Number(c.leagueLevel??c.difficulty).toFixed(1)}</strong><span>리그 등급</span></div></div>
 <div class="card"><div class="eyebrow">맞히는 방식과 기억을 따로 확인</div><h3>어휘 학습의 네 가지 모습</h3><div class="evidence-grid">${metric('보기로 알아보기',stats.recognition,'첫 답 기준')}${metric('다른 날 직접 회상',stats.recall,'보기·힌트 없이')}${metric('새 글 이해',stats.transfer,'처음 보는 글의 뜻과 쓰임')}${metric('내 문장에 사용',stats.use,'목표어를 보여준 사용 활동')}</div></div>
 <div class="card"><h3>시간이 지나도 기억하나요?</h3><div class="evidence-grid">${metric('7일 이상 뒤 회상',stats.retention7,'마지막 노출 후 7~29일')}${metric('30일 이상 뒤 회상',stats.retention30,'마지막 노출 후 30일 이상')}</div><p class="muted">장기 확인은 3일 이상 직접 회상, 7일 이상 뒤 성공, 내 문장 사용을 모두 확인한 단어예요. 기존 정오답·숙달 기록은 단어장에 보관하고 새 확인 기록과 구분합니다. 도움 없이 회상하기 전 뜻이나 보기를 본 단어는 지연 회상 검사에 넣지 않아요.</p></div>
 <div class="card"><h3>오늘의 적정 분량</h3><p>새 단어 최대 ${budget.newCount}개 · 복습 예정 ${budget.due}개 · 약 15분</p><p class="muted">하루 새 단어 최대 2개, 최근 7일 최대 8개로 시작합니다. 복습량과 며칠 뒤 회상 성과에 따라 줄여요. 활동 16개를 준비하며 20분부터 쉬기를 안내합니다. 반복 실행해도 하루 새 단어 한도를 늘리지 않아요.</p><small class="muted">최근 학습 시간: ${c.sessions[0]?.activeMinutes!=null?c.sessions[0].activeMinutes+'분':'개편 후 기록 대기'}</small></div>
 <div class="card"><h3>다음 우선순위</h3><div class="list">${weak.length?weak.map(w=>`<div class="item"><strong>${escapeHtml(w.w)}</strong> <small>${escapeHtml(w.d)} · 다음 복습 ${escapeHtml(c.words[w.w].nextReviewAt||'곧 확인')}</small></div>`).join(''):'<p class="muted">학습 기록이 쌓이면 개인별 복습을 안내해요.</p>'}</div></div>
 <div class="card"><h3>등급 해석</h3><p class="muted">출제 난이도는 학습을 돕는 값이고, 리그 등급은 여러 날의 회상 기록으로 조정하는 게임용 추정값이에요. 공인 어휘력 검사나 실제 학년 점수가 아닙니다. ${c.abilityEvidence?'최근 '+c.abilityEvidence.days+'일, '+c.abilityEvidence.words+'개 단어, '+c.abilityEvidence.samples+'개 지연 회상 기록을 반영했어요.':'기존 등급을 유지하며 여러 날의 회상 근거를 모으고 있어요.'}</p></div>`;
}

function show(id){if(!['learn','intro'].includes(id))pauseLearningClock();else if(session&&!session.clockStarted)session.clockStarted=Date.now();if(['home','characters','ranking'].includes(id))renderExploration();if(id==='home')renderResumeButton();if(id==='home')setTimeout(warmDailyQuestions,0);document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.go===id));if(id==='wordbook')renderWordbook();if(id==='report'){if(!['ayoung','inseong'].includes(reportProfile))reportProfile=['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung';renderReport()}window.scrollTo({top:0,behavior:'smooth'})}
async function login(){setMsg('로그인 중…');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)setMsg('로그인 실패: 이메일과 비밀번호를 확인해 주세요.',true)}
async function signup(){const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6)return setMsg('이메일과 6자 이상의 비밀번호를 입력해 주세요.',true);setMsg('계정을 만드는 중…');const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg(data.session?'계정이 만들어졌어요.':'확인 메일을 보냈어요. 메일의 확인 링크를 눌러 주세요.')}
async function resendConfirm(){const email=$('email').value.trim();if(!email)return setMsg('먼저 이메일을 입력해 주세요.',true);setMsg('확인 메일을 다시 보내는 중…');const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg('새 확인 메일을 보냈어요. 가장 최근 메일의 링크를 눌러 주세요.')}
function setMsg(m,e=false){$('authMsg').textContent=m;$('authMsg').className='authmsg'+(e?' error':'')}
async function applyAuth(sessionObj){
 const previousAccount=authUser?.id;
 authUser=sessionObj?.user||null;
 if(previousAccount&&previousAccount!==authUser?.id){for(const p of preparations.values())p.cancel();preparations.clear();if(session?.preparation)session.preparation.cancel();session=null}
$('authGate').classList.toggle('hidden',!!authUser);
 if(authUser){$('accountEmail').textContent=authUser.email||'가족 계정';try{await cloudLoad();$('cloudPill').textContent='클라우드 연결';$('cloudPill').classList.add('on');setTimeout(async()=>{await ensureCatalog(child().difficulty,'daily');warmDailyQuestions();const st=await curriculumStatus();if(st&&$('curriculumProgress')){const n=Object.values(st).reduce((a,b)=>a+Number(b||0),0);
 const ready=n>=5000&&n<=7000;
 $('curriculumProgress').textContent=ready?'2차 선별 완료 · 사용 가능 '+n.toLocaleString()+'개 · 학년은 권장 단계':'사용 가능 '+n.toLocaleString()+'개 · 점검 필요';
 if($('buildCurriculum')){$('buildCurriculum').textContent=ready?'어휘 DB 확인 완료':'다시 확인';$('buildCurriculum').disabled=ready;}}},700)}catch(e){const loc=localStorage.getItem('vocab-adventure-v8');if(loc)state=mergeState(JSON.parse(loc));mergeLearnerCheckpoints();renderAll();$('cloudPill').textContent='로컬 모드'}} 
}
function startVoice(){
 const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return alert('이 브라우저에서는 음성입력을 지원하지 않아요. Chrome/Edge에서 사용해 주세요.');
 const r=new R();r.lang='ko-KR';r.interimResults=false;$('mic').classList.add('recording');$('mic').textContent='듣는 중…';
 r.onresult=e=>{$('answer').value=e.results[0][0].transcript;answerSource='voice'};r.onend=()=>{$('mic').classList.remove('recording');$('mic').textContent='🎤 음성 입력'};r.onerror=()=>{$('mic').classList.remove('recording');$('mic').textContent='🎤 음성 입력'};r.start();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installHint').textContent='지금 바로 앱으로 설치할 수 있어요.'});
scheduleDailyLeague();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDailyLeague()});
$('evolutionGrid')?.addEventListener('click',e=>{const b=e.target.closest('[data-evolution]');if(b&&!b.disabled)equipEvolution(b.dataset.evolution)});
$('characterGrid')?.addEventListener('click',e=>{const button=e.target.closest('[data-character]');if(button)selectCharacter(button.dataset.character)});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else alert('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 눌러주세요.')};
document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{checkpointSession();if(session?.preparation)session.preparation.cancel();session=null;state.selected=b.dataset.profile;localSave();cloudSave();renderAll();show('home');warmDailyQuestions()});
document.querySelectorAll('[data-report-profile]').forEach(b=>b.onclick=()=>{reportProfile=b.dataset.reportProfile;renderReport()});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));
$('startDaily').onclick=()=>buildSession('daily');$('startReview').onclick=()=>buildSession('review');$('levelTest').onclick=()=>buildSession('level');
$('submit').onclick=()=>gradeCurrent(false);$('hint').onclick=showHint;$('dontKnow').onclick=()=>gradeCurrent(true);$('next').onclick=nextQuestion;$('introNext').onclick=nextIntro;
if($('finishEarly'))$('finishEarly').onclick=()=>{if(session?.results.length)finishSession()};$('mic').onclick=startVoice;
$('signIn').onclick=login;$('signUp').onclick=signup;$('resendConfirm').onclick=resendConfirm;$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('signOut').onclick=()=>sb.auth.signOut();$('syncNow').onclick=()=>cloudSave(false);if($('buildCurriculum'))$('buildCurriculum').onclick=buildFixedCurriculum;
let authSettled=false;
const authTimer=setTimeout(()=>{
  if(!authSettled){
    $('cloudPill').textContent='동기화 지연';
    $('cloudPill').classList.remove('on');
  }
},8000);
sb.auth.getSession()
  .then(({data,error})=>{
    authSettled=true; clearTimeout(authTimer);
    if(error){
      $('cloudPill').textContent='동기화 오류';
      $('authGate').classList.remove('hidden');
      setMsg('연결 상태를 확인한 뒤 다시 로그인해 주세요.',true);
      return;
    }
    if(!data.session){
      $('cloudPill').textContent='로그인 필요';
      $('authGate').classList.remove('hidden');
      return;
    }
    applyAuth(data.session);
  })
  .catch(()=>{
    authSettled=true; clearTimeout(authTimer);
    $('cloudPill').textContent='동기화 오류';
    $('authGate').classList.remove('hidden');
  });
sb.auth.onAuthStateChange((_e,s)=>setTimeout(()=>applyAuth(s),0));

if('serviceWorker'in navigator){
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloading)return;
    reloading=true;
    location.reload();
  });
  navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'})
    .then(reg=>reg.update())
    .catch(()=>{});
}
renderAll();

document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseLearningClock();if(checkpointSession()){localSave();cloudSave()}}else if(session&&['learn','intro'].some(id=>$(id)?.classList.contains('active')))session.clockStarted=Date.now()});
