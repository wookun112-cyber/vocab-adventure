import {AUTHORED_REVISION,authoredQuestionValid} from './lib/authored-policy.js';
import {sentenceUseQuestionValid} from './lib/sentence-use-template.js';
import {DELIVERY_POLICY,localPracticeQuestion} from './lib/local-delivery.js';
import * as studyHistory from './lib/study-history.js';
import {DAILY_POLICY,buildDailyPlan,usageCompleted,usageLessonComplete,nextUsagePlan,applyPendingReviewPolicy} from './lib/daily-practice.js';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {LEARNING_MODEL,QUESTION_POLICY,LEARNING_TYPES,LEARNING_LABELS,STAGE_LABELS,learningDay,dateAfter,daysBetween,studyBudget,buildLearningPlan,masteryConfirmed,recordLearningEvidence,researchSchedule,updateLearningLevels,SESSION_LEVEL_POLICY,reconcileLevelBackfill,presentWrittenQuestion,summarizeEvidence,isLearningTarget,selectLevelReviews,SELECTION_POLICY,inTargetBand,calibratedWord,vocabularyBand,REVIEW_POLICY} from './lib/learning-model.js';
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
const BAND_NAMES={1:'기초 1',2:'기초 2',3:'기초 3',4:'확장 4',5:'확장 5',6:'확장 6',7:'심화 7',8:'심화 8',9:'심화 9'};
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
 ['씨앗','#a5b4ca','잠든 아기 · 큰 얼굴과 포근한 이불'],['새싹','#70bc9b','통통한 새싹 · 앉은 몸과 짧은 발'],['견습','#66a8d8','직립 견습 · 두 발로 선 탐험가'],
 ['모험가','#6f90de','달리는 모험가 · 펄럭이는 망토'],['수호자','#a187da','넓은 수호자 · 커다란 방패와 어깨'],['정예','#d580af','긴 체형의 정예 · 투구와 전신 갑옷'],
 ['영웅','#e6a16c','날개 달린 영웅 · 네 발의 비행수'],['별빛','#e3b85d','떠오른 별빛 · 영혼 꼬리와 마법 구슬'],['전설','#d4a44b','왕실의 전설 · 웅장한 몸과 왕관'],
 ['궁극','#9174dd','은하의 궁극 · 네 날개와 빛의 핵']
].map(([name,color,feature],i)=>({stage:i+1,name,color,feature,minRank:91-i*10,maxRank:100-i*10}));
const evolutionForRank=rank=>clamp(11-Math.ceil(clamp(Number(rank)||100,1,100)/10),1,10);
function evolutionState(c){
 const raw=c.characterEvolution||{},unlockedStage=clamp(Math.floor(Number(raw.unlockedStage)||1),1,10);
 return {version:1,unlockedStage,equippedStage:clamp(Math.floor(Number(raw.equippedStage)||unlockedStage),1,unlockedStage),bestRank:Number.isInteger(raw.bestRank)&&raw.bestRank>=1&&raw.bestRank<=100?raw.bestRank:null,awardedAt:Number.isFinite(Date.parse(raw.awardedAt))?raw.awardedAt:null};
}
let characterSvgSequence=0;
function characterSvg(id,evolution=1,look={}){
 const a=CHARACTERS.find(x=>x.id===id)||CHARACTERS[0],c=a.color,k=a.shape,stage=clamp(Math.floor(Number(evolution)||1),1,10),form=EVOLUTION_FORMS[stage-1];
 const uid='evo-'+(++characterSvgSequence),power=['horn','dino','robot','lion','tiger'].includes(k)||a.id==='wolf',bird=['owl','penguin','chick'].includes(k);
 const tint=(hex,amount)=>'#'+hex.slice(1).match(/../g).map(v=>{const n=parseInt(v,16);return Math.round(amount>=0?n+(255-n)*amount:n*(1+amount)).toString(16).padStart(2,'0')}).join('');
 const accent=({rose:'#eb86b3',ocean:'#518dd1',forest:'#479e83',royal:'#8670d2'})[look.outfit]||form.color,paint=name=>`url(#${uid}-${name})`,outline=tint(c,-.3);
 const defs=`<defs><radialGradient id="${uid}-skin" cx="32%" cy="22%" r="85%"><stop stop-color="${tint(c,.62)}"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="${tint(c,-.18)}"/></radialGradient><linearGradient id="${uid}-metal" x2=".8" y2="1"><stop stop-color="${tint(accent,.55)}"/><stop offset=".45" stop-color="${accent}"/><stop offset="1" stop-color="${tint(accent,-.3)}"/></linearGradient><linearGradient id="${uid}-gold" x2=".3" y2="1"><stop stop-color="#fff3b4"/><stop offset=".5" stop-color="#f3cf72"/><stop offset="1" stop-color="#b98036"/></linearGradient><linearGradient id="${uid}-wing" x2="1" y2="1">${(stage===10?['#9be8f1','#baa9ef','#f3aad0','#ffe99a']:['#fff5d0',tint(accent,.4),accent]).map((color,i,arr)=>`<stop offset="${i/(arr.length-1)}" stop-color="${color}"/>`).join('')}</linearGradient><radialGradient id="${uid}-aura"><stop offset=".2" stop-color="${accent}" stop-opacity=".02"/><stop offset=".7" stop-color="${accent}" stop-opacity=".3"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>`;
 const star=(x,y,r,color='#f3cf72')=>`<path d="M${x} ${y-r}l${r*.3} ${r*.7} ${r*.7} ${r*.3}-${r*.7} ${r*.3}-${r*.3} ${r*.7}-${r*.3}-${r*.7}-${r*.7}-${r*.3} ${r*.7}-${r*.3}Z" fill="${color}"/>`;
 const orb=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${paint('wing')}" stroke="#ffedb5" stroke-width="2"/>${star(x,y,r*.6,'#fff9e1')}`;
 const limb=(x,y,rx,ry,rotation=0)=>{
  const transform=`rotate(${rotation} ${x} ${y})`,fill=a.id==='panda'&&rx<22?'#3d4f60':a.id==='penguin'?'#435c75':paint('skin');
  if(a.id==='robot')return `<g transform="${transform}"><rect x="${x-rx}" y="${y-ry}" width="${rx*2}" height="${ry*2}" rx="${Math.min(rx,ry)*.4}" fill="${paint('skin')}" stroke="#56758e" stroke-width="1.5"/><path d="M${x-rx*.65} ${y+ry*.5}h${rx*1.3}" stroke="#e0edf4" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${Math.min(rx,ry)*.25}" fill="#7292a9" stroke="#c9e5ea" stroke-width="1"/></g>`;
  if(bird&&ry>rx*1.5&&x!==100)return `<path d="M${x-rx} ${y-ry}q${rx*2} ${-ry*.3} ${rx*2} ${ry}l-${rx*.3} ${ry}q-${rx*1.8} ${-ry*.2}-${rx*1.7}-${ry}Z" transform="${transform}" fill="${a.id==='penguin'?'#3e5368':tint(c,-.16)}" stroke="${outline}" stroke-width="1.5"/>`;
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="${transform}" fill="${fill}" stroke="${outline}" stroke-width="1.5"/>`;
 };
 const wing=(x,y,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})" fill="${paint('wing')}" stroke="${stage===10?'#efd27f':accent}" stroke-width="1.5"><path d="${power?'M0 15Q-32 0-58-60l21 10-3-29 23 24 6-24L9-9Z':'M0 15Q-60-1-61-62q25 4 34 29-8-24-1-42Q2-62 9-9Z'}"/><path d="M0 7-44-47M3-3-21-57M-4 13-39-13" stroke="#fff9e2" fill="none" stroke-width="1.5" opacity=".8"/></g>`;
 // Every stage has its own body geometry, posture and head-to-body ratio.
 const poses=[
  [100,121,1.23,100,154,0],[99,91,1.13,100,139,0],[100,66,.98,100,120,0],
  [94,65,.93,105,116,-12],[100,64,.96,100,124,0],[100,60,.82,100,112,0],
  [72,79,.85,114,126,-7],[100,64,.8,100,117,0],[100,62,.94,100,121,0],[100,68,.74,100,119,0]
 ];
 const [hx,hy,hs,bx,by,tilt]=poses[stage-1];
 let background=`<circle cx="100" cy="100" r="91" fill="${tint(c,.87)}"/>`;
 if(look.background==='garden')background='<circle cx="100" cy="100" r="94" fill="#e3f6e8"/><path d="M12 143q40-35 88 0 46-44 88 0v20q-85 58-176 0" fill="#a5d6b1"/><g fill="#fff2aa"><circle cx="34" cy="119" r="7"/><circle cx="164" cy="151" r="8"/><circle cx="153" cy="42" r="6"/></g><path d="M34 125v22m130 11v15" stroke="#5da775" stroke-width="3"/>';
 if(look.background==='moon')background='<circle cx="100" cy="100" r="94" fill="#293969"/><circle cx="153" cy="47" r="22" fill="#fff1b2"/><circle cx="163" cy="38" r="20" fill="#293969"/>'+[[30,50],[42,110],[163,117],[69,24],[171,80]].map(([x,y])=>star(x,y,3,'#d3e8ff')).join('');
 if(look.background==='sunset')background='<circle cx="100" cy="100" r="94" fill="#fde3db"/><circle cx="144" cy="59" r="27" fill="#ffbf94"/><path d="M11 135 48 93l43 48 36-29 62 25v24q-90 58-178 0" fill="#beabd8"/><path d="M16 161q67-26 170-9" stroke="#fbe2d5" stroke-width="5" fill="none"/>';
 if(look.background==='galaxy')background='<circle cx="100" cy="100" r="94" fill="#382858"/><ellipse cx="100" cy="105" rx="88" ry="35" transform="rotate(-30 100 105)" fill="#7460a3" opacity=".6"/>'+Array.from({length:17},(_,i)=>star(21+(i*41)%162,24+(i*53)%151,i%3===0?4:2,i%2?'#f4ccdf':'#a8e5f0')).join('');
 let back='',body='',front='';
 if(stage===1){body=limb(100,156,26,15)+`<path d="M65 153q34 24 71 0l-9 28H76Z" fill="${paint('metal')}"/><path d="M75 164q25 10 51 0" stroke="#fff" opacity=".7" fill="none" stroke-width="3"/>`;}
 if(stage===2){body=limb(100,142,34,30)+limb(72,166,17,10)+limb(128,166,17,10)+limb(69,137,10,22,-25)+limb(131,137,10,22,25);front=`<path d="m76 118 23 8 24-8-5 16H81Z" fill="${paint('metal')}"/><path d="m108 129 16 26 8-22" fill="${paint('metal')}"/>`;}
 if(stage===3){body=limb(100,122,25,33)+limb(79,174,14,12)+limb(121,174,14,12)+limb(70,116,10,25,15)+limb(130,116,10,25,-15);front=`<path d="M78 104q22 13 44 0v39H78Z" fill="${paint('metal')}" stroke="#fff" stroke-width="2"/>${star(100,123,10,'#fff4bc')}<path d="M80 154v12m40-12v12" stroke="${outline}" stroke-width="3"/>`;}
 if(stage===4){back=`<path d="M85 94 146 85 171 159l-45-9-62 23Z" fill="${paint('metal')}" stroke="#f2d998" stroke-width="2"/>`;body=`<g transform="rotate(-12 103 125)">${limb(103,125,27,34)}${limb(81,168,14,11)}${limb(133,160,14,11)}${limb(65,110,12,24,36)}${limb(140,111,12,25,-43)}</g>`;front=`<path d="m74 96 24 9 28-10-7 14-23 5Z" fill="${paint('gold')}"/>${orb(153,87,9)}<path d="M153 95v56" stroke="#8d795c" stroke-width="5" stroke-linecap="round"/>`;}
 if(stage===5){back=`<path d="M64 101 38 167l61-12 62 12-25-66" fill="${paint('metal')}"/>`;body=limb(100,128,37,32)+limb(72,170,19,13)+limb(128,170,19,13)+limb(55,119,15,26,-15)+limb(145,119,15,26,15);front=`<path d="M66 104 100 97l34 7-8 45-26 16-26-16Z" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="3"/>${orb(100,124,13)}<path d="m36 117 23-10 22 11-4 30-18 19-19-19Z" fill="${paint('gold')}" stroke="#ac7c48" stroke-width="2"/>${star(59,135,12,accent)}`;}
 if(stage===6){back=`<path d="m72 81-34 93 35-19 27 26 30-24 33 19-34-95Z" fill="${paint('metal')}"/>`;body=`<path d="M76 91 100 85l24 6 12 45-19 12H83l-19-12Z" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="3"/>${limb(77,158,13,25,8)}${limb(123,158,13,25,-8)}<path d="m58 94 22 6-12 24-22-14m96-16-22 6 12 24 22-14" fill="${paint('gold')}"/>${limb(51,125,12,22,10)}${limb(149,125,12,22,-10)}${orb(100,108,12)}<path d="m84 128 16 9 16-9" stroke="#f8e3aa" stroke-width="3" fill="none"/>`;front=`<path d="M71 45 79 20l21 8 21-8 8 25-14-8-15 7-15-7Z" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="2"/>`;}
 if(stage===7){back=wing(121,97,.92)+wing(143,103,-.75);body=`<path d="M141 124q39 18 39-18l-9 7-6-16q31 22 13 48l-30 4" fill="${paint('skin')}" stroke="${outline}" stroke-width="2"/>${limb(111,125,49,29,-8)}${limb(69,155,13,22,12)}${limb(94,157,13,22,-6)}${limb(141,151,13,24,-15)}<path d="m72 109 34-10 39 16-9 17-33-9-24 3Z" fill="${paint('metal')}" stroke="#f1d48c" stroke-width="2"/>`;front=`<path d="m46 99 33 3 16-7-4 18-37 1Z" fill="${paint('gold')}"/>`;}
 if(stage===8){back=`<g class="evo-aura"><circle cx="100" cy="99" r="79" fill="${paint('aura')}"/><circle cx="100" cy="85" r="66" fill="none" stroke="${paint('gold')}" stroke-width="2" stroke-dasharray="8 5"/></g><path d="M66 107Q11 117 36 171q-8-47 44-24m54-40q55 10 30 64 8-47-44-24" fill="${paint('wing')}" opacity=".8"/>`;body=`<path d="M80 91q20 18 40 0 22 50-20 85-10-22-26-25 19-5 6-60Z" fill="${paint('wing')}" stroke="${accent}" stroke-width="2"/>${limb(62,113,10,27,55)}${limb(138,113,10,27,-55)}${orb(100,116,14)}<ellipse cx="100" cy="181" rx="40" ry="7" fill="none" stroke="${accent}" stroke-width="2"/>`;front=orb(41,104,11)+orb(159,104,11)+`<ellipse cx="100" cy="21" rx="27" ry="6" fill="none" stroke="${paint('gold')}" stroke-width="4"/>`;}
 if(stage===9){back=`<path d="m60 82-27 96 66-17 68 17-28-96Z" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="3"/><path d="M45 169 61 104m94 65-16-65" stroke="#fff1ca" stroke-width="3"/>`;body=power?`${limb(100,128,42,37)}${limb(58,162,18,21,8)}${limb(142,162,18,21,-8)}${limb(100,139,27,35)}<path d="m65 103 35-10 35 10-10 32h-50Z" fill="${paint('gold')}" stroke="#b78a43" stroke-width="2"/>`:`<path d="M79 91q21 11 42 0l34 77q-54 26-109 0Z" fill="${paint('wing')}" stroke="${paint('gold')}" stroke-width="3"/><path d="M80 121 63 161m38-35v43m18-48 19 40" stroke="#fff4d1" stroke-width="3"/>${limb(66,111,11,27,30)}${limb(134,111,11,27,-30)}`;front=`<path d="m77 32-4-21 17 9L100 3l10 17 17-9-4 21Z" fill="${paint('gold')}" stroke="#ac7c40" stroke-width="2"/>${orb(100,25,6)}${orb(100,116,14)}<path d="M160 83v84" stroke="${paint('gold')}" stroke-width="5"/>${orb(160,74,13)}`;}
 if(stage===10){back=`<g class="evo-aura"><circle cx="100" cy="100" r="95" fill="${paint('aura')}"/><circle cx="100" cy="100" r="86" fill="none" stroke="${paint('gold')}" stroke-width="2"/><ellipse cx="100" cy="100" rx="96" ry="51" transform="rotate(-30 100 100)" fill="none" stroke="#b4dff1" stroke-width="2"/></g>`+wing(83,103,1.05)+wing(117,103,-1.05)+wing(85,143,.85)+wing(115,143,-.85)+`<path d="M72 146q-53-21-51 25 17-28 57 6m44-31q53-21 51 25-17-28-57 6" fill="${paint('wing')}" stroke="#f4dc96" stroke-width="2"/>`;body=`<path d="M80 91q20 13 40 0l14 37-17 29-17 28-17-28-17-29Z" fill="${paint('metal')}" stroke="${paint('gold')}" stroke-width="3"/>${limb(70,116,11,25,45)}${limb(130,116,11,25,-45)}${limb(84,158,10,20,18)}${limb(116,158,10,20,-18)}${orb(100,117,18)}<path d="m82 142 18 15 18-15" stroke="#fff0ba" stroke-width="3" fill="none"/>`;front=`<path d="m81 40-9-22 19 9 9-22 9 22 19-9-9 22Z" fill="${paint('gold')}" stroke="#b08144" stroke-width="2"/>${orb(100,31,6)}${orb(29,101,9)}${orb(171,101,9)}`;}
 // Hand-drawn species silhouettes, facial planes and markings; no shared round-face template.
 const species=a.id,cream='#fff2d7',dark='#34445c';
 let ears='',face='',detail='',muzzle='',eyeY=48,eyeX=[36,64],eyeColor=dark;
 const skin=paint('skin'),edge=outline;
 const ell=(x,y,rx,ry,fill,stroke='none',width=1.5)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
 const path=(d,fill,stroke='none',width=1.5)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
 const smile=(x=50,y=64)=>path(`M${x-8} ${y}q8 8 16 0`,'none',dark,2);
 const snout=(x=50,y=62,rx=16,ry=11,fill=cream)=>ell(x,y,rx,ry,fill)+path(`M${x-4} ${y-5}q4-3 8 0l-4 4Z`,dark)+path(`M${x} ${y-1}v4m0-1q-5 6-10 1m10-1q5 6 10 1`,'none',dark,1.6);
 const whiskers=path('M22 57 12 54m10 9-11 1m67-7 10-3m-10 9 11 1','none',dark,1.5);
 const furLines=path('m30 34 3-3m12 0 4-2m14 3 4-2','none',tint(c,-.22),1.3);
 const tooth=path('m43 69 4 7 3-7m4 0 3 7 4-7','#fff9e7');
 if(species==='puppy'){
  ears=path('M26 29Q10 29 10 46L8 67q2 15 13 9l10-19Z','#b68157', '#936842',1.5)+path('M74 29q16 0 16 17l2 21q-2 15-13 9L69 57Z','#b68157','#936842',1.5)+path('M16 39q-6 26 2 31m66-31q6 26-2 31','none','#d6ac83',3);
  face=path('M22 45q0-20 28-20t28 20l-1 20q-6 19-27 18T23 65Z',skin,edge);
  detail=ell(33,47,12,16,'#ce9a6d')+path('m43 29q-5-9 4-11 11 1 7 9','none','#c59261',2)+path('M43 31q8-4 15 1','none','#fff1d3',3);
  muzzle=snout(50,64,20,14)+ell(47,59,1.3,1,'white')+path('m34 62 1 0m1 5 1 0m28-5 1 0m-1 5 1 0','none','#ae8160',1.8)+(stage<5?path('M47 72h7q0 10-4 10t-3-10','#ef9caa'):'');
 }else if(species==='dragon'){
  ears=path('M24 36Q10 22 16 9q5 15 21 18m27 0q17-3 21-18 6 13-8 27','#f4cd89','#b98a49',2)+path('m16 10 9 18m60-18-10 18','none','#fff2c7',2)+path('m22 41-13-5 4 15-6 9 17 2m54-21 13-5-4 15 6 9-17 2',tint(c,-.16),edge);
  face=path('M24 38 36 27h28l12 11 4 24-12 17H32L20 62Z',skin,edge,1.8);
  detail=path('m42 31 8-9 8 9-8 7Zm-13 9 5-4 5 4-5 5m22-5 5-4 5 4-5 5',tint(c,-.25))+path('m31 38 4 0m27 0 4 0','none',tint(c,.6),2);
  muzzle=path('M31 56q19-9 38 0l4 12-9 10H36l-9-10Z',tint(c,.45),edge)+ell(37,60,2,1.5,'#478868')+ell(63,60,2,1.5,'#478868')+smile(50,69)+tooth;
 }else if(species==='cat'){
  ears=path('M22 42 16 9 40 27m20 0L84 9l-6 33',skin,edge,2)+path('m23 20 4 15 8-7m30 0 8 7 4-15','#eaa9c4');
  face=path('M25 35q25-16 50 0l6 18-5 20-12-3-14 12-14-12-12 3-5-20Z',skin,edge);
  detail=path('m43 28 7 10 7-10',tint(c,-.3))+path('m26 57 8 8-6 6m46-14-8 8 6 6',tint(c,.6));
  muzzle=snout(50,64,14,10,'#f8eafa')+whiskers;
 }else if(species==='fox'){
  ears=path('M21 40 16 6l27 25m14 0L84 6l-5 34',skin,edge,2)+path('m22 14 4 20 13-5m22 0 13 5 4-20','#664c53')+path('m27 24 3 8 7-3m26 0 7 3 3-8','#f7dac0');
  face=path('M25 33q25-12 50 0l14 27-18 11-21 14-21-14-18-11Z',skin,edge,1.5);
  detail=path('M15 57 30 61 42 70 50 80 58 70 70 61 85 57 71 75 50 86 29 75Z',cream)+path('m39 35 11 8 11-8',tint(c,-.1));
  muzzle=path('m44 68 6-3 6 3-6 6Z','#4c3b42')+path('M50 74v3m0-1q-4 4-8 0m8 0q4 4 8 0','none','#5b4245',1.5);eyeY=51;eyeColor='#624844';
 }else if(species==='bear'){
  ears=ell(25,31,14,15,'#b17b52',edge)+ell(75,31,14,15,'#b17b52',edge)+ell(25,31,8,9,'#dfbb95')+ell(75,31,8,9,'#dfbb95');
  face=path('M22 41q2-18 28-18t28 18l3 24q-8 19-31 19T19 65Z',skin,edge);
  detail=furLines+path('M28 35q6-5 11-4m22 0q6-1 11 4','none','#9b6f4f',2);
  muzzle=snout(50,65,20,14,'#efcea4')+ell(49,59,2,1,'#fff3dd');
 }else if(species==='panda'){
  ears=ell(25,29,14,15,'#344557')+ell(75,29,14,15,'#344557')+ell(25,29,7,8,'#63758a')+ell(75,29,7,8,'#63758a');
  face=path('M22 41q2-18 28-18t28 18l3 24q-8 19-31 19T19 65Z','#fbfaf3','#bdc5ca');
  detail=`<ellipse cx="34" cy="49" rx="12" ry="16" transform="rotate(24 34 49)" fill="#394c60"/><ellipse cx="66" cy="49" rx="12" ry="16" transform="rotate(-24 66 49)" fill="#394c60"/>`;
  muzzle=snout(50,66,15,11,'#fffdf2');eyeColor='#1d2b3c';
 }else if(species==='rabbit'){
  ears=path('M28 37Q13 2 26-5q13-5 18 36m12 0Q60-5 74-3q14 5-3 40',skin,edge,1.7)+path('M29 24q-9-20-2-24 7 2 10 25m27 0q4-23 9-22 7 5-3 25','#efb2d4');
  face=path('M24 43q5-17 26-17t26 17l3 20q-5 20-29 22T21 63Z',skin,edge);
  detail=path('m44 32 6-5 6 5','none','#fff4f9',3);
  muzzle=ell(42,64,10,8,'#fff5f7')+ell(58,64,10,8,'#fff5f7')+path('m45 59 5-3 5 3-5 5Z','#d47aa2')+path('M45 70h10v10H45Z','#fffdf2', '#bb9baa',1)+path('M50 71v8','none','#d8c2cd',1)+whiskers;
 }else if(species==='wolf'){
  ears=path('M21 39 19 10l25 19m12 0 25-19-2 29',skin,edge,2)+path('m25 18 3 16 10-4m24 0 10 4 3-16','#667c93');
  face=path('M25 33 35 24l15 6 15-6 10 9 4 13 8 9-9 4 8 10-13 2-10 12-13-6-13 6-10-12-13-2 8-10-9-4 8-9Z',skin,edge);
  detail=path('M29 50 39 59 50 56 61 59 71 50l7 16-14 12-14-6-14 6-14-12Z','#e3edf2')+path('M40 31 50 45 60 31',tint(c,-.33));
  muzzle=snout(50,67,15,9,'#f3f6f5')+path('m40 72 3 5 3-5m8 0 3 5 3-5','#fffef2');eyeColor='#43677a';
 }else if(species==='lion'){
  ears=path('M50 10 59 18 72 14 76 26 90 31 84 43 94 55 83 63 87 78 73 78 66 91 53 85 41 92 33 81 18 82 19 67 7 59 17 47 10 34 24 29 29 16 40 19Z','#bb803e','#926237',2)+path('m25 31 8 6m-10 27 11-3m32-24 8-6m-9 30 12 4m-35 14 4-10m14 10-3-10','none','#e8b363',2)+ell(26,36,9,10,'#ddab62')+ell(74,36,9,10,'#ddab62');
  face=path('M26 41q24-20 48 0l3 21q-5 20-27 20T23 62Z',skin,edge);
  detail=path('m42 32 8 8 8-8','#f5d187');muzzle=snout(50,65,19,13,'#ffe5ad')+path('m32 62 1 0m4 5 1 0m29-5 1 0m-5 5 1 0','none','#ae824b',1.8);
 }else if(species==='tiger'){
  ears=ell(25,30,13,14,'#aa683b')+ell(75,30,13,14,'#aa683b')+ell(25,30,7,8,'#ffd7a2')+ell(75,30,7,8,'#ffd7a2');
  face=path('M24 38q26-19 52 0l4 25q-7 22-30 22T20 63Z',skin,edge);
  detail=path('m41 28 9 12 9-12-9 5Zm-18 14 13 4-14 4m0 4 13 4-11 5m53-21-13 4 14 4m0 4-13 4 11 5','#744d36')+path('M29 61q21-9 42 0l-4 16H33Z','#fff2d1');
  muzzle=snout(50,68,18,11,'#fff2d1')+whiskers;
 }else if(species==='frog'){
  ears=ell(30,31,15,16,skin,edge)+ell(70,31,15,16,skin,edge);
  face=path('M21 40q-12 7-11 23 0 19 40 19t40-19q1-16-11-23Z',skin,edge,1.7);
  detail=ell(30,31,10,11,'#eef8b9')+ell(70,31,10,11,'#eef8b9')+ell(20,58,4,3,'#70b468')+ell(80,58,4,3,'#70b468')+ell(26,67,2,2,'#70b468')+ell(74,67,2,2,'#70b468');
  muzzle=path('M25 66q25 19 50 0','none','#477946',2.4)+ell(45,57,1.8,1.2,'#518c4d')+ell(55,57,1.8,1.2,'#518c4d');eyeY=31;eyeX=[30,70];
 }else if(species==='slime'){
  face=path('M12 66q3-29 24-32 13-3 16-19 18 10 16 23 16 1 20 27 4 20-38 20T12 66Z',skin,'#66b8ac',1.7);
  detail=path('M24 55q1-13 12-16m13-12q3-2 4-5','none','#edffff',4)+ell(71,56,7,9,'#d9ffff')+ell(76,72,3,4,'#e8fffe')+ell(26,73,4,3,'#c2f7eb')+path('M19 78q31 12 62-1','none','#65b9ae',2);
  muzzle=path('M41 65q9 11 18 0','none','#438b84',2.5);eyeColor='#316f70';
 }else if(species==='robot'){
  ears=path('M50 28V12','none','#627e9d',4)+ell(50,10,5,5,'#f7ce69','#a88748')+path('M21 40H10v26h11m58-26h11v26H79','#7b9dba','#486684',2);
  face=path('M30 25h40l11 11v34L69 82H31L19 70V36Z',skin,'#526e8a',2)+path('M27 39h46v24H27Z','#23465d','#d1edf2',2);
  detail=path('M31 68h38v8H31Z','#e5eef0','#7a9aaa',1)+path('M36 69v6m7-6v6m7-6v6m7-6v6m7-6v6','none','#809aaa',1)+[ [27,31],[73,31],[25,70],[75,70] ].map(([x,y])=>ell(x,y,2,2,'#5c7d98')+path(`M${x-1} ${y}h2`,'none','#c1d3df',.8)).join('');
  muzzle='';eyeY=50;eyeColor='#8af0df';
 }else if(species==='monster'){
  ears=path('M26 39Q9 37 9 25l9 3-3-15q16 4 21 19m28 0q5-15 21-19l-3 15 9-3q0 12-17 14','#bc87d6','#84659d',2);
  face=path('M22 39 33 25l17 5 17-5 11 14 7 19-7 18-16 7-12-5-12 5-16-7-7-18Z',skin,edge,1.8);
  detail=ell(29,60,5,3,'#8b74bc')+ell(71,60,5,3,'#8b74bc')+path('m44 31 6-4 6 4','#ead7fc');
  muzzle=path('M34 65q16 24 32 0Z','#584773')+path('m37 67 4 8 4-6m10 0 4 6 4-8','#fff2db')+path('M44 77q6-5 12 0','#dd9abd');eyeColor='#5b426f';
 }else if(species==='owl'){
  ears=path('M24 41 17 16l21 12m24 0 21-12-7 25','#8f7151','#775d44',1.6);
  face=path('M24 35q26-16 52 0l5 22-8 22-23 8-23-8-8-22Z',skin,edge);
  detail=path('M22 48q-3-23 22-15l6 7 6-7q25-8 22 15l-4 20-24 11-24-11Z','#f5e5c6')+ell(34,49,13,15,'#e1c998','#987c5f',1)+ell(66,49,13,15,'#e1c998','#987c5f',1)+path('m30 70 4 6 4-6m8 5 4 6 4-6m8-5 4 6 4-6','#ba9565');
  muzzle=path('m45 58 5-4 5 4-5 12Z','#dfa750','#9f794d',1);eyeX=[34,66];eyeColor='#3c342d';
 }else if(species==='penguin'){
  face=path('M26 41q3-20 24-20t24 20l7 24q-6 21-31 23T19 65Z','#435c75','#30475f');
  detail=path('M26 50q0-15 15-14l9 13 9-13q15-1 15 14v21q-24 19-48 0Z','#f7f7e8')+path('M39 26q11-6 22 0','none','#7797b0',3);
  muzzle=path('M40 61q10-7 20 0l-10 9Z','#eda84f','#a97b43',1.3);eyeX=[35,65];eyeY=53;
 }else if(species==='chick'){
  ears=path('M43 29q-13-13 0-18l4 13q-1-18 11-19l-1 19q9-13 17-5L61 33','#f3b957','#cc974e',1.3);
  face=path('M23 41q6-19 27-19t27 19l3 21q-4 24-30 24T20 62Z',skin,edge);
  detail=path('M27 43q6-10 15-11','none','#fff4bd',3)+ell(27,64,7,4,'#efb787')+ell(73,64,7,4,'#efb787');
  muzzle=path('m42 59 8-3 8 3-8 13Z','#eaa34b','#bd863c',1.4)+path('M44 63h12','none','#ffd29a',1.3);eyeY=51;
 }else if(species==='koala'){
  ears=path('M30 30 24 16 14 17 8 25 9 39 4 43 10 47 11 55 26 54 36 42m28 0 10 12 15 1 1-8 6-4-5-4 1-14-6-8-10-1-6 14','#a6b6c3','#7b8f9f',1.5)+ell(20,36,10,13,'#dce7eb')+ell(80,36,10,13,'#dce7eb')+path('m10 28 7 4m-8 4 6 2m75-10-7 4m8 4-6 2','none','#edf4f5',2);
  face=path('M25 41q4-18 25-18t25 18l4 25q-8 18-29 18T21 66Z',skin,edge);
  detail=path('m43 30 7-5 7 5','none','#d9e7eb',3);muzzle=ell(50,59,9,17,'#455a69','#354955',1.4)+ell(47,53,2,5,'#768b98')+path('M43 76q7 4 14 0','none','#596d7e',1.7);eyeX=[32,68];eyeY=51;
 }else if(species==='unicorn'){
  ears=path('M23 41 22 17l19 15m18 0 19-15-1 24',skin,edge,1.5)+path('m27 25 3 11 7-2m26 0 7 2 3-11','#f2b9ce')+path('M41 31 51 1l10 30Z','#f1d799','#c9aa65',1.5)+path('m47 12 9 4m-12 3 14 5','none','#c6a252',1.3);
  face=path('M25 38q4-14 25-14t25 14l-4 22-7 18q-14 12-28 0l-7-18Z',skin,edge,1.5);
  detail=path('M28 37Q15 26 27 20q14-8 25 11-8-1-10 10L30 52Z','#aa8dda')+path('M61 29q20 6 17 21l-8 17 14 7q-16 3-23-8 15-7 0-37','#dfacd6')+path('M30 25q9-2 13 8','none','#e4cbf4',2);
  muzzle=ell(50,69,19,13,'#f6dbe5','#c6a5c6',1)+ell(40,66,2,2,'#a583a0')+ell(60,66,2,2,'#a583a0')+smile(50,73);eyeY=49;
 }else if(species==='dino'){
  ears=path('M31 37 36 18l11 14 7-21 10 20 11-10 1 18','#75a365','#507f4d',1.5);
  face=path('M26 35q24-16 46 2l6 17 6 8q2 17-31 22-30 3-37-14l3-20Z',skin,edge,1.8);
  detail=ell(24,53,4,3,'#86b974')+ell(72,48,4,3,'#86b974')+ell(66,35,3,2,'#d6eab0');
  muzzle=path('M25 57q24-9 52 3l3 12q-24 20-50 6Z','#d5e6aa', '#80a063',1.2)+ell(36,62,2,2,'#6c9158')+ell(66,62,2,2,'#6c9158')+smile(51,70)+path('m39 73 3 5 3-5m11 0 3 5 3-5','#fff8d9');eyeX=[32,66];eyeY=47;
 }
 const eyes=species==='robot'?(stage===1?path('M32 49h9m18 0h9','none','#93e9db',3):path('M32 46h9v9h-9Zm27 0h9v9h-9Z','#87eedc')+path('M33 46h3m24 0h3','none','#e1ffff',1.5)):
  stage===1?path(`M${eyeX[0]-5} ${eyeY}q5 6 10 0m${eyeX[1]-eyeX[0]-10} 0q5 6 10 0`,'none',eyeColor,2.5):eyeX.map(x=>ell(x,eyeY,species==='owl'?6:species==='frog'?5.5:power&&stage>=6?5:4.2,species==='owl'?8:power&&stage>=6?4:6,eyeColor)+ell(x-1.4,eyeY-2.3,1.7,2,'#fff')+(species==='owl'||species==='frog'?ell(x+1.3,eyeY+2,1,1,'#d9ecd7'):'')).join('')+(power&&stage>=5&&species!=='robot'?path(`M${eyeX[0]-7} ${eyeY-10}l12 3m${eyeX[1]-eyeX[0]-12} 0 12-3`,'none',edge,2):'');
 const blush=species==='robot'||species==='dragon'||species==='dino'||species==='wolf'?'':ell(eyeX[0]-8,eyeY+13,5,2.5,'#e99daf')+ell(eyeX[1]+8,eyeY+13,5,2.5,'#e99daf');
 // Tails and native anatomy remain visible around evolution clothing.
 const tailY=stage===1?158:stage===2?147:stage===7?139:151,tailScale=stage===1?.65:1;
 let anatomyBack='',anatomyFront='';
 const tail=(drawing)=>`<g class="species-tail" transform="translate(${stage===7?8:0} ${tailY-151}) scale(${tailScale})">${drawing}</g>`;
 if(species==='puppy')anatomyBack=tail(path('M126 151q24 13 37-6 9-16-1-23 2 17-16 19l-17-3Z','#c79467','#9a714f',1.5)+path('M160 128q4 12-8 15','none','#f5dcb7',3));
 if(species==='cat')anatomyBack=tail(path('M126 154q43 7 40-33-1-13-10-12-10 2-5 13 3-11 8-1 2 25-30 17Z',skin,edge,1.5)+path('M157 111q-8 3-3 12','none','#e6d7fb',3));
 if(species==='fox')anatomyBack=tail(path('M126 151q29 8 39-20 3-16 14-22 13 41-16 57-26 10-39-2Z',skin,edge,1.5)+path('M166 126 178 110q9 28-8 42l-7-6-5 7 2-17Z',cream));
 if(species==='wolf')anatomyBack=tail(path('M126 149q26-2 35-31l6 11 9-7-2 19 10-2-10 14 5 4-19 11-15-4-18 0Z',skin,edge,1.5)+path('m164 136 9-8-2 15 7-1-11 13-10-3Z','#dce8ef'));
 if(species==='lion')anatomyBack=tail(path('M129 151q38 24 34-25','none','#c89e55',7)+path('M165 108q18 7 11 21l-15 8-9-15Z','#ba7b3e','#936439',1.5)+path('m164 115 3 12','none','#e1ad5e',2));
 if(species==='tiger')anatomyBack=tail(path('M130 153q40 15 35-22-1-12-10-19','none','#dca06a',9)+path('m160 120 7-4m-3 17 6-2m-7 14 7 2m-15 11 2 7m-15-9-1 7','none','#744d36',4));
 if(species==='dragon'||species==='dino')anatomyBack=tail(path('M123 145q32 5 47-18l-2-14 17 9-3 18q-17 33-52 26Z',skin,edge,1.5)+path('m137 144 2-16 12 8 3-15 10 5 7-15 6 11',species==='dragon'?'#dfb367':'#73a25f',edge,1)+path('M135 159q31 0 43-24','none',tint(c,.5),3));
 if(species==='rabbit')anatomyBack=tail(ell(137,151,15,15,'#fff0f4','#d8b2cb',1.5)+path('m129 141 4-2m8 2 3 3m-15 12 4 2','none','#e1c6d8',1.3));
 if(species==='bear'||species==='panda'||species==='koala')anatomyBack=tail(ell(135,154,species==='koala'?8:11,10,species==='panda'?'#edf1e9':skin,edge));
 if(species==='unicorn')anatomyBack=tail(path('M126 148q23-10 35-2 15 10 10 29l-12-7-9 8 2-16-20 2Z','#ceaddf','#af86c2',1.5)+path('M146 149q16 3 17 18','none','#f2c6df',4)+path('M144 156q10 0 9 13','none','#b8dce9',3));
 if(species==='monster')anatomyBack=tail(path('M129 150q25 7 32-10l-6-9 18-5 7 17-11 1q-7 24-34 18Z',skin,edge)+path('m157 127 8 5 5-9','#dbc79a'));
 if(species==='owl')anatomyBack=tail(path('M79 151 86 181 96 177 101 184 108 177 118 181l6-30Z','#9a7a55','#775d43',1.5)+path('M94 161v16m14-16v16','none','#d8bd95',2));
 if(species==='penguin')anatomyBack=tail(path('m79 147 11 31 11-7 9 7 12-31Z','#3f576e','#2d4257',1.3));
 if(species==='chick')anatomyBack=tail(path('m125 153 19-18-3 15 13-3-7 18-21 1Z','#edbe60','#c89b46',1.5));
 if(species==='frog')anatomyBack=tail(path('m66 147-23 13-10 9 15 1-2 9 18-10 9-12m61-10 23 13 10 9-15 1 2 9-18-10-9-12',tint(c,-.1),edge,1.2));
 if(species==='robot')anatomyBack=tail(path('M139 131q31 4 25-23','none','#748fa6',4)+path('m160 99 10 1-2 10-10-1Z','#9bd8e1','#4e738d',1.5));
 // Small paw, hoof, scale and feather details make the body read as the chosen species.
 const feet=stage===1?[]:stage===2?[[72,166],[128,166]]:stage===3?[[79,174],[121,174]]:stage===4?[[81,168],[133,160]]:stage===5?[[72,170],[128,170]]:stage===6?[[77,173],[123,173]]:stage===7?[[69,169],[94,171],[141,167]]:stage===9?power?[[58,174],[142,174]]:[]:stage===10?[[84,171],[116,171]]:[];
 for(const [x,y] of feet){
  if(species==='unicorn')anatomyFront+=path(`M${x-9} ${y-4}h18v8h-18Z`,'#8e76a0','#715a86',1.2)+path(`M${x} ${y-3}v6`,'none','#ceb5db',1);
  else if(bird)anatomyFront+=path(`M${x} ${y-5}v6m0-2-9 5m9-5 9 5m-9-5v7`,'none','#d69a4a',3);
  else if(species==='dragon'||species==='dino'||species==='monster')anatomyFront+=[-6,0,6].map(dx=>path(`M${x+dx-2} ${y}l2 7 3-7Z`,'#fff0cc',edge,.7)).join('');
  else if(species!=='robot'&&species!=='slime'&&species!=='frog')anatomyFront+=path(`m${x-6} ${y-3}v4m6-4v4m6-4v4`,'none',tint(c,-.36),1.2);
 }
 if(species==='slime'){
  const spread=[28,38,27,32,44,32,54,29,48,40][stage-1],bottom=[174,176,182,178,183,184,179,173,184,184][stage-1];
  body=path(`M${bx-spread} ${by+22}q-7-24 ${spread-12}-35l12-15 13 15q${spread} 12 ${spread} 37l8 13q-${spread+5} 16-${spread*2+10} 0Z`,skin,'#68b4a8',1.8)+ell(bx+spread*.5,by+5,5,9,'#d9fff8')+path(`M${bx-spread+8} ${by+13}q-2-18 10-21`,'none','#e4fffb',4)+ell(bx,bottom-8,spread-4,6,'#83c8bd');
 }else if(species==='panda')anatomyFront+=path(`M${bx-21} ${by+22}q21 8 42 0v8q-21 8-42 0Z`,'#3d4f60');
 else if(species==='tiger')anatomyFront+=path(`m${bx-26} ${by+17} 12 3-10 4m48-7-12 3 10 4`,'none','#845535',3);
 else if(species==='owl'&&stage<5)anatomyFront+=[-12,0,12].map(dx=>path(`m${bx+dx-4} ${by+28} 4 5 4-5`,'none','#987851',2)).join('');
 else if(species==='dragon'||species==='dino')anatomyFront+=path(`M${bx-13} ${by+22}q13 5 26 0m-24 5q11 4 22 0`,'none',tint(c,-.24),1.4);
 anatomyBack=`<g class="species-anatomy-back" data-species="${species}">${anatomyBack}</g>`;
 anatomyFront=`<g class="species-anatomy-front">${anatomyFront}</g>`;
 let hat='';
 if(look.accessory==='bow')hat='<path d="M60 29 55 12l15 5 16-6-1 20-16-8Z" fill="#e36e99" stroke="#fff1ce" stroke-width="2"/><circle cx="69" cy="21" r="5" fill="#ffd5e4"/>';
 if(look.accessory==='visor')hat='<path d="M26 44h48l-4 14H30Z" fill="#28547f" stroke="#a2f0f0" stroke-width="2"/><path d="m32 46 7 10m5-10 7 10" stroke="#92e5ef" stroke-width="3"/>';
 if(look.accessory==='wizard')hat='<path d="M27 30 48-12 70 30Z" fill="#6660ba" stroke="#d8caef" stroke-width="2"/><ellipse cx="50" cy="31" rx="33" ry="7" fill="#8177ca"/>'+star(48,18,7,'#ffe2a0');
 if(look.accessory==='flower')hat='<g fill="#fff3a9" stroke="#eca877" stroke-width="1"><circle cx="70" cy="19" r="7"/><circle cx="80" cy="25" r="7"/><circle cx="76" cy="35" r="7"/><circle cx="64" cy="34" r="7"/><circle cx="60" cy="24" r="7"/></g><circle cx="70" cy="27" r="7" fill="#f7bb68"/>';
 const head=`<g class="evo-head" transform="translate(${hx} ${hy}) rotate(${tilt}) scale(${hs}) translate(-50 -55)">${ears}${face}${detail}${eyes}${blush}${muzzle}${hat}</g>`;
 // Tall ears stay outside the helmet; a unicorn's crown frames its horn.
 if(stage===6&&['rabbit','cat','fox','wolf','unicorn'].includes(species)){
  // The helmet is the only stage-six foreground element before cosmetics.
  front=`<g transform="translate(100 0) scale(.68 1) translate(-100 0)">${front}</g>`;
 }
 if(species==='rabbit'&&stage>=9)front=front.replace(/^<path[^>]+\/>/,crown=>`<g transform="translate(100 0) scale(.55 1) translate(-100 0)">${crown}</g>`);
 if(species==='unicorn'&&stage>=6)anatomyFront+=`<g transform="translate(${hx} ${hy}) rotate(${tilt}) scale(${hs}) translate(-50 -55)">${path('M41 31 51 1l10 30Z','#f1d799','#c9aa65',1.5)}${path('m47 12 9 4m-12 3 14 5','none','#c6a252',1.3)}</g>`;
 if(species==='unicorn'&&stage===9)front=front.replace('m77 32-4-21 17 9L100 3l10 17 17-9-4 21Z','m77 32-4-21 17 9 3-7 7 8 7-8 3 7 17-9-4 21Z');
 if(species==='unicorn'&&stage===10)front=front.replace('m81 40-9-22 19 9 9-22 9 22 19-9-9 22Z','m81 40-9-22 19 9 4-9 5 9 5-9 4 9 19-9-9 22Z');
 // A visible outfit remains available even on the baby or beast silhouettes.
 if(look.outfit)front+=`<path d="M${hx-21*hs} ${hy+29*hs}q${21*hs} ${12*hs} ${42*hs} 0l-${5*hs} ${10*hs}q-${16*hs} ${8*hs}-${32*hs} 0Z" fill="${paint('metal')}" stroke="#fff5d4" stroke-width="2"/>${star(hx,hy+39*hs,5,'#fff6cc')}`;
 let effects='';
 if(look.effect==='hearts')effects=[[27,69],[165,152],[163,27]].map(([x,y])=>`<path d="M${x} ${y}q-16-11-8-18 8-4 8 3 2-7 9-3 8 7-9 18" fill="#ed9cc3" stroke="#fff" stroke-width="1.5"/>`).join('');
 if(look.effect==='lightning')effects='<path d="m27 76 15-34-2 24 13-2-27 41 7-28Zm128 69 15-34-2 24 13-2-27 41 7-28Z" fill="#ffe293" stroke="#d1a354" stroke-width="1.5"/>';
 if(look.effect==='stardust')effects=Array.from({length:10},(_,i)=>`<g class="evo-spark" style="--spark-delay:${i*.2}s">${star(20+(i*43)%164,22+(i*57)%150,4,i%2?'#fae3ac':'#d3b7fb')}</g>`).join('');
 if(stage>=8)effects+=Array.from({length:stage-3},(_,i)=>`<g class="evo-spark" style="--spark-delay:${i*.3}s">${star(23+(i*57)%156,23+(i*33)%151,stage===10?5:3)}</g>`).join('');
 return `<svg class="evo-character" data-evo-stage="${stage}" data-body-form="${stage}" data-species="${a.id}" viewBox="0 0 200 200" role="img" aria-label="${a.name} · 진화 ${stage}단계 ${form.name}" xmlns="http://www.w3.org/2000/svg">${defs}${background}<ellipse cx="100" cy="183" rx="42" ry="6" fill="${accent}" opacity=".15"/>${back}${anatomyBack}<g class="evo-body">${body}</g>${head}${front}${anatomyFront}${effects}</svg>`;
}

const COSMETIC_SLOTS={outfit:'의상',background:'배경',accessory:'머리 장식',effect:'빛 효과'};
const COSMETIC_ITEMS=[
 ['rose','outfit','벚꽃 망토',20],['ocean','outfit','바다 기사',30],['forest','outfit','숲의 탐험가',40],['royal','outfit','보라빛 왕실',70],
 ['garden','background','꽃 피는 정원',20],['sunset','background','노을 산책',40],['moon','background','달빛 여행',60],['galaxy','background','은하 여행',120],
 ['bow','accessory','딸기 리본',20],['flower','accessory','햇살 꽃',30],['visor','accessory','우주 고글',50],['wizard','accessory','마법사 모자',80],
 ['hearts','effect','두근두근 하트',40],['lightning','effect','번개 에너지',60],['stardust','effect','반짝이는 별가루',90]
].map(([id,slot,name,price])=>({id,slot,name,price}));
function customization(c){
 if(c.customization?.version!==1)c.customization={version:1,balance:60,earned:0,owned:[],equipped:{}};
 const g=c.customization;
 g.balance=Math.max(0,Math.floor(Number(g.balance)||0));g.earned=Math.max(0,Math.floor(Number(g.earned)||0));
 g.owned=[...new Set((Array.isArray(g.owned)?g.owned:[]).filter(id=>COSMETIC_ITEMS.some(x=>x.id===id)))];
 const equipped=g.equipped&&typeof g.equipped==='object'?g.equipped:{};
 g.equipped=Object.fromEntries(Object.keys(COSMETIC_SLOTS).filter(slot=>COSMETIC_ITEMS.some(x=>x.id===equipped[slot]&&x.slot===slot&&g.owned.includes(x.id))).map(slot=>[slot,equipped[slot]]));
 return g;
}
let cosmeticTab='outfit',cosmeticPreview=null,cosmeticPreviewProfile=null;
function previewCosmetic(id){
 const item=COSMETIC_ITEMS.find(x=>x.id===id);if(!item||!authUser)return;
 cosmeticTab=item.slot;cosmeticPreview=id;cosmeticPreviewProfile=state.selected;renderCustomization();
}
function applyCosmetic(id){
 if(!authUser)return false;
 const item=COSMETIC_ITEMS.find(x=>x.id===id);if(!item)return false;
 const g=customization(child()),owned=g.owned.includes(id);
 if(!owned&&g.balance<item.price){if($('cosmeticStatus'))$('cosmeticStatus').textContent='별조각이 '+(item.price-g.balance)+'개 더 필요해요.';return false}
 if(!owned){g.balance-=item.price;g.owned.push(id)}
 g.equipped[item.slot]=id;cosmeticPreview=null;storeLearnerCheckpoint(state.selected);localSave();cloudSave();renderExploration();
 if($('cosmeticStatus'))$('cosmeticStatus').textContent=item.name+(owned?' 착용했어요.':' 구매하고 착용했어요.');return true;
}
function resetCosmetic(slot){
 if(!authUser||!Object.hasOwn(COSMETIC_SLOTS,slot))return;
 delete customization(child()).equipped[slot];cosmeticPreview=null;storeLearnerCheckpoint(state.selected);localSave();cloudSave();renderExploration();
 if($('cosmeticStatus'))$('cosmeticStatus').textContent=COSMETIC_SLOTS[slot]+'을 기본 모습으로 바꿨어요.';
}
function renderCustomization(){
 const c=child(),g=customization(c),stage=evolutionState(c).equippedStage;
 if(cosmeticPreviewProfile!==state.selected){cosmeticPreview=null;cosmeticPreviewProfile=state.selected}
 const preview=COSMETIC_ITEMS.find(x=>x.id===cosmeticPreview),look={...g.equipped};if(preview)look[preview.slot]=preview.id;
 if($('dressAvatar'))$('dressAvatar').innerHTML=characterSvg(c.characterId,stage,look);
 if($('starBalance'))$('starBalance').textContent=g.balance.toLocaleString();
 if($('homeStars'))$('homeStars').textContent='✦ 별조각 '+g.balance.toLocaleString()+'개 · 나만의 꾸미기';
 if($('dressCaption'))$('dressCaption').textContent=preview?preview.name+' · 미리보기':EVOLUTION_FORMS[stage-1].name+' · 현재 착용 모습';
 if($('cosmeticLoadout'))$('cosmeticLoadout').textContent=Object.values(g.equipped).map(id=>COSMETIC_ITEMS.find(x=>x.id===id)?.name).filter(Boolean).join(' · ')||'기본 꾸미기';
 if($('cosmeticTabs'))$('cosmeticTabs').innerHTML=Object.entries(COSMETIC_SLOTS).map(([slot,name])=>`<button type="button" data-cosmetic-tab="${slot}" aria-pressed="${slot===cosmeticTab}" class="${slot===cosmeticTab?'selected':''}">${name}</button>`).join('');
 if($('cosmeticGrid'))$('cosmeticGrid').innerHTML=COSMETIC_ITEMS.filter(x=>x.slot===cosmeticTab).map(x=>{const owned=g.owned.includes(x.id),equipped=g.equipped[x.slot]===x.id;return `<button type="button" class="cosmetic-item${cosmeticPreview===x.id?' previewing':''}${equipped?' equipped':''}" data-cosmetic-preview="${x.id}" aria-pressed="${cosmeticPreview===x.id}" aria-label="${x.name} 미리보기, ${equipped?'착용 중':owned?'보유 중':x.price+' 별조각'}">${characterSvg(c.characterId,stage,{...g.equipped,[x.slot]:x.id})}<strong>${x.name}</strong><span>${equipped?'✓ 착용 중':owned?'보유 중': '✦ '+x.price+' 별조각'}</span><small>미리보기</small></button>`}).join('');
 if($('cosmeticAction'))$('cosmeticAction').innerHTML=preview?`<button type="button" class="primary wide" data-cosmetic-apply="${preview.id}" ${g.equipped[preview.slot]===preview.id||(!g.owned.includes(preview.id)&&g.balance<preview.price)?'disabled':''}>${g.equipped[preview.slot]===preview.id?'착용 중':g.owned.includes(preview.id)?'이 꾸미기 착용하기':preview.price+' 별조각으로 구매하고 착용'}${!g.owned.includes(preview.id)&&g.balance<preview.price?' · '+(preview.price-g.balance)+'개 부족':''}</button>`:'<p class="muted">아이템을 눌러 내 캐릭터에 미리 입혀 보세요.</p>';
 if($('cosmeticReset'))$('cosmeticReset').innerHTML=`<button type="button" class="ghost" data-cosmetic-reset="${cosmeticTab}" ${g.equipped[cosmeticTab]?'':'disabled'}>${COSMETIC_SLOTS[cosmeticTab]} 기본 모습</button>`;
}

function exploration(c,profile=state.selected){
 if(!CHARACTERS.some(a=>a.id===c.characterId))c.characterId=DEFAULT_CHARACTERS[profile]||'puppy';
 if(c.exploration?.version!==1){
  const words=Object.values(c.words||{});
  c.exploration={version:1,xp:words.reduce((n,w)=>n+Math.max(0,Number(w.seen)||0)*5+Math.max(0,Number(w.independentCorrect)||0)*3,0),days:{}};
 }
 customization(c);
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
 const xp=5+(independent?3:0);day.keys.push({key,passage});game.xp+=xp;const wardrobe=customization(child());wardrobe.balance+=2;wardrobe.earned+=2;
 for(const old of Object.keys(game.days).sort().slice(0,-60))delete game.days[old];
 return xp;
}
function rewardCompletion(){
 if(!authUser||!session||session.account!==authUser.id||session.profile!==state.selected||session.mode==='level'||(session.completionPolicy===DAILY_POLICY?!usageLessonComplete(session.baseWords,session.results):session.results.filter(isVocabularyResult).length<(session.target||20)))return 0;
 const game=exploration(child()),day=game.days[today()]||(game.days[today()]={keys:[],bonus:false});
 if(day.bonus)return 0;day.bonus=true;game.xp+=40;const wardrobe=customization(child());wardrobe.balance+=20;wardrobe.earned+=20;return 40;
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
 if(!canSaveLearning())return [];
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
 const rowSvg=x=>characterSvg(x.characterId,x.virtual?evolutionForRank(x.rank):evolutionState(state.users[x.id]).equippedStage,x.virtual?{}:customization(state.users[x.id]).equipped);
 for(const id of ['ayoung','inseong','guest']){
  const u=state.users[id];exploration(u,id);
  for(const prefix of ['profileAvatar-','reportAvatar-'])if($(prefix+id))$(prefix+id).innerHTML=characterSvg(u.characterId,evolutionState(u).equippedStage,customization(u).equipped);
 }
 if($('explorerAvatar'))$('explorerAvatar').innerHTML=characterSvg(c.characterId,owned.equippedStage,customization(c).equipped);
 if($('explorerName'))$('explorerName').textContent=c.name+' · '+bandLabel(me.difficulty)+' 단계';
 if($('explorerRank'))$('explorerRank').textContent='현재 '+rankCaption(me)+' / '+rows.length+'명';
 if($('rankDifficultyLabel'))$('rankDifficultyLabel').textContent='리그 등급 '+me.difficulty.toFixed(1)+' · 출제 난이도 '+c.difficulty.toFixed(1)+' · 학습용 추정값';
 const nextRank=ahead?1+rows.filter(x=>!x.isMe&&x.difficulty>ahead.difficulty).length:me.rank;
 const target=ahead?'리그 등급 '+ahead.difficulty.toFixed(1)+'에 도달하면 '+(me.rank-nextRank)+'계단 올라갈 수 있어요! '+ahead.name+'에게 도전해요.':'최상위 등급이에요! 새로운 문맥에서도 이해를 이어가요.';
 if($('rankDailyUpdate'))$('rankDailyUpdate').textContent=renderedLeagueDate.replaceAll('-','.')+' · 매일 자정에 새 등급 반영';
 if($('rankTarget'))$('rankTarget').textContent=target;
 if($('characterTitle'))$('characterTitle').textContent=c.name+'의 캐릭터';
 if($('characterGrid'))$('characterGrid').innerHTML=CHARACTERS.map(a=>`<button type="button" class="character-choice${a.id===c.characterId?' selected':''}" data-character="${a.id}" aria-pressed="${a.id===c.characterId}">${characterSvg(a.id,owned.equippedStage,customization(c).equipped)}<strong>${a.name}</strong><small>${a.id===c.characterId?'선택됨':'선택하기'}</small></button>`).join('');
 if($('evolutionSummary'))$('evolutionSummary').textContent='진화 '+owned.equippedStage+'단계 · '+EVOLUTION_FORMS[owned.equippedStage-1].name;
 if($('evolutionGoal'))$('evolutionGoal').textContent=owned.unlockedStage===10?'10단계 보상을 모두 획득했어요!':(100-owned.unlockedStage*10)+'위 안에 들면 다음 진화형을 받아요.';
 if($('evolutionNotice')){$('evolutionNotice').textContent=awardedToday?'✨ 최고 '+owned.bestRank+'위 · 진화 '+owned.unlockedStage+'단계 '+EVOLUTION_FORMS[owned.unlockedStage-1].name+' 획득':'';$('evolutionNotice').classList.toggle('hidden',!awardedToday)}
 if($('evolutionGrid'))$('evolutionGrid').innerHTML=EVOLUTION_FORMS.map(form=>{const unlocked=form.stage<=owned.unlockedStage;return `<button type="button" class="evolution-form${unlocked?' unlocked':' locked'}${form.stage===owned.equippedStage?' equipped':''}" data-evolution="${form.stage}" ${unlocked?'':'disabled'} aria-pressed="${form.stage===owned.equippedStage}">${characterSvg(c.characterId,form.stage,customization(c).equipped)}<span class="evolution-range">${form.minRank}~${form.maxRank}위</span><strong>${form.stage}단계 · ${form.name}</strong><small>${form.feature}</small><b>${form.stage===owned.equippedStage?'사용 중':unlocked?'적용하기':'🔒 순위 보상'}</b></button>`}).join('');
 const card=x=>`<div class="podium-avatar">${rowSvg(x)}</div><span class="podium-place">${x.rank===1?'🥇':x.rank===2?'🥈':'🥉'} ${rankCaption(x)}</span><strong>${escapeHtml(x.name)}</strong><b>${bandLabel(x.difficulty)}</b><small>등급 ${x.difficulty.toFixed(1)}</small><small>진화 ${x.virtual?evolutionForRank(x.rank):evolutionState(state.users[x.id]).equippedStage}단계</small>${x.isMe?'<small>나</small>':x.family?'<small>가족</small>':''}`;
 if($('rankPodium'))$('rankPodium').innerHTML=[rows[1],rows[0],rows[2]].map(x=>`<div class="podium place-${x.rank}">${card(x)}</div>`).join('');
 if($('rankFamilyOverview'))$('rankFamilyOverview').innerHTML=rows.filter(x=>['ayoung','inseong'].includes(x.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(x=>`<div class="rank-family-card${x.isMe?' selected':''}"><div class="rank-avatar">${rowSvg(x)}</div><div><strong>${escapeHtml(x.name)}</strong><b>${rankCaption(x)}</b><small>${bandLabel(x.difficulty)} · 등급 ${x.difficulty.toFixed(1)}</small></div></div>`).join('');
 if($('rankMySummary'))$('rankMySummary').innerHTML=`<div class="rank-avatar">${characterSvg(c.characterId,owned.equippedStage,customization(c).equipped)}</div><div><strong>${escapeHtml(c.name)} · ${rankCaption(me)}</strong><p>${escapeHtml(target)}</p></div><span class="level-badge">${bandLabel(me.difficulty)}<small>등급 ${me.difficulty.toFixed(1)}</small></span>`;
 renderCustomization();
 if($('rankList'))$('rankList').innerHTML=rows.map(x=>`<li class="rank-row${x.family?' rank-family':''}${x.isMe?' rank-me':''}" data-rank-profile="${x.id}"><span class="rank-number">${x.rank}${x.tied?'<small>공동</small>':''}</span><div class="rank-avatar">${rowSvg(x)}</div><div class="rank-name"><strong>${escapeHtml(x.name)}</strong><small class="${x.virtual?'rank-change '+(x.dailyChange>0?'up':x.dailyChange<0?'down':'steady'):''}">${x.virtual?dailyChangeLabel(x.dailyChange):(x.isMe?'나 · ':'가족 · ')+'회차 성과 기반 등급'}</small></div><span class="level-badge">${bandLabel(x.difficulty)}<small>등급 ${x.difficulty.toFixed(1)}</small></span></li>`).join('');
}

const freshChild=name=>({
 name,difficulty:2,confidence:0,learningDays:0,sessions:[],
 words:Object.fromEntries(SEED_WORDS.map(x=>[x.w,freshWord()])),
 lastDate:null,levelTestCompleted:false,recentProblems:[]
});
const initial=()=>({v:5,curriculum:'elementary-to-high-3',selected:'ayoung',catalog:{},users:{ayoung:freshChild('아영'),inseong:freshChild('인성'),guest:freshChild('게스트')},updatedAt:Date.now()});
let state=initial(),authUser=null,deferredPrompt=null,session=null,current=0,selectedOption=null,answerSource='typed',saving=false,reportProfile=null,hintLevel=0,introIndex=0;
let wordbookView='levels',vocabularyFilter={band:0,query:'',status:'all',page:0};
let vocabularyIndex={account:null,rows:[],loaded:false,loading:false,error:'',task:null};
let reportHistoryFilter={from:'',to:'',mode:'study'},reportHistoryPage=0;
let loadedAccount=null,authEpoch=0,authLoadTask=null;
const canSaveLearning=()=>!!authUser&&loadedAccount===authUser.id;

function child(){return state.users[state.selected]}
function wordState(w){
 const c=child(),current=c.words[w];
 if(!current)c.words[w]=freshWord();
 else if(current.__v!==2)c.words[w]={...hydrateWordState(current),__v:2};
 return c.words[w];
}
function localSave(){if(canSaveLearning())localStorage.setItem('vocab-account-'+authUser.id,JSON.stringify({account:authUser.id,state}))}
async function cloudLoad(account=authUser?.id,epoch=authEpoch){
 if(!account)return false;
 const {data,error}=await withDeadline(sb.from('app_state').select('state').eq('user_id',account).maybeSingle(),15000,'기록 불러오기가 지연됐어요.');
 if(account!==authUser?.id||epoch!==authEpoch)return false;
 if(error) throw error;
 state=mergeState(data?.state||initial());
 loadedAccount=account;
 const recovered=mergeLearnerCheckpoints();
 localSave();renderAll();
 if(!data?.state||recovered)await cloudSave();
 return true;
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
 WORDS=WORDS.map(calibratedWord);
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
 if(!canSaveLearning())return;
 cloudSavePending=true;
 if(cloudSaveTask)return cloudSaveTask;
 const account=authUser.id;
 const epoch=authEpoch;
 cloudSaveTask=(async()=>{
  saving=true;
  try{
   do{
    if(!canSaveLearning()||authUser.id!==account||epoch!==authEpoch)break;
    cloudSavePending=false;state.updatedAt=Date.now();localSave();
    const snapshot=JSON.parse(JSON.stringify(state));
    const {error}=await sb.from('app_state').upsert({user_id:account,state:snapshot,updated_at:new Date().toISOString()});
    if(account!==authUser?.id||epoch!==authEpoch)break;
    const conflict=error?.message?.includes('LEARNING_STATE_REGRESSION');
    $('cloudPill').textContent=conflict?'기존 기록 보호됨 · 새로고침 필요':error?'저장 오류':'클라우드 저장됨';$('cloudPill').classList.toggle('on',!error);
    if(conflict){loadedAccount=null;$('authGate').classList.remove('hidden');setMsg('다른 기기의 최신 기록을 보호했어요. 새로고침하여 기록을 다시 불러와 주세요.',true)}
    if(error&&!silent)alert('클라우드 저장에 실패했어요. 인터넷 연결을 확인해 주세요.');
    if(error)break;
   }while(cloudSavePending&&authUser?.id===account&&epoch===authEpoch);
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
 const done=!saved&&child().lastDate===today(),p=preparations.get(preparationKey('daily'));
 $('startDaily').disabled=false;
 const blocked=preparationBlock&&preparationBlock.account===authUser?.id&&preparationBlock.profile===state.selected||p?.jobs?.some(j=>j.error?.code==='ai_credit_exhausted');
 $('startDaily').textContent=saved?(saved.nextIndex>=saved.target?'학습 완료 확인':'이어서 학습 · '+((saved.results||[]).filter(isVocabularyResult).length+1)+'번째 문제'):blocked?'문제 생성 서비스 확인 필요':p&&!p.cancelled&&p.ready.size<p.baseCount?'문제 준비 중 · '+p.ready.size+'/'+p.baseCount+'개':p?.budget?.reviewShortfall?'학습 시작 · '+p.baseCount+'개 (복습 '+p.budget.availableReviews+'개) 준비':done?'계속 학습하기':'오늘의 학습 시작';
}
function storeLearnerCheckpoint(profile){
 if(!canSaveLearning())return;
 const c=state.users[profile];
 c.lessonCheckpointAt=Math.max(Date.now(),(c.lessonCheckpointAt||0)+1);
 try{localStorage.setItem(learnerCheckpointKey(profile),JSON.stringify({account:authUser.id,profile,savedAt:c.lessonCheckpointAt,learner:c,catalog:state.catalog}))}catch{}
}
let renderedAnswerAt=null;
function recordStudyCheckpoint(active=session,completed=false){
 if(!canSaveLearning()||!active||active.account!==authUser.id||!state.users[active.profile])return false;
 return studyHistory.recordStudySession(state.users[active.profile],active,Date.now(),completed);
}
function checkpointSession(){
 const active=session,p=active?.preparation;
 if(!authUser||!p||active.completed||active.account!==authUser.id||active.profile!==state.selected)return false;
 recordStudyCheckpoint(active);
 const nextIndex=active.results.length;
 state.users[active.profile].activeLesson={
  version:1,engine:active.engine||PREPARATION_ENGINE,id:active.lessonId,account:active.account,profile:active.profile,
  mode:active.mode,created:p.created,difficulty:active.difficulty,ability:active.ability,
  target:active.target,max:active.max,baseCount:p.baseCount,completionPolicy:active.completionPolicy,newWords:active.newWords,baseWords:active.baseWords,
  plans:p.plans,ready:[...p.ready],practicePool:p.practicePool||[],deliveryPolicy:p.deliveryPolicy||null,results:active.results,nextIndex,
  model:active.model,introAt:active.introAt,introWords:active.introWords,introCursor:active.introCursor,introDone:active.introDone,activeMs:activeTime(active),
  studyStartedAt:active.studyStartedAt,studyFallbackDay:active.studyFallbackDay,studyDays:active.studyDays,
  reviewPolicy:active.reviewPolicy||null,deferredReview:active.deferredReview||null,
  hintLevel:current===nextIndex?hintLevel:0,
  pendingAnswer:current===nextIndex&&active.queue[current]?.open&&renderedAnswerAt?.id===active.lessonId&&renderedAnswerAt.index===current&&renderedAnswerAt.word===active.queue[current]?.w.w?String($('answer').value||''):current===nextIndex&&active.restoredDraft?.index===nextIndex?active.restoredDraft.value:''
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
  if(saved?.account!==authUser?.id||saved.profile!==profile||!saved.learner||!preservesLearning(c,saved.learner)||!(saved.savedAt>(c.lessonCheckpointAt||0)||hasMoreLearning(c,saved.learner)))continue;
  const reconciled=reconcileLevelBackfill(c,saved.learner);
  if(c.studyHistory||saved.learner.studyHistory)reconciled.studyHistory=studyHistory.mergeStudyHistories(c.studyHistory,saved.learner.studyHistory);
  state.users[profile]=reconciled;
  state.catalog={...state.catalog,...(saved.catalog||{})};changed=true;
 }
 if(changed)state=mergeState(state);
 return changed;
}
function preservesLearning(previous,next){
 if((next.learningDays||0)<(previous.learningDays||0)||(next.sessions||[]).length<(previous.sessions||[]).length||previous.levelTestCompleted&&!next.levelTestCompleted)return false;
 return Object.entries(previous.words||{}).every(([w,stats])=>(next.words?.[w]?.seen||0)>=(stats.seen||0));
}
function hasMoreLearning(previous,next){
 return (next.learningDays||0)>(previous.learningDays||0)||(next.sessions||[]).length>(previous.sessions||[]).length||Object.entries(next.words||{}).some(([w,s])=>(s.seen||0)>(previous.words?.[w]?.seen||0));
}
async function resumeLesson(saved){
 const profile=state.selected,account=authUser?.id;
 if(saved.version!==1||![PREPARATION_ENGINE,'10.8.0'].includes(saved.engine)||saved.profile!==profile||saved.account!==account||
  !Array.isArray(saved.plans)||!saved.plans.length||
  !Array.isArray(saved.results)||!Number.isInteger(saved.target)||saved.target<1||saved.target>saved.plans.length||
  saved.results.length>saved.target||saved.nextIndex!==saved.results.length||!Array.isArray(saved.ready))throw new Error('저장된 학습 정보를 확인하지 못했어요. 기록은 보관되어 있습니다.');
 let migrated=false;
 let ready=new Map(saved.ready);
 for(const [index,q] of ready)if(!Number.isInteger(index)||index<0||index>=saved.plans.length||!validPreparedQuestion(q,saved.plans[index]))throw new Error('저장된 문제의 검수 정보를 확인하지 못했어요.');
 for(let i=0;i<saved.results.length;i++)if(!ready.has(i))throw new Error('채점된 문제의 저장 정보를 확인하지 못했어요.');
 for(const plan of saved.plans)if(plan.w?.source==='fixed')FIXED_CACHE.set(plan.w.w,plan.w);
 rebuildCatalog();
let needsRecovery=saved.mode==='daily'&&Array.from({length:saved.baseCount||saved.plans.length},(_,i)=>i).some(i=>!ready.has(i));
 let remote=null;
 if(needsRecovery){
  remote=await serverLesson(profile);
  if(remote?.payload?.resumeId!==saved.id)throw new Error('남은 문제를 서버에서 준비 중이에요. 채점 기록은 유지됩니다. 잠시 뒤 다시 눌러 주세요.');
 }
 if(needsRecovery&&remote?.payload?.ready){
  for(const [i,q] of remote.payload.ready)if(!ready.has(i)&&validPreparedQuestion(q,saved.plans[i]))ready.set(i,q);
  saved={...saved,ready:[...ready]};
 }
 const policySaved=applyPendingReviewPolicy(saved,child());migrated=policySaved!==saved;saved=policySaved;
 ready=new Map(saved.ready);
 needsRecovery=saved.mode==='daily'&&Array.from({length:saved.baseCount||saved.plans.length},(_,i)=>i).some(i=>!ready.has(i));
 let p;
 if(!migrated&&!needsRecovery&&session?.lessonId===saved.id&&session.account===account&&session.profile===profile&&!session.preparation.cancelled)p=session.preparation;
 else{
  if(session?.preparation)session.preparation.cancel();
  const meta={engine:saved.engine,model:saved.model,key:preparationKey(saved.mode,profile,account),account,profile,mode:saved.mode,snapshot:preparationSnapshot(profile),created:saved.created,difficulty:saved.difficulty,newWords:saved.newWords,baseWords:saved.baseWords,plans:saved.plans,baseCount:saved.baseCount||saved.plans.length,completionPolicy:saved.completionPolicy,practicePool:saved.practicePool||remote?.payload?.practicePool||[],deliveryPolicy:saved.deliveryPolicy||(saved.mode==='daily'?DELIVERY_POLICY:null),adopted:true};
  p=needsRecovery?createServerPreparation({...meta,serverId:remote.id},remote.payload.ready||saved.ready):createPreparation(meta,saved.ready);
 }
 // The lesson was consumed on its first start. Resuming must never consume it
 // again or ask the server for a replacement lesson.
 const eligibleIntro=(saved.introWords||[]).filter(w=>isLearningTarget(w));
 const eligibleCursor=(saved.introWords||[]).slice(0,saved.introCursor||0).filter(w=>isLearningTarget(w)).length;
 session={reviewPolicy:saved.reviewPolicy,deferredReview:saved.deferredReview,engine:saved.engine,model:saved.model,introAt:saved.introAt||0,introWords:eligibleIntro,introCursor:eligibleCursor,introDone:saved.introDone!==false||eligibleCursor>=eligibleIntro.length,activeMs:saved.activeMs||0,clockStarted:null,mode:saved.mode,queue:p.queue,preparation:p,results:saved.results.slice(),target:saved.target,max:saved.mode==='level'?(saved.max||30):null,completionPolicy:saved.mode==='level'?null:(saved.completionPolicy||null),difficulty:saved.difficulty,ability:saved.ability,intros:[],newWords:saved.newWords,baseWords:saved.baseWords,validated:true,loadingQuestions:null,profile,account,lessonId:saved.id};
 Object.defineProperty(session,'pendingPlans',{get:()=>p.plans.slice(p.queue.length)});
 session.restoredDraft={index:saved.nextIndex,value:String(saved.pendingAnswer||'')};
 session.studyStartedAt=saved.studyStartedAt||Number(state.users[profile].lessonCheckpointAt)||Date.now();
 session.studyFallbackDay=saved.studyFallbackDay||learningDay(new Date(session.studyStartedAt));session.studyDays=saved.studyDays||{};
 if(migrated)state.users[profile].activeLesson=saved;
 current=saved.nextIndex;introIndex=0;hintLevel=0;$('next').disabled=false;
 if(current>=session.target){ensureUsageContinuation(session);if(current>=session.target){finishSession();return}}
 prepareExtensions(session);
 await withDeadline(needsRecovery?Promise.all(Array.from({length:p.baseCount},(_,i)=>p.waitFor(i,true))):p.waitFor(current,true),QUESTION_WAIT_MS,'이어서 풀 문제를 서버에서 준비 중이에요. 채점 기록은 유지됩니다. 잠시 뒤 다시 눌러 주세요.');
 if(state.selected!==profile||authUser?.id!==account||session.preparation!==p)return;
 if(needsRecovery){
  const recovered={...saved,ready:[...p.ready]},policyRecovered=applyPendingReviewPolicy(recovered,child());
  if(policyRecovered!==recovered){
   // Recovery may finish after the first migration check. Apply the policy to
   // the complete checkpoint before showing a question or allowing completion.
   p.cancel();session=null;state.users[profile].activeLesson=policyRecovered;
   return resumeLesson(policyRecovered);
  }
 }
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
 return WORDS.filter(w=>isLearningTarget(w.w,w.cat,w.band)&&inTargetBand(w,child().difficulty)&&!(child().words[w.w]?.seen)&&!child().words[w.w]?.introducedAt)
   .map(w=>({w,score:Math.abs((w.band||3)-target)*5+(w.source==='fixed'?-3:2)+Math.random()*4}))
   .sort((a,b)=>a.score-b.score).slice(0,n).map(x=>x.w);
}
function chooseReview(n=10,includeNotDue=false){return selectLevelReviews(WORDS,child(),n,today(),{includeNotDue})}

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
const QUIZ_TYPES=['mc_usage','mc_reading','subjective_recall','subjective_use'];
const TYPE_SEQUENCE=[
 'mc_context','mc_usage','mc_context','mc_usage','mc_context',
 'subjective_recall','mc_usage','subjective_use','subjective_recall','mc_context',
 'subjective_use','mc_usage','subjective_recall','subjective_use','mc_context',
 'subjective_recall','mc_usage','subjective_use','subjective_recall','subjective_use',
 'mc_context','subjective_recall','mc_usage','subjective_use','mc_context',
 'subjective_recall','mc_usage','subjective_use','mc_context','subjective_recall'
];
const TYPE_LABELS=LEARNING_LABELS;
const apiDomain=cat=>({'사고':'국어','수학':'수학·논리','논리':'국어'}[cat]||(['국어','사회','과학','수학·논리','감정·관계','생활'].includes(cat)?cat:'국어'));

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
let preparationBlock=null;
const creditMessage='문제 생성·문장 채점 서비스의 API 잔액이 소진됐어요. 관리자 충전 후 다시 시도해 주세요. 학습 기록은 유지됩니다.';
function serverPreparationError(remote){return remote?.payload?.preparationBlocked==='ai_credit_exhausted'||/credit_balance_exhausted|insufficient_quota/.test(remote?.payload?.preparationError||'')?Object.assign(new Error(creditMessage),{code:'ai_credit_exhausted'}):null}
let preparingSession=false;
const QUESTION_WAIT_MS=15000;
function withDeadline(task,milliseconds,message){
 let timer;
 return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(message instanceof Error?message:new Error(message)),milliseconds)})]).finally(()=>clearTimeout(timer));
}
async function fetchValidatedQuestions(plans,extraRecent=[],preparedQuestions=[],profile=state.selected){
 const {data}=await withDeadline(sb.auth.getSession(),10000,'로그인 상태 확인이 지연됐어요. 다시 눌러 주세요.'); const token=data.session?.access_token;
 if(!token)throw new Error('로그인이 필요합니다.');
 const body={
   items:plans.map(p=>{
     const st=state.users[profile].words[p.w.w]||{},queued=[...(session?.profile===profile?session.queue:[]),...preparedQuestions].filter(q=>q.w.w===p.w.w).map(questionMemory);
     return ({
     id:p.id,type:p.type,word:p.w.w,definition:p.w.d,band:p.w.band||3,readerLevel:Number(state.users[profile].difficulty)||2,domain:apiDomain(p.w.cat),
     example:p.w.example||'',contextSeed:p.contextSeed||'',answerSlot:p.answerSlot,supportLevel:p.supportLevel,
     successStreak:p.successStreak,firstLearning:p.firstLearning,review:!!p.review,needsCard:!!p.needsCard,allowBankTypeFallback:p.allowBankTypeFallback===true,structureNote:p.structureNote||'',stage:p.stage||'',taskDemand:p.taskDemand||'standard',
     previousContexts:[...(st.problemHistory||[]),...queued].slice(-4),
     usedQuestionSignatures:[...new Set([...(st.problemHistory||[]),...queued].map(h=>h.signature).filter(Boolean))],
     usedPassageKeys:[...new Set([...(st.usedPassageKeys||[]),...queued.flatMap(q=>passageKeys(q.context,q.options))])]
   })}),
   recent:[...(state.users[profile].recentProblems||[]),...(extraRecent||[])].slice(-40)
 };
 const r=await fetch('/api/questions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
 if(!r.ok){
   const j=await r.json().catch(()=>({}));
   if(j.code==='ai_credit_exhausted')throw Object.assign(new Error(creditMessage),{code:j.code});
   throw new Error([502,503,504].includes(r.status)?'문제를 준비하는 서버 응답이 늦어졌어요. 잠시 뒤 다시 눌러 주세요.':(j.error||'문제 검증에 실패했습니다.'));
 }
 const j=await r.json();
 if(!j.validated||!Array.isArray(j.questions)||j.questions.length!==plans.length)throw new Error('검증된 문제 수가 맞지 않습니다.');
 const planMap=new Map(plans.map(p=>[p.id,p]));
 const questions=j.questions.map(q=>{
   const p=planMap.get(String(q.id)); if(!p)throw new Error('문제 연결 오류');
   return {
     w:q.authored&&q.targetMeaning?{...p.w,d:q.targetMeaning}:p.w,type:q.type,stage:p.stage,taskDemand:p.taskDemand,needsCard:p.needsCard,practiceOnly:!!p.practiceOnly,review:!!p.review,remedial:!!p.remedial,learningCard:q.learningCard,answerForm:q.answerForm||p.w.w,label:TYPE_LABELS[q.type]||'문맥',q:q.prompt,ctx:q.context||'',
     showTarget:!!q.showTarget,open:q.type.startsWith('subjective_'),hideWord:!q.showTarget,
     opts:(q.options||[]).map(o=>({t:o.text,ok:!!o.correct,reason:o.reason||''})),
     acceptedAnswers:q.acceptedAnswers||[],hints:q.hints||[],feedbackCorrect:q.feedbackCorrect||'',
     signature:q.signature||'',validation:q.validation||null,authored:q.authored||null,bankFallbackFrom:q.bankFallbackFrom||null,semanticGraderRequired:!!q.semanticGraderRequired,allowNaturalDerivations:q.allowNaturalDerivations||[]
   };
 });
 if(j.deliveryPolicy===DELIVERY_POLICY){questions.practicePool=j.practicePool||[];questions.deliveryPolicy=DELIVERY_POLICY}
 return questions;
}
const PREPARATION_ENGINE=LEARNING_MODEL;
const PREPARATION_CONCURRENCY=4;
const PREPARATION_TTL=36*60*60*1000;
const preparations=new Map(),preparationLoads=new Map();
const SCENARIOS=['집에서 가족과 계획을 세우는 일','학교에서 친구들과 함께 해결하는 일','동네에서 이웃을 돕는 일','숲에서 동식물을 살피는 일','가게에서 물건을 고르는 일','도서관에서 정보를 찾는 일','여행에서 새로운 곳을 알아보는 일','운동이나 놀이를 하는 일','과학 활동에서 작은 실험을 하는 일','비나 바람 때문에 계획을 바꾸는 일','공원이나 거리의 불편을 개선하는 일','친구와 의견이 달라 대화하는 일'];
function preparationSnapshot(profile){
 const c=state.users[profile];
 const words=Object.entries(c.words||{}).filter(([,s])=>s.seen>0||s.introducedAt).sort(([a],[b])=>a.localeCompare(b)).map(([w,s])=>[w,s.seen,s.correct,s.wrong,s.streak,s.supportLevel,s.nextReviewAt,s.lastFeedbackDate,(s.usedPassageKeys||[]).length,s.introducedAt||null]);
 return JSON.stringify([c.difficulty,c.levelTestCompleted,words,c.lastDate||null,AUTHORED_REVISION+':'+REVIEW_POLICY]);
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
function validPreparedQuestion(q,plan){return q?.w?.w===plan?.w?.w&&q.type===plan.type&&(!plan.needsCard||!!q.learningCard?.example)&&(authoredQuestionValid(q,authUser?.id)||sentenceUseQuestionValid(q,plan)||(q.validation?.deterministic===true&&q.validation?.aiVerified===true&&q.validation?.checks?.coherentSituation===true))}
function questionPassageKeys(q){return passageKeys(q.ctx,(q.opts||[]).map(o=>o.t))}
function savePreparation(p){
 if(p.adopted||p.cancelled)return;
 try{localStorage.setItem(p.key,JSON.stringify({reviewPolicy:p.reviewPolicy,budget:p.budget,selectionPolicy:p.selectionPolicy,questionPolicy:p.questionPolicy,engine:p.engine||PREPARATION_ENGINE,model:p.model,target:p.target,introAt:p.introAt,plannedFor:p.plannedFor,budget:p.budget,created:p.created,account:p.account,profile:p.profile,snapshot:p.snapshot,mode:p.mode,difficulty:p.difficulty,newWords:p.newWords,baseWords:p.baseWords,plans:p.plans,baseCount:p.baseCount,completionPolicy:p.completionPolicy,serverId:p.serverId,practicePool:p.practicePool||[],deliveryPolicy:p.deliveryPolicy||null,ready:[...p.ready]}))}catch{}
}
function createPreparation(meta,saved=[]){
 const p={...meta,baseCount:meta.baseCount||meta.plans.length,queue:[],ready:new Map(),jobs:[],waiters:[],running:0,adopted:!!meta.adopted,cancelled:false};
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
     const blocked=p.jobs.some(j=>j.error?.code==='ai_credit_exhausted');
     $('cloudPill').textContent=blocked?'API 잔액 확인 필요':failed?'문제 준비 지연 · 시작 버튼으로 재시도':p.queue.length>=p.baseCount?'학습 준비 완료':p.queue.length?'전체 문제 준비 중':'학습 문제 미리 준비 중';
     renderResumeButton();
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
   if(p.deliveryPolicy===DELIVERY_POLICY){
     let changed=false;
     for(const job of p.jobs){
       for(const index of job.indices){
         if(p.ready.has(index))continue;
         const plan=p.plans[index],q=localPracticeQuestion(plan,state.users[p.profile],p.practicePool||[],[...p.ready.values()],p.account);
         if(!q){job.error=new Error('저장된 문제 구성을 확인하지 못했어요. 학습 기록은 유지됩니다.');continue}
         if(q.type!==plan.type){
           if(plan.allowBankTypeFallback!==true||q.bankFallbackFrom!==plan.type||!validPreparedQuestion(q,{...plan,type:q.type})){
             job.error=new Error('저장된 문제 유형을 확인하지 못했어요.');continue;
           }
           plan.type=q.type;plan.stage=q.stage;
         }
         if(!validPreparedQuestion(q,plan)){job.error=new Error('저장된 문제 검증 정보를 확인하지 못했어요.');continue}
         p.ready.set(index,q);job.error=null;changed=true;
       }
     }
     if(changed||p.waiters.length)p.notify();
     return;
   }
   for(const job of p.jobs){
     if(p.running>=PREPARATION_CONCURRENCY)break;
     const missing=job.indices.filter(i=>!p.ready.has(i));
     if(!missing.length||job.running||job.error)continue;
     job.running=true;p.running++;
     const batch=missing.map(i=>({...p.plans[i]}));
     const known=[...p.ready.values()];
     fetchValidatedQuestions(batch,known.map(q=>q.signature).filter(Boolean),known,p.profile).then(questions=>{
       if(p.cancelled)return;
       if(questions.deliveryPolicy===DELIVERY_POLICY){
         const merged=new Map([...(p.practicePool||[]),...(questions.practicePool||[])].map(q=>[q.w.w+'|'+q.signature,q]));p.practicePool=[...merged.values()];p.bundleReceived=true;
       }
       let duplicate=false;
       questions.forEach((q,n)=>{
         const index=missing[n],plan=p.plans[index];
         if(q.type!==plan.type){
           const allowed=plan.allowBankTypeFallback===true&&q.bankFallbackFrom===plan.type&&
             ['mc_context','mc_usage','subjective_recall','subjective_use'].includes(q.type)&&
             (authoredQuestionValid(q,authUser?.id)||sentenceUseQuestionValid(q,{...plan,type:q.type}))&&validPreparedQuestion(q,{...plan,type:q.type});
           if(!allowed)throw new Error('문제 유형 전환 정보를 확인하지 못했습니다.');
           plan.type=q.type;plan.stage=q.type==='subjective_use'?'use':q.type==='subjective_recall'?'check':'bridge';
           q.stage=plan.stage;
         }
         if(!validPreparedQuestion(q,plan))throw new Error('문제 검증 정보를 확인하지 못했습니다.');
         const previous=new Set([...(state.users[p.profile].words[q.w.w]?.usedPassageKeys||[]),...(state.users[p.profile].words[q.w.w]?.problemHistory||[]).flatMap(h=>passageKeys(h.context,h.options||[])),...[...p.ready.values()].filter(prev=>prev.w.w===q.w.w).flatMap(questionPassageKeys)]);
         if(questionPassageKeys(q).some(key=>previous.has(key))){duplicate=true;return}
         p.ready.set(index,q);
       });
       if(duplicate){
         if(job.duplicateRetries++<1){
           for(const index of job.indices.filter(i=>!p.ready.has(i)))p.plans[index].contextSeed=SCENARIOS[(SCENARIOS.indexOf(p.plans[index].contextSeed)+5)%SCENARIOS.length];
         }else job.error=new Error('이전 문장과 겹쳐 새 문제를 다시 준비해야 합니다.');
       }
     }).catch(error=>{job.error=error}).finally(()=>{job.running=false;p.running--;if(p.bundleReceived&&p.ready.size>=p.baseCount)p.deliveryPolicy=DELIVERY_POLICY;p.notify();p.pump()});
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
async function serverLesson(profile,activeId=null,retry=false){
 if(!['ayoung','inseong','guest'].includes(profile))return null;
 const name=activeId?'get_prepared_lesson':'ensure_prepared_lesson',args=activeId?{p_profile:profile,p_active_id:activeId}:{p_profile:profile,p_snapshot:preparationSnapshot(profile),p_retry:retry};
 const {data,error}=await withDeadline(sb.rpc(name,args),10000,'저장된 문제를 불러오는 응답이 늦어졌어요. 다시 눌러 주세요.');
 if(error)throw new Error('저장된 학습 문제를 확인하지 못했어요. 다시 눌러 주세요.');
 return data;
}
function createServerPreparation(meta,saved){
 const p=createPreparation(meta,saved),ordinaryPump=p.pump;
 let polling=false,timer=null;
 p.pump=()=>{
  if(p.cancelled||authUser?.id!==p.account||state.selected!==p.profile||polling)return;
  if(p.ready.size>=p.plans.length){if(p.plans.length>p.baseCount)ordinaryPump();return}
  // Adaptive additions come from the downloaded practice bundle.
  if(p.ready.size>=p.baseCount){ordinaryPump();return}
  polling=true;
  serverLesson(p.profile,p.serverId).then(remote=>{
   if(p.cancelled)return;
   if(remote?.id!==p.serverId)throw new Error('학습 기록이 바뀌어 준비된 문제를 다시 확인해야 해요.');
   const blocked=serverPreparationError(remote);if(blocked)throw blocked;
     if(remote?.payload?.budget?.waitingForReviews)throw Object.assign(new Error('현재 수준에 맞는 복습 후보가 아직 없어요. 학습 기록은 보관되어 있습니다.'),{noReviewCandidates:true});
   if(remote.status==='failed'){
    throw new Error('문제 준비가 지연됐어요. 잠시 뒤 다시 눌러 주세요.');
   }
   for(const [i,q] of remote.payload?.ready||[]){
    if(!validPreparedQuestion(q,p.plans[i]))throw new Error('문제 검증 정보를 확인하지 못했습니다.');
    p.ready.set(i,q);
   }
   if(remote.payload?.deliveryPolicy===DELIVERY_POLICY){p.deliveryPolicy=DELIVERY_POLICY;p.practicePool=remote.payload.practicePool||[]}
   for(const job of p.jobs)job.error=null;
  }).catch(error=>{for(const job of p.jobs)job.error=error}).finally(()=>{
   polling=false;p.notify();
   if(!p.cancelled&&p.ready.size<p.baseCount&&!p.jobs.some(j=>j.error))timer=setTimeout(()=>p.pump(),2000);
  });
 };
 const cancel=p.cancel;p.cancel=()=>{clearTimeout(timer);cancel()};
 return p;
}
async function getPreparation(mode='daily',retry=false){
 const profile=state.selected,account=authUser?.id,key=preparationKey(mode,profile,account);
 if(!account)throw new Error('로그인이 필요합니다.');
 const snapshot=preparationSnapshot(profile),existing=preparations.get(key);
 if(existing&&!existing.adopted&&!existing.cancelled&&existing.snapshot===snapshot&&existing.plans.every(p=>isLearningTarget(p.w?.w,p.w?.cat,p.w?.band))&&Date.now()-existing.created<PREPARATION_TTL&&(mode!=='daily'||existing.plannedFor===today()&&existing.budget?.policy===DAILY_POLICY)&&!(retry&&existing.jobs.some(j=>j.error))){existing.pump();return existing}
 if(preparationLoads.has(key))return preparationLoads.get(key);
 if(existing)existing.cancel();
 const loading=(async()=>{
   let saved=null;
   try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}
   if(mode==='daily'&&['ayoung','inseong','guest'].includes(profile)){
     if(cloudSaveTask)await withDeadline(cloudSaveTask,10000,'학습 기록 저장이 늦어졌어요. 잠시 뒤 다시 눌러 주세요.');
     let remote=await serverLesson(profile,null,retry),tries=0;
     const blocked=serverPreparationError(remote);if(blocked)throw blocked;
     if(remote?.payload?.budget?.waitingForReviews)throw Object.assign(new Error('현재 수준에 맞는 복습 후보가 아직 없어요. 학습 기록은 보관되어 있습니다.'),{noReviewCandidates:true});
     if(preparationBlock&&preparationBlock.account===account&&preparationBlock.profile===profile)preparationBlock=null;
     while(remote&&['pending','working'].includes(remote.status)&&!remote.payload&&tries++<4){
       $('cloudPill').textContent='맞춤 학습 문제를 서버에서 미리 준비 중';
       await new Promise(resolve=>setTimeout(resolve,2000));
       if(authUser?.id!==account||state.selected!==profile)throw new Error('학습 프로필이 변경되었습니다.');
       remote=await serverLesson(profile);
     }
     if(authUser?.id!==account||state.selected!==profile)throw new Error('학습 프로필이 변경되었습니다.');
     if(remote?.payload?.reviewPolicy===REVIEW_POLICY&&remote?.payload?.snapshot===snapshot&&remote.payload.engine===PREPARATION_ENGINE&&remote.payload.selectionPolicy===SELECTION_POLICY&&remote.payload.questionPolicy===QUESTION_POLICY&&remote.payload.completionPolicy===DAILY_POLICY&&remote.payload.plans?.length>0&&remote.payload.plans.every(p=>isLearningTarget(p.w?.w,p.w?.cat,p.w?.band)&&(p.review||inTargetBand(p.w,child().difficulty)))&&remote.status!=='failed'){
       const data=remote.payload;
       for(const plan of data.plans)if(plan.w?.source==='fixed')FIXED_CACHE.set(plan.w.w,plan.w);
       rebuildCatalog();
       const p=createServerPreparation({...data,key,serverId:remote.id},data.ready||[]);
       preparations.set(key,p);p.pump();return p;
     }
     // Pending, failed or outdated server work must not start duplicate browser generation.
     if(remote)throw Object.assign(new Error(remote.status==='failed'?'문제 검수가 지연됐어요. 시작 버튼을 누르면 준비된 문제를 보관하고 나머지만 재시도해요.':'서버에서 맞춤 문제를 준비 중이에요. 준비 상태를 자동으로 다시 확인해요.'),{preparationPending:remote.status!=='failed'});
     // Missing storage responses must never fall back to live daily generation.
     throw new Error('저장된 맞춤 문제를 확인하지 못했어요. 학습 기록은 유지됩니다. 다시 눌러 주세요.');
   }
   let meta;
   const restored=saved?.reviewPolicy===REVIEW_POLICY&&saved?.questionPolicy===QUESTION_POLICY&&saved?.engine===PREPARATION_ENGINE&&saved.selectionPolicy===SELECTION_POLICY&&saved.account===account&&saved.profile===profile&&saved.snapshot===snapshot&&Date.now()-saved.created<PREPARATION_TTL&&saved.mode===mode&&saved.plans?.length>0&&saved.plans.every(p=>isLearningTarget(p.w?.w,p.w?.cat,p.w?.band)&&(mode==='level'||p.review||inTargetBand(p.w,child().difficulty)));
   if(restored){
     meta={...saved,key};
     for(const plan of saved.plans)if(plan.w?.source==='fixed')FIXED_CACHE.set(plan.w.w,plan.w);
     rebuildCatalog();
   }else{
     await withDeadline(ensureCatalog(state.users[profile].difficulty,mode==='level'?'diagnostic':'daily'),20000,'어휘를 불러오는 응답이 늦어졌어요. 다시 눌러 주세요.');
     if(authUser?.id!==account||state.selected!==profile)throw new Error('학습 프로필이 변경되었습니다.');
     let newWords=[],reviewWords=[];
     if(mode==='level')reviewWords=WORDS.filter(w=>isLearningTarget(w.w,w.cat,w.band)&&!(child().words[w.w]?.seen)&&!child().words[w.w]?.introducedAt).sort(()=>Math.random()-.5).slice(0,30);
     else if(mode==='review')reviewWords=chooseReview(10,true);
     else{const budget=studyBudget(child());newWords=chooseNew(budget.newCount);reviewWords=chooseReview(budget.reviewCount,child().lastDate===today())}
     const baseWords=[...newWords,...reviewWords];
     if(!baseWords.length)throw new Error(mode==='review'?'아직 복습할 기록이 충분하지 않아요. 오늘의 학습을 먼저 진행해 주세요.':'출제할 어휘를 준비하지 못했습니다.');
     meta={reviewPolicy:REVIEW_POLICY,key,account,profile,mode,snapshot:preparationSnapshot(profile),created:Date.now(),difficulty:child().difficulty,newWords:newWords.map(w=>w.w),baseWords,selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,model:LEARNING_MODEL,completionPolicy:mode==='level'?null:DAILY_POLICY,target:mode==='level'?20:baseWords.length,introAt:0,plans:assignScenarios(mode==='level'?buildLearningPlan(newWords,reviewWords,20,mode,w=>wordState(w),{level:child().difficulty,strictBand:false}):buildDailyPlan(newWords,reviewWords,w=>wordState(w),child().difficulty))};
   }
   if(!restored&&mode!=='daily')for(const plan of meta.plans)Object.assign(plan,{allowBankTypeFallback:true,firstLearning:false,review:true});
   if(!restored&&mode==='daily')meta.introAt=meta.plans.filter(p=>p.stage==='check').length;
   const p=createPreparation(meta,restored?saved.ready||[]:[]);
   preparations.set(key,p);p.pump();return p;
 })();
 preparationLoads.set(key,loading);
 try{return await loading}finally{preparationLoads.delete(key)}
}
let preparationRetryTimer=null;
function warmDailyQuestions(){
 if(!authUser||preparingSession||savedLesson()||(session&&current<session.target))return;
 const profile=state.selected,account=authUser.id;
 getPreparation('daily').catch(error=>{
  if(account!==authUser?.id||profile!==state.selected)return;
  if(error.noReviewCandidates){$('cloudPill').textContent='현재 수준의 복습 후보가 아직 없어요';renderResumeButton();return}
  if(error.code==='ai_credit_exhausted'){preparationBlock={account,profile};$('cloudPill').textContent='API 잔액 확인 필요';renderResumeButton();return}
  $('cloudPill').textContent=error.preparationPending?'학습 문제 미리 준비 중':'시작 버튼으로 문제 준비 재시도';
  if(error.preparationPending){clearTimeout(preparationRetryTimer);preparationRetryTimer=setTimeout(()=>{if(account===authUser?.id&&profile===state.selected)warmDailyQuestions()},10000)}
 });
}
function activeTime(active=session){return (active?.activeMs||0)+(active?.clockStarted?Math.max(0,Date.now()-active.clockStarted):0)}
function pauseLearningClock(){if(session&&Number.isFinite(session.clockStarted)){studyHistory.captureStudyClock(session,Date.now());session.clockStarted=null}}
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
 $('introNext').textContent=active.introCursor===list.length-1?'뜻과 쓰임 연습하기':'다음 단어 익히기';
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
     const prepared=await getPreparation(mode,true);
     if(prepared.serverId||mode==='daily'){
       // Start a cloud lesson only when every base question is saved, so moving
       // through the lesson never waits for generation or a background retry.
       await Promise.all(prepared.plans.slice(0,prepared.baseCount).map((_,i)=>prepared.waitFor(i,true)));
     }else await prepared.waitFor(0,true);
     return prepared;
   })(),QUESTION_WAIT_MS,Object.assign(new Error('맞춤 문제를 서버에서 준비 중이에요. 준비가 끝나면 시작 버튼이 바뀌어요.'),{preparationPending:true}));
   if(state.selected!==profile||authUser?.id!==account)return;
   if(p.serverId){
     const {data,error}=await withDeadline(sb.rpc('consume_prepared_lesson',{p_profile:profile,p_id:p.serverId}),10000,'학습 시작 확인이 지연됐어요. 기록은 유지됩니다. 다시 눌러 주세요.');
     if(error||!data){p.cancel();preparations.delete(p.key);localStorage.removeItem(p.key);throw new Error('이 학습은 이미 시작되었거나 기록이 바뀌었어요. 시작 버튼을 다시 눌러 주세요.')}
     if(state.selected!==profile||authUser?.id!==account)return;
   }
   p.adopted=true;preparations.delete(p.key);
   try{localStorage.removeItem(p.key)}catch{}
   session={reviewPolicy:p.reviewPolicy||null,deferredReview:null,engine:p.engine||PREPARATION_ENGINE,model:p.model,introAt:p.introAt||0,introWords:p.model===LEARNING_MODEL?(p.newWords||[]):[],introCursor:0,introDone:!p.newWords?.length||p.model!==LEARNING_MODEL,activeMs:0,clockStarted:null,mode,queue:p.queue,preparation:p,results:[],target:p.plans.length,max:mode==='level'?30:null,completionPolicy:mode==='level'?null:(p.completionPolicy||null),difficulty:p.difficulty,ability:clamp(p.difficulty||3,1,9),intros:[],newWords:p.newWords,baseWords:p.baseWords,validated:true,loadingQuestions:null,profile,account,lessonId:p.serverId||('lesson-'+Date.now()+'-'+Math.random().toString(36).slice(2))};
   Object.defineProperty(session,'pendingPlans',{get:()=>p.plans.slice(p.queue.length)});
   current=0;introIndex=0;hintLevel=0;$('next').disabled=false;
   show('learn');renderQuestion();prefetchQuestions();
 }catch(e){
   if(state.selected===profile&&authUser?.id===account){if(e.code==='ai_credit_exhausted')preparationBlock={account,profile};if(!e.preparationPending)alert('문제 준비를 완료하지 못했어요. 학습 기록은 유지됩니다.\n'+String(e?.message||e));show('home')}
 }finally{
   preparingSession=false;
   $(button).textContent=oldText;
   for(const id of ['startDaily','startReview','levelTest'])$(id).disabled=false;
   renderResumeButton();
   $('cloudPill').textContent=preparationBlock&&preparationBlock.account===account&&preparationBlock.profile===profile?'API 잔액 확인 필요':'클라우드 연결';$('cloudPill').classList.add('on');
 }
}
function renderQuestion(savedHint=0){
 let skipped=0;
 while(current<session.queue.length&&current<session.target){
  const pending=session.queue[current],pinned=session.deferredReview?.preservedCurrent?.index===current&&session.deferredReview.preservedCurrent.word===pending.w.w&&session.results.length===current;
  if(isLearningTarget(pending.w.w,pending.w.cat,pending.w.band)&&pending.validation?.checks?.vocabularyFocus!==false&&(session.mode==='level'||pending.review||inTargetBand(pending.w,session.difficulty||child().difficulty))&&!(session.completionPolicy===DAILY_POLICY&&usageCompleted(session.results).has(pending.w.w)&&!pinned))break;
  // Keep the original cursor and answered records. Excluded questions get a
  // checkpoint entry, never a wrong answer, word statistic or reward.
  if(session.results.length!==current)throw Error('학습 순서를 확인하지 못했어요. 기존 답안은 보관되어 있어요.');
  session.results.push({word:pending.w.w,type:pending.type,result:'제외',credit:null,practiceOnly:true,excludedFromVocabulary:true,exclusionReason:usageCompleted(session.results).has(pending.w.w)?'usage_confirmed':isLearningTarget(pending.w.w,pending.w.cat,pending.w.band)?'out_of_target_band':'excluded_target',stars:0,xp:0});
  current++;skipped++;
 }
 if(skipped){checkpointSession();localSave();cloudSave()}
 if(current>=session.queue.length||current>=session.target){finishSession();return}
 if(session.model===LEARNING_MODEL&&!session.introDone&&current>=session.introAt){show('intro');renderIntro();return}
 const q=presentWrittenQuestion({...session.queue[current],w:calibratedWord(session.queue[current].w)});rememberQuestion(q); selectedOption=null; answerSource='typed';hintLevel=clamp(savedHint,0,(q.hints||[]).length);
 $('learnType').textContent=STAGE_LABELS[q.stage]||(session.mode==='level'?'시작 수준 확인':session.mode==='review'?'집중 복습':'오늘의 학습');
 if($('learningPath'))$('learningPath').textContent=session.completionPolicy===DAILY_POLICY?'문장 사용 확인 '+sessionUsageCount(session)+'/'+session.baseWords.length+'개 · 모두 확인할 때까지 연습':'';
 if($('studyTime'))$('studyTime').textContent=Math.floor(activeTime()/60000)+'분 · 20~25분 목표';
 if($('breakNotice')){$('breakNotice').textContent='25분 동안 학습했어요. 오늘은 여기서 마치거나 잠시 쉬어도 괜찮아요.';$('breakNotice').classList.toggle('hidden',activeTime()<25*60000)}
 if($('finishEarly'))$('finishEarly').classList.toggle('hidden',session.results.length<1);
 $('counter').textContent=(session.results.filter(isVocabularyResult).length+1)+'번째 문제'; $('progressBar').style.width=Math.round((session.completionPolicy===DAILY_POLICY?sessionUsageCount(session)/Math.max(1,session.baseWords.length):current/session.target)*100)+'%';
 $('qTag').textContent=q.label; $('difficulty').textContent='학습 등급 '+child().difficulty.toFixed(1)+' · 어휘 '+vocabularyBand(q.w)+'단계';
 $('qWord').textContent=q.showTarget?q.w.w:'';
 $('qWord').classList.toggle('hidden',!q.showTarget);
 $('qText').textContent=q.q;
 $('qContext').classList.toggle('hidden',!q.ctx); $('qContext').textContent=q.ctx||'';
 $('feedback').className='feedback hidden'; $('hintBox').className='feedback hidden'; $('hintBox').textContent='';
 $('next').classList.add('hidden');
 const draft=state.users[session.profile].activeLesson;
 renderedAnswerAt={id:session.lessonId,index:current,word:q.w.w};
 $('answer').value=q.open&&draft?.id===session.lessonId&&draft.nextIndex===current?String(draft.pendingAnswer||''):'';
 session.restoredDraft=null;
 $('options').innerHTML='';
 $('answer').classList.toggle('hidden',!q.open); $('voiceRow').classList.toggle('hidden',!q.open); $('submit').classList.toggle('hidden',!q.open);
 $('answer').placeholder=q.type==='subjective_use'?'이 단어를 넣어 나만의 문장을 써 보세요.':'설명에 해당하는 단어를 써 보세요.';
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
function isVocabularyResult(r){return !r.excludedFromVocabulary&&(!r.word||isLearningTarget(r.word))}
function applyResult(q,result,feedback,normalized='',meta={}){
 exploration(child());
 rememberQuestion(q);
 const st=wordState(q.w.w),priorExposure=st.lastExposureAt||st.lastFeedbackDate||st.introducedAt;
 let credit=Number.isFinite(meta.credit)?clamp(meta.credit,0,1):resultCredit(result);
 const hintUsed=Boolean(meta.hintUsed);
 const revealed=Boolean(meta.revealed);
 const contextSuccess=meta.contextSuccess??credit>=.5;
 const targetRecall=q.showTarget||q.type==='subjective_use'?false:Boolean(meta.targetRecall);
 const practiceOnly=!!q.practiceOnly||st.introducedAt===today()||st.lastFeedbackDate===today()||session.results.some(r=>r.word===q.w.w);
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
 const rec={word:q.w.w,result,credit,type:q.type,band:q.w.band||3,contextSuccess,targetRecall,independent,practiceOnly,hintUsed,revealed,signature:q.signature||'',remedial:!!q.remedial,answeredAt:Date.now(),studyDate:today()};
 if(session.model===LEARNING_MODEL){const exposureAfter=st.lastFeedbackDate;st.lastExposureAt=priorExposure;const evidence=recordLearningEvidence(child(),st,q,rec);st.lastFeedbackDate=exposureAfter;researchSchedule(st,evidence,rec);rec.evidence=evidence}
 rec.xp=rewardAnswer(q,independent);rec.stars=rec.xp?2:0;
 session.results.push(rec);
 if(session.completionPolicy===DAILY_POLICY){
  const plan=session.baseWords.some(w=>w.w===q.w.w)?nextUsagePlan(session.preparation.plans[current],session.results,session.preparation.plans.length,st):null;
  if(plan){session.preparation.append([plan]);session.target=session.preparation.plans.length;session.preparation.pump()}
 }
 if(q.signature){
   const c=child();c.recentProblems=Array.isArray(c.recentProblems)?c.recentProblems:[];
   const optionKey=q.opts?.length?'|'+q.opts.map(o=>o.t).join('§'):'';c.recentProblems.push(q.signature+optionKey);c.recentProblems=c.recentProblems.slice(-60);
 }
 const recent=session.results.filter(x=>isVocabularyResult(x)&&!x.practiceOnly).slice(-6),bad=recent.filter(x=>x.credit<.75).length;
 if(session.mode==='level'){
   const qualifying=session.results.filter(isVocabularyResult),answered=qualifying.length;
   if(answered%4===0){
     const last=qualifying.slice(-4),g=last.reduce((sum,x)=>sum+x.credit,0);
     if(g>=3)session.ability=clamp(session.ability+.5,1,9); else if(g<=1.5)session.ability=clamp(session.ability-.5,1,9);
   }
   if(answered===20){
     const ratio=qualifying.reduce((sum,x)=>sum+x.credit,0)/20;
     if(ratio>=.35&&ratio<=.85)session.target=Math.min(26,session.max);
   }else if(answered===26&&session.target===26){
     const last6=qualifying.slice(-6).reduce((sum,x)=>sum+x.credit,0);
     if(last6>=2&&last6<=4.5)session.target=Math.min(30,session.max);
   }
 }else if(session.model!==LEARNING_MODEL){
   if(session.target===20&&current>=14&&bad>=3)session.target=Math.min(26,session.max);
   else if(session.target===26&&current>=24&&bad>=3)session.target=Math.min(30,session.max);
 }
 const full=credit>=.99&&!hintUsed,partial=credit>0&&!full;
 $('feedback').className='feedback '+(full?'good':credit<=0?'bad':'');
 const sentenceUse=q.type==='subjective_use',correctOption=q.opts?.find(o=>o.ok);
 const example=sentenceUse?String(meta.exampleAnswer||((credit>=1&&contextSuccess)?normalized||$('answer').value:'')||q.learningCard?.example||q.w.example||'').trim():'';
 const answerLabel=sentenceUse?(example?'자연스러운 표현 예':'목표 어휘의 뜻'):'정답';
 const answerText=sentenceUse?(example||q.w.d):(correctOption?.t||q.answerForm||q.w.w);
 const notes=(rec.stars?'<small class="earned-stars">✦ 별조각 +'+rec.stars+' · 캐릭터 꾸미기에 쓸 수 있어요.</small>':'')+(full&&contextSuccess&&!targetRecall&&!q.showTarget?'<small>문맥에 맞는 답이에요. 목표 단어를 떠올렸는지는 따로 기록해요.</small>':'')+(practiceOnly&&full?'<small>이번 정답은 연습 기록이에요. 숙달은 다른 날 새 문맥에서 다시 확인해요.</small>':'')+(normalized&&normalized!==$('answer').value?'<small>제가 이해한 답: '+escapeHtml(normalized)+'</small>':'');
 $('feedback').innerHTML='<strong class="feedback-result">'+(full?'○ 잘했어요!':partial?'△ 부분 이해':'× 다시 살펴봐요')+'</strong><p class="feedback-word"><strong>'+escapeHtml(q.w.w)+'</strong> · '+escapeHtml(q.w.d)+'</p><section class="feedback-answer"><h3>'+answerLabel+'</h3><p>'+escapeHtml(answerText)+'</p></section><section class="feedback-explanation"><h3>해설</h3><p>'+escapeHtml(feedback||q.feedbackCorrect||q.w.d)+'</p></section>'+(notes?'<div class="feedback-details">'+notes+'</div>':'');
 $('feedback').classList.remove('hidden');$('next').classList.remove('hidden');$('submit').classList.add('hidden');$('hint').classList.add('hidden');
 checkpointSession();localSave();cloudSave();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function showHint(){
 if(!session?.queue?.[current]||!$('next').classList.contains('hidden'))return;
 const q=presentWrittenQuestion(session.queue[current]),hints=q.hints||[];
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
 const active=session,q=presentWrittenQuestion(active.queue[current]);if(active.results.length>current||!$('next').classList.contains('hidden'))return;
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
   if(typed!==expected&&typed!==normalizeTyped(q.answerForm||'')&&listed){applyResult(q,credit===1?'○':'△',q.feedbackCorrect||'문맥에 맞는 표현이에요.',answer,{credit,contextSuccess:credit>=1,targetRecall:listed.targetRecall===true,independent:credit>=1&&!hintUsed,hintUsed,revealed:false});return}
   applyResult(q,'◎',q.feedbackCorrect||'문맥의 단서를 보고 목표 어휘를 직접 떠올렸어요.',answer,{
     credit:1,contextSuccess:true,targetRecall:true,independent:!hintUsed,hintUsed,revealed:false
   });
   return;
 }
 $('submit').disabled=true;$('submit').textContent=q.type==='subjective_use'?'문장 확인 중…':'뜻 확인 중…';
 try{
   const {data}=await sb.auth.getSession();const token=data.session?.access_token;
   if(!token)throw new Error('로그인이 필요합니다.');
   const r=await fetch('/api/grade',{
     method:'POST',
     headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
     body:JSON.stringify({
       taskType:q.type==='subjective_use'?'sentence_use':q.type==='subjective_recall'&&!q.authored?'definition_recall':'context_answer',taskDemand:q.taskDemand||'standard',readerLevel:child().difficulty,
       question:q.q+'\n지문: '+q.ctx,
       targetWord:q.w.w,definition:q.w.d,band:q.w.band||3,
       acceptedAnswers:q.acceptedAnswers||[],allowNaturalDerivations:q.allowNaturalDerivations||[],answer,source:answerSource
     })
   });
   if(!r.ok){const failure=await r.json().catch(()=>({}));throw Object.assign(new Error(failure.error||'채점 서버 오류'),{code:failure.code})}
   const j=await r.json();
   if(session!==active||state.selected!==active.profile)return;
   const credit=Number(j.score)===1?1:Number(j.score)===0.5?.5:0;
   const result=credit===1?'○':credit===.5?'△':'×';
   applyResult(q,result,j.feedback||q.feedbackCorrect||'문맥에 맞는지 확인했어요.',j.normalizedAnswer||answer,{
     credit,contextSuccess:Boolean(j.contextSuccess),targetRecall:q.type==='subjective_use'?false:Boolean(j.targetRecall),
     independent:credit===1&&!hintUsed,hintUsed,revealed:false,exampleAnswer:j.exampleAnswer
   });
 }catch(e){
   if(session===active&&state.selected===active.profile){if(checkpointSession()){localSave();cloudSave()}alert(e.code==='ai_credit_exhausted'?creditMessage+' 입력한 문장은 화면에 남아 있습니다.':'채점을 완료하지 못했어요. 답은 기록하지 않았습니다. 인터넷 연결을 확인한 뒤 다시 채점해 주세요.');}
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
     supportLevel:st.supportLevel||0,successStreak:st.streak||0,firstLearning:false,
     ...(session?.preparation?.deliveryPolicy===DELIVERY_POLICY?{review:true,needsCard:false,allowBankTypeFallback:true,taskDemand:session.preparation.plans.find(p=>p.w.w===w.w)?.taskDemand||'standard'}:{})
   });
 }
 return plans;
}
function sessionUsageCount(active){const done=usageCompleted(active.results);return active.baseWords.filter(w=>done.has(w.w)).length}
function sessionUsageComplete(active){return usageLessonComplete(active.baseWords,active.results)||(active.reviewPolicy===REVIEW_POLICY&&!active.baseWords.length&&active.results.length>=active.target)}
function ensureUsageContinuation(active){
 if(active.completionPolicy!==DAILY_POLICY||sessionUsageComplete(active))return;
 const pending=new Set(active.preparation.plans.slice(active.results.length).map(p=>p.w.w));
 const lastAttempt=w=>active.results.findLastIndex(r=>r.word===w.w);
 // Queue other unfinished targets before retrying the most recently attempted
 // word. With several targets this creates spacing without adding new words.
 const remaining=active.baseWords.slice().sort((a,b)=>lastAttempt(a)-lastAttempt(b));
 for(const w of remaining){
  if(pending.has(w.w)||usageCompleted(active.results).has(w.w)||!isLearningTarget(w.w,w.cat,w.band))continue;
  const original=active.preparation.plans.find(p=>p.w.w===w.w);
  const plan=nextUsagePlan(original,active.results,active.preparation.plans.length,wordState(w.w));
  if(plan)active.preparation.append([plan]);
 }
 active.target=active.preparation.plans.length;
}
function prepareExtensions(active){
 const p=active.preparation;
 ensureUsageContinuation(active);
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
function levelAdjustmentLabel(c){
 const a=c.lastLevelAdjustment;
 if(a?.policy==='parent-difficulty-adjustment-12.16.11')return '보호자 설정 · 출제 난이도 '+a.from.toFixed(1)+' → '+a.to.toFixed(1)+' · '+a.reason;
 if(a?.policy!==SESSION_LEVEL_POLICY)return '';
 const change=a.change>0?'+'+a.change.toFixed(1):a.change<0?a.change.toFixed(1):'유지';
 return '등급 '+a.from.toFixed(1)+' → '+a.to.toFixed(1)+' ('+change+')'+(a.score==null?'':' · 회차 평가 '+a.score+'%')+' · '+a.reason;
}

function finishSession(){
 if(!session||session.completed)return;
 if(session.completionPolicy===DAILY_POLICY&&!sessionUsageComplete(session)){checkpointSession();localSave();cloudSave();show('home');renderResumeButton();return}
 pauseLearningClock();recordStudyCheckpoint(session,true);
 session.completed=true;
 const c=child(),r=session.results.filter(isVocabularyResult),skipped=session.results.length-r.length,total=r.length,good=r.filter(x=>['◎','○'].includes(x.result)).length,ind=r.filter(x=>x.result==='◎').length,wrong=r.filter(x=>x.result==='×').length,score=Math.round(r.reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0)/Math.max(1,total)*100);
 if(session.mode!=='level'){
   if((c.lastStudyDate||c.lastDate)!==today()){c.learningDays++;c.lastStudyDate=today()}
   if(session.mode==='daily'&&session.results.length>=session.target&&session.introDone)c.lastDate=today();
   updateLearningLevels(c,r,today(),{lessonId:session.lessonId});
   c.sessions.unshift({lessonId:session.lessonId,date:today(),mode:session.mode,score,total,good,wrong,skipped,difficulty:c.difficulty,model:session.model,activeMinutes:Math.round(activeTime()/6000)/10,recognition:r.filter(x=>x.type.startsWith('mc_')).length,recall:r.filter(x=>x.evidence?.kind==='recall').length,use:r.filter(x=>x.evidence?.kind==='use').length,levelAdjustment:c.lastLevelAdjustment});
   c.sessions=c.sessions.slice(0,60);
 }else{
   const previousGrade=Number(c.leagueLevel??c.difficulty);
   const weighted=r.reduce((sum,x)=>sum+((x.credit??resultCredit(x.result))*(x.band||3)),0);
   const creditTotal=Math.max(.5,r.reduce((sum,x)=>sum+(x.credit??resultCredit(x.result)),0));
   const evidence=weighted/creditTotal;
   c.difficulty=clamp((session.ability*0.65+evidence*0.35),1,9);
   c.confidence=clamp(total/30,0,1);
   c.levelTestCompleted=true;
   c.leagueLevel=c.difficulty;
   c.lastLevelAdjustment={policy:SESSION_LEVEL_POLICY,lessonId:session.lessonId,date:today(),samples:total,total,score:null,from:previousGrade,to:c.difficulty,change:Math.round((c.difficulty-previousGrade)*10)/10,reason:'시작 수준 확인 결과를 적용했어요.'};
 }
 const completionBonus=rewardCompletion();
 const earnedStars=r.reduce((n,x)=>n+(x.stars||0),0)+(completionBonus?20:0);
 c.activeLesson=null;
 c.preparationRevision=(c.preparationRevision||0)+1;
 storeLearnerCheckpoint(session.profile);localSave();
 cloudSave().then(()=>warmDailyQuestions()); renderAll(); show(state.selected==='guest'?'home':'report');
 alert(session.mode==='level'?'시작 수준 확인 완료 · 출제 난이도 '+c.difficulty.toFixed(1):'문장 사용 확인 완료! '+total+'번의 활동을 기록했어요.'+(skipped?' 전문 지식·설명형 문항 '+skipped+'개는 어휘 평가에서 제외했어요.':'')+(earnedStars?' ✦ 별조각 '+earnedStars+'개 획득! 캐릭터 꾸미기에서 사용해요.':'')+'\n'+levelAdjustmentLabel(c)+' 배운 단어는 다른 날 다시 확인해요.');
}
function renderAll(){
 renderResumeButton();
 const c=child(); document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===state.selected));
 $('ayoungLevel').textContent='현재 단계 '+bandLabel(state.users.ayoung.difficulty)+' · '+state.users.ayoung.difficulty.toFixed(1);
 $('inseongLevel').textContent='현재 단계 '+bandLabel(state.users.inseong.difficulty)+' · '+state.users.inseong.difficulty.toFixed(1);
 $('guestLevel').textContent='현재 단계 '+bandLabel(state.users.guest.difficulty)+' · '+state.users.guest.difficulty.toFixed(1);
 $('hello').textContent=c.name+'의 오늘 탐험'; $('subtitle').textContent=c.name+' · '+bandLabel(c.difficulty)+' 단계';
 $('statScore').textContent=c.sessions[0]?.score??'-'; $('statWords').textContent=Object.entries(c.words).filter(([w,x])=>isLearningTarget(w)&&x.seen>0).length; $('statMaster').textContent=summarizeEvidence(c).mastered; $('statDay').textContent=Math.max(1,c.learningDays);
 renderStudySummary();renderWordbook();renderReport();renderExploration();
}
function renderStudySummary(){
 const c=child(),budget=studyBudget(c),saved=savedLesson(),summary=summarizeEvidence(c);
 if($('dailyTitle'))$('dailyTitle').textContent=budget.newCount?'새 단어 '+budget.newCount+'개 + 복습 최대 '+budget.reviewCount+'개':'오늘은 배운 단어를 단단하게';
 if($('dailyDescription'))$('dailyDescription').textContent='하루 새 단어 5개 + 복습 단어 최대 10개 · 모든 단어로 문장을 만들면 완료';
 if($('dailyBudget'))$('dailyBudget').textContent=(c.lastDate===today()&&!saved?'오늘 기본 학습 완료 · 원하는 만큼 계속 학습할 수 있어요. ':'')+'복습 예정 '+budget.due+'개 · 오늘 남은 새 단어 '+budget.newCount+'개 · 복습 시점이 된 단어부터 확인 · 부족하면 가능한 분량부터 학습';
 if($('learningEvidenceHome'))$('learningEvidenceHome').textContent='장기 확인 '+summary.mastered+'개 · '+(summary.retention7.attempts?'7일 이상 회상 '+summary.retention7.percent+'%':'7일 뒤 기억을 확인할 기록을 모으고 있어요.');
 if(saved?.model===LEARNING_MODEL&&!saved.introDone&&saved.nextIndex>=saved.introAt)$('startDaily').textContent='이어서 새 단어 익히기';
}
function renderWordbook(){
 $('vocabularyOverview')?.classList.toggle('hidden',wordbookView!=='levels');
 $('learnedWordbook')?.classList.toggle('hidden',wordbookView!=='learned');
 document.querySelectorAll('[data-wordbook-view]').forEach(b=>{const selected=b.dataset.wordbookView===wordbookView;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});
 if(wordbookView==='levels')renderVocabularyOverview();
 const c=child(),arr=WORDS.filter(w=>isLearningTarget(w.w,w.cat,w.band)&&(c.words[w.w]?.seen||0)>0).sort((a,b)=>((c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0))||((c.words[b.w]?.seen||0)-(c.words[a.w]?.seen||0)));
 $('wordList').innerHTML=arr.length?arr.map(w=>{const s=hydrateWordState(c.words[w.w]);return '<div class="item row between"><div><strong>'+w.w+'</strong><br><small>'+w.d+'</small><br><small>문맥 이해 '+(s.contextSuccess||0)+' · 목표어 직접 회상 '+(s.targetRecall||0)+' · 오답 '+(s.wrong||0)+'</small><br><small>도움 없이 '+(s.independentCorrect||0)+'회 · 직접 회상 '+(s.independentRecallDays?.length||0)+'일 · 다음 복습 '+(s.nextReviewAt||'미정')+'</small></div><span class="tag">Lv.'+s.level+(masteryConfirmed(s)?' 장기 확인':s.mastered?' 이전 숙달':' 연습 중')+'</span></div>'}).join(''):'<div class="card muted">아직 학습 기록이 없어요.</div>';
}
// Browsing uses a separate, read-only index: it never adds targets or learning evidence.
function normalizeVocabularyIndex(rows){
 const words=new Map();
 for(const row of rows){
  const w=calibratedWord({w:String(row.word||'').trim(),d:String(row.definition||'').trim(),band:Number(row.band),cat:String(row.domain||'')});
  if(row.quality_status==='rejected'||!w.d||!Number.isInteger(w.band)||w.band<1||w.band>9||!isLearningTarget(w.w,w.cat,w.band)||words.has(w.w))continue;
  words.set(w.w,w);
 }
 return [...words.values()].sort((a,b)=>a.band-b.band||a.w.localeCompare(b.w,'ko'));
}
async function loadVocabularyIndex(refresh=false){
 if(!canSaveLearning())return;
 const account=authUser.id;
 if(vocabularyIndex.account!==account)vocabularyIndex={account,rows:[],loaded:false,loading:false,error:'',task:null};
 const index=vocabularyIndex;
 if(index.task)return index.task;
 if(index.loaded&&!refresh)return;
 index.loading=true;index.error='';renderVocabularyOverview();
 const task=Promise.resolve().then(async()=>{
  try{
   const signal=AbortSignal.timeout(15000),pageSize=500;
   const page=(from,to,count)=>sb.from('curriculum_words').select('id,word,definition,band,domain',count?{count:'exact'}:{}).neq('quality_status','rejected').order('id',{ascending:true}).range(from,to).abortSignal(signal);
   const first=await page(0,pageSize-1,true);
   if(first.error)throw first.error;
   if(!Number.isInteger(first.count)||first.count<0)throw new Error('Missing vocabulary count');
   const pages=[];
   for(let from=pageSize;from<first.count;from+=pageSize)pages.push(page(from,Math.min(from+pageSize-1,first.count-1),false));
   const rest=await Promise.all(pages);
   const failed=rest.find(r=>r.error);if(failed)throw failed.error;
   const rows=[...(first.data||[]),...rest.flatMap(r=>r.data||[])];
   if(rows.length!==first.count||new Set(rows.map(r=>r.id)).size!==first.count)throw new Error('Vocabulary list changed during download');
   if(vocabularyIndex!==index||authUser?.id!==account||!canSaveLearning())return;
   index.rows=normalizeVocabularyIndex(rows);index.loaded=true;
  }catch{
   if(vocabularyIndex===index&&authUser?.id===account)index.error='어휘 목록을 불러오지 못했어요. 인터넷 연결을 확인하고 ‘목록 새로고침’을 눌러 주세요.';
  }finally{
   index.loading=false;index.task=null;
   if(vocabularyIndex===index&&authUser?.id===account)renderVocabularyOverview();
  }
 });
 index.task=task;return task;
}
function vocabularyProgress(word,learner){
 const st=learner.words?.[word.w]||{},retained=masteryConfirmed(st),used=(Array.isArray(st.useDays)&&st.useDays.length>0)||Number(st.useSuccess)>0;
 const studied=retained||used||Number(st.seen)>0||!!st.introducedAt;
 return {studied,used,retained,status:retained?'retained':used?'use':studied?'studied':'new',label:retained?'장기 기억 확인':used?'문장 사용 확인':studied?'학습 중':'아직 학습 전'};
}
function renderVocabularyOverview(){
 if(!$('vocabularyLevels'))return;
 const c=child(),index=vocabularyIndex,rows=index.account===authUser?.id?index.rows:[],ready=index.loaded&&index.account===authUser?.id;
 const groups=Array.from({length:9},(_,i)=>({band:i+1,words:rows.filter(w=>w.band===i+1)}));
 const target=groups.filter(g=>inTargetBand({band:g.band},c.difficulty)).map(g=>g.band);
 const range=target.length===1?target[0]+'단계':target[0]+'~'+target.at(-1)+'단계';
 $('vocabularyCurrent').textContent=c.name+' · 현재 난이도 '+Number(c.difficulty).toFixed(1)+' · 기본 출제 범위 '+range;
 const studied=rows.filter(w=>vocabularyProgress(w,c).studied).length,used=rows.filter(w=>vocabularyProgress(w,c).used).length;
 $('vocabularySummary').textContent=ready?'등록 어휘 '+rows.length.toLocaleString()+'개 · 학습한 단어 '+studied+'개 · 문장 사용 확인 '+used+'개':'등록된 전체 어휘를 단계별로 살펴보세요.';
 $('vocabularyLoadStatus').textContent=index.error+(index.error&&ready?' 이전에 불러온 목록을 표시하고 있어요.':'')||(index.loading?'어휘 목록을 불러오는 중…':'각 단계의 단어 수와 학습한 단어 수예요. 파란 표시가 현재 출제 범위입니다.');
 $('vocabularyReload').disabled=index.loading;
 $('vocabularyLevels').innerHTML=groups.map(g=>{
  const count=g.words.length,learned=g.words.filter(w=>vocabularyProgress(w,c).studied).length,selected=vocabularyFilter.band===g.band,near=target.includes(g.band);
  return `<button class="vocabulary-level ${g.band<=3?'foundation':g.band<=6?'extension':'advanced'}${selected?' selected':''}" data-vocabulary-band="${g.band}" aria-pressed="${selected}" aria-label="${g.band}단계${ready?' 어휘 '+count+'개, 학습 '+learned+'개':''}${near?', 현재 출제 범위':''}"><span class="vocabulary-level-head"><strong>${g.band}<small>단계</small></strong><span>${g.band<=3?'기초':g.band<=6?'확장':'심화'}</span></span><b>${ready?count.toLocaleString()+'개':'—'}</b><small>${ready?'학습 '+learned+'개':'목록 확인 중'}</small><p>${ready?(count?g.words.slice(0,3).map(w=>escapeHtml(w.w)).join(' · '):'등록된 어휘 없음'):'&nbsp;'}</p><span class="vocabulary-range${near?' current':''}">${near?'현재 출제 범위':'&nbsp;'}</span></button>`;
 }).join('');
 $('vocabularyListTitle').textContent=vocabularyFilter.band?vocabularyFilter.band+'단계 전체 어휘':'전체 어휘';
 $('vocabularyAll').setAttribute?.('aria-pressed',String(!vocabularyFilter.band));
 const query=vocabularyFilter.query.normalize('NFKC').trim().toLocaleLowerCase('ko'),status=vocabularyFilter.status;
 const filtered=rows.filter(w=>{
  const p=vocabularyProgress(w,c);
  return (!vocabularyFilter.band||w.band===vocabularyFilter.band)&&(!query||(w.w+' '+w.d).normalize('NFKC').toLocaleLowerCase('ko').includes(query))&&(status==='all'||status==='studied'&&p.studied||status==='new'&&!p.studied||status==='use'&&p.used||status==='retained'&&p.retained);
 });
 const pageSize=60,pages=Math.max(1,Math.ceil(filtered.length/pageSize));vocabularyFilter.page=clamp(vocabularyFilter.page,0,pages-1);
 const start=vocabularyFilter.page*pageSize,visible=filtered.slice(start,start+pageSize);
 $('vocabularyResultCount').textContent=ready?(filtered.length?'조건에 맞는 '+filtered.length.toLocaleString()+'개 · '+(start+1)+'~'+(start+visible.length)+'번째':'조건에 맞는 단어가 없어요.'):(index.error?'목록을 다시 불러와 주세요.':'목록을 불러오면 단어가 표시됩니다.');
 $('vocabularyWords').innerHTML=visible.map(w=>{
  const p=vocabularyProgress(w,c),st=c.words?.[w.w]||{};
  return `<details class="vocabulary-entry"><summary><span class="vocabulary-word-name"><strong>${escapeHtml(w.w)}</strong><small>${w.band}단계</small></span><span class="vocabulary-progress ${p.status}">${p.label}</span></summary><div class="vocabulary-definition"><p>${escapeHtml(w.d)}</p><small>${escapeHtml(w.cat||'어휘')} · 난이도 ${w.band}단계</small>${p.studied&&st.nextReviewAt?`<small>다음 복습 ${escapeHtml(st.nextReviewAt)}</small>`:''}</div></details>`;
 }).join('');
 $('vocabularyPages').innerHTML=ready&&filtered.length?`<button class="ghost" data-vocabulary-page="-1"${vocabularyFilter.page===0?' disabled':''}>이전</button><small>${vocabularyFilter.page+1} / ${pages}페이지</small><button class="ghost" data-vocabulary-page="1"${vocabularyFilter.page>=pages-1?' disabled':''}>다음</button>`:'';
}
function renderStudyHistory(profile){
 const host=$('studyHistory');if(!host)return;
 const learner=state.users[profile],rows=studyHistory.dailyStudyRows(learner,reportHistoryFilter),summary=studyHistory.studyRangeSummary(rows),pageSize=15,pages=Math.max(1,Math.ceil(rows.length/pageSize));
 reportHistoryPage=clamp(reportHistoryPage,0,pages-1);
 const percent=value=>value==null?'미평가':value+'%',time=row=>row.unknownTimes?(row.activeMs?studyHistory.formatStudyTime(row.activeMs)+' · 일부 미기록':'시간 미기록'):studyHistory.formatStudyTime(row.activeMs);
 host.innerHTML=`<div class="row between"><div><div class="eyebrow">${escapeHtml(learner.name)}의 공부 기록</div><h3 id="studyHistoryTitle">일자별 학습 기록</h3></div><span class="tag">${rows.length}일</span></div>
 <div class="study-history-filters"><label>시작일<input id="studyHistoryFrom" type="date" value="${escapeHtml(reportHistoryFilter.from)}"></label><label>종료일<input id="studyHistoryTo" type="date" value="${escapeHtml(reportHistoryFilter.to)}"></label><label>학습 종류<select id="studyHistoryMode"><option value="study"${reportHistoryFilter.mode==='study'?' selected':''}>단어 학습·복습</option><option value="level"${reportHistoryFilter.mode==='level'?' selected':''}>레벨 확인</option><option value="all"${reportHistoryFilter.mode==='all'?' selected':''}>전체 학습</option></select></label></div>
 <div class="actions study-history-periods"><button id="studyHistoryAll" class="ghost">전체 기간</button><button id="studyHistoryWeek" class="ghost">최근 7일</button><button id="studyHistoryMonth" class="ghost">최근 30일</button></div>
 ${reportHistoryFilter.from&&reportHistoryFilter.to&&reportHistoryFilter.from>reportHistoryFilter.to?'<p class="study-history-warning" role="status">시작일을 종료일보다 앞선 날짜로 선택해 주세요.</p>':''}
 <div class="study-history-summary"><div><strong>${time(summary)}</strong><span>합계 학습시간</span></div><div><strong>${percent(summary.accuracy)}</strong><span>기간 정답률${summary.unknown?' · 일부 기록':''}</span></div><div><strong>${summary.total}문제</strong><span>채점된 풀이</span></div></div>
 <p class="muted study-history-note">정답률 = 완전정답 ÷ 채점된 문제. 반복 풀이도 포함하며, 힌트·부분정답은 완전정답에 넣지 않아요. 앱을 닫거나 다른 화면에 있는 시간은 제외합니다.</p>
 ${rows.length?`<div class="study-history-scroll"><table class="study-history-table"><caption class="sr-only">${escapeHtml(learner.name)}의 날짜별 학습시간과 정답률</caption><thead><tr><th scope="col">학습일</th><th scope="col">학습시간</th><th scope="col">정답률</th><th scope="col">풀이 기록</th><th scope="col">진행</th></tr></thead><tbody>${rows.slice(reportHistoryPage*pageSize,(reportHistoryPage+1)*pageSize).map(row=>`<tr><th scope="row">${row.date.replaceAll('-','.')}</th><td>${time(row)}</td><td><strong>${percent(row.accuracy)}</strong><small>정답 ${row.good} / ${row.total-row.unknown}문제${row.unknown?' · 일부 기록':''}</small></td><td>${row.total}문제<small>부분 ${row.partial} · 오답 ${row.wrong}${row.unknown?' · 미기록 '+row.unknown:''}</small></td><td>${row.completed?'완료 '+row.completed+'회':''}${row.ongoing?(row.completed?' · ':'')+'이어서 학습 가능':!row.completed?'연속 학습':''}</td></tr>`).join('')}</tbody></table></div>
 <div class="row between study-history-pages"><button id="studyHistoryPrev" class="ghost"${reportHistoryPage===0?' disabled':''}>이전</button><small>${reportHistoryPage+1} / ${pages}페이지</small><button id="studyHistoryNext" class="ghost"${reportHistoryPage>=pages-1?' disabled':''}>다음</button></div>`:'<p class="muted study-history-empty">선택한 기간에 학습 기록이 없어요.</p>'}
 <p class="muted study-history-note">학습을 마치지 않아도 시간과 채점된 답이 저장됩니다. 이전 학습은 남아 있는 기록을 가져왔으며, 당시 시간이 기록되지 않은 회차는 ‘시간 미기록’으로 표시합니다.</p>`;
 const update=()=>{reportHistoryFilter={from:$('studyHistoryFrom').value||'',to:$('studyHistoryTo').value||'',mode:$('studyHistoryMode').value||'study'};reportHistoryPage=0;renderStudyHistory(profile)};
 for(const id of ['studyHistoryFrom','studyHistoryTo','studyHistoryMode'])$(id).onchange=update;
 const period=days=>{reportHistoryFilter.from=days?dayOffset(-(days-1)):'';reportHistoryFilter.to=days?today():'';reportHistoryPage=0;renderStudyHistory(profile)};
 $('studyHistoryAll').onclick=()=>period(0);$('studyHistoryWeek').onclick=()=>period(7);$('studyHistoryMonth').onclick=()=>period(30);
 if($('studyHistoryPrev'))$('studyHistoryPrev').onclick=()=>{reportHistoryPage--;renderStudyHistory(profile)};
 if($('studyHistoryNext'))$('studyHistoryNext').onclick=()=>{reportHistoryPage++;renderStudyHistory(profile)};
}
function renderReport(){
 const reportId=['ayoung','inseong'].includes(reportProfile)?reportProfile:(['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung');reportProfile=reportId;
 const c=state.users[reportId],stats=summarizeEvidence(c),budget=studyBudget(c),studied=WORDS.filter(w=>isLearningTarget(w.w,w.cat,w.band)&&((c.words[w.w]?.seen||0)>0||c.words[w.w]?.introducedAt));
 const weak=studied.filter(w=>!masteryConfirmed(c.words[w.w])).sort((a,b)=>(c.words[b.w].wrong||0)-(c.words[a.w].wrong||0)).slice(0,5);
 $('reportTitle').textContent=c.name+' 부모 리포트';document.querySelectorAll('[data-report-profile]').forEach(b=>b.classList.toggle('active',b.dataset.reportProfile===reportId));
 const metric=(label,x,description)=>`<div class="evidence-card"><span>${label}</span><strong>${x.percent==null?'기록 대기':x.percent+'%'}</strong><small>${x.attempts?x.success+'/'+x.attempts+'회 · ':''}${description}</small></div>`;
 renderStudyHistory(reportId);
 $('reportBody').innerHTML=`<div class="grid4"><div class="stat"><strong>${studied.length}</strong><span>학습 단어</span></div><div class="stat"><strong>${stats.mastered}</strong><span>장기 확인 단어</span></div><div class="stat"><strong>${c.difficulty.toFixed(1)}</strong><span>출제 난이도</span></div><div class="stat"><strong>${Number(c.leagueLevel??c.difficulty).toFixed(1)}</strong><span>리그 등급</span></div></div>
 <div class="card"><div class="eyebrow">맞히는 방식과 기억을 따로 확인</div><h3>어휘 학습의 네 가지 모습</h3><div class="evidence-grid">${metric('보기로 알아보기',stats.recognition,'첫 답 기준')}${metric('다른 날 직접 회상',stats.recall,'보기·힌트 없이')}${metric('새 글 이해',stats.transfer,'처음 보는 글의 뜻과 쓰임')}${metric('내 문장에 사용',stats.use,'목표어를 보여준 사용 활동')}</div></div>
 <div class="card"><h3>시간이 지나도 기억하나요?</h3><div class="evidence-grid">${metric('7일 이상 뒤 회상',stats.retention7,'마지막 노출 후 7~29일')}${metric('30일 이상 뒤 회상',stats.retention30,'마지막 노출 후 30일 이상')}</div><p class="muted">장기 확인은 3일 이상 직접 회상, 7일 이상 뒤 성공, 내 문장 사용을 모두 확인한 단어예요. 기존 정오답·숙달 기록은 단어장에 보관하고 새 확인 기록과 구분합니다. 도움 없이 회상하기 전 뜻이나 보기를 본 단어는 지연 회상 검사에 넣지 않아요.</p></div>
 <div class="card"><h3>오늘의 적정 분량</h3><p>새 단어 ${budget.newCount}개 · 복습 예정 ${budget.due}개 · 20~25분</p><p class="muted">하루 새 단어 5개와 복습 단어 10개가 기준입니다. 현재 수준에서 복습 예정일과 최근 약점을 우선하며, 낮은 단계의 확인된 약점은 최대 2개·실제 복습 단어의 20% 이하로 제한합니다. 후보가 부족하면 가능한 분량만 준비합니다. 문제 수 제한 없이 모든 단어로 뜻과 쓰임이 드러나는 문장을 만들 때까지 진행합니다. 오답은 다른 유형으로 연습한 뒤 문장 사용을 다시 확인하며, 중간에 쉬어도 이어서 할 수 있어요.</p><small class="muted">최근 학습 시간: ${c.sessions[0]?.activeMinutes!=null?c.sessions[0].activeMinutes+'분':'개편 후 기록 대기'}</small></div>
 <div class="card"><h3>다음 우선순위</h3><div class="list">${weak.length?weak.map(w=>`<div class="item"><strong>${escapeHtml(w.w)}</strong> <small>${escapeHtml(w.d)} · 다음 복습 ${escapeHtml(c.words[w.w].nextReviewAt||'곧 확인')}</small></div>`).join(''):'<p class="muted">학습 기록이 쌓이면 개인별 복습을 안내해요.</p>'}</div></div>
 <div class="card"><h3>매 회차 등급 조정</h3><p>${escapeHtml(levelAdjustmentLabel(c)||'다음 학습을 마치면 이 회차의 등급 변화를 보여 드려요.')}</p><p class="muted">현재 수준에 맞는 어휘 문항의 부분 점수까지 반영해, 학습을 마칠 때마다 출제 난이도와 순위 등급을 함께 조정해요. 하루에 여러 번 학습해도 매번 적용됩니다. 20개 평가 문항 기준: 90% 이상 +0.2, 80~89% +0.1, 60~79% 유지, 40~59% −0.1, 40% 미만 −0.2. 짧게 마친 회차는 활동 수에 비례해 반영하며, 힌트는 부분 점수로 계산해요. 이 등급은 게임용 학습 추정값이며 공인 어휘력 점수나 실제 학년 점수가 아닙니다.</p></div>`;
}

function show(id){if(!['learn','intro'].includes(id)){pauseLearningClock();if(checkpointSession()){localSave();cloudSave()}}else if(session&&!session.clockStarted&&!document.hidden)session.clockStarted=Date.now();if(['home','characters','ranking'].includes(id))renderExploration();if(id==='home')renderResumeButton();if(id==='home')setTimeout(warmDailyQuestions,0);document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.go===id));if(id==='wordbook'){renderWordbook();if(wordbookView==='levels')loadVocabularyIndex()}if(id==='report'){if(!['ayoung','inseong'].includes(reportProfile))reportProfile=['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung';renderReport()}window.scrollTo({top:0,behavior:'smooth'})}
async function login(){setMsg('로그인 중…');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)setMsg('로그인 실패: 이메일과 비밀번호를 확인해 주세요.',true)}
async function signup(){const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6)return setMsg('이메일과 6자 이상의 비밀번호를 입력해 주세요.',true);setMsg('계정을 만드는 중…');const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg(data.session?'계정이 만들어졌어요.':'확인 메일을 보냈어요. 메일의 확인 링크를 눌러 주세요.')}
async function resendConfirm(){const email=$('email').value.trim();if(!email)return setMsg('먼저 이메일을 입력해 주세요.',true);setMsg('확인 메일을 다시 보내는 중…');const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg('새 확인 메일을 보냈어요. 가장 최근 메일의 링크를 눌러 주세요.')}
function setMsg(m,e=false){$('authMsg').textContent=m;$('authMsg').className='authmsg'+(e?' error':'')}
async function applyAuth(sessionObj){
 const nextUser=sessionObj?.user||null;
 if(nextUser?.id===authUser?.id){
  if(canSaveLearning())return;
  if(authLoadTask)return authLoadTask;
 }
 const previousAccount=authUser?.id;
 const epoch=++authEpoch;loadedAccount=null;authUser=nextUser;
 $('authGate').classList.remove('hidden');
 if(previousAccount!==nextUser?.id){
  vocabularyIndex={account:nextUser?.id||null,rows:[],loaded:false,loading:false,error:'',task:null};
  vocabularyFilter={band:0,query:'',status:'all',page:0};
  if($('vocabularySearch'))$('vocabularySearch').value='';if($('vocabularyStatus'))$('vocabularyStatus').value='all';
  for(const p of preparations.values())p.cancel();preparations.clear();
  if(session?.preparation)session.preparation.cancel();session=null;
  state=mergeState(initial());
 }
 if(!nextUser){setMsg('로그인하면 저장된 기록을 불러옵니다.');renderAll();return}
 const account=nextUser.id;
 $('accountEmail').textContent=nextUser.email||'가족 계정';
 setMsg('저장된 학습 기록을 확인하고 있어요…');
 const task=(async()=>{
  try{
   if(cloudSaveTask)await cloudSaveTask;
   if(epoch!==authEpoch)return;
   const loaded=await cloudLoad(account,epoch);
   if(!loaded||epoch!==authEpoch||!canSaveLearning())return;
   $('authGate').classList.add('hidden');setMsg('');
   if($('wordbook').classList.contains('active')&&wordbookView==='levels')loadVocabularyIndex();
   $('cloudPill').textContent='클라우드 연결';$('cloudPill').classList.add('on');
   setTimeout(async()=>{
    if(epoch!==authEpoch||!canSaveLearning())return;
    try{
     await ensureCatalog(child().difficulty,'daily');
     if(epoch!==authEpoch||!canSaveLearning())return;
     warmDailyQuestions();const st=await curriculumStatus();
     if(epoch!==authEpoch||!canSaveLearning())return;
     if(st&&$('curriculumProgress')){
      const n=Object.values(st).reduce((a,b)=>a+Number(b||0),0),ready=n>=5000&&n<=7000;
      $('curriculumProgress').textContent=ready?'2차 선별 완료 · 사용 가능 '+n.toLocaleString()+'개 · 학년은 권장 단계':'사용 가능 '+n.toLocaleString()+'개 · 점검 필요';
      if($('buildCurriculum')){$('buildCurriculum').textContent=ready?'어휘 DB 확인 완료':'다시 확인';$('buildCurriculum').disabled=ready;}
     }
    }catch{}
   },700);
  }catch(e){
   if(epoch!==authEpoch)return;
   loadedAccount=null;++authEpoch;
   $('cloudPill').textContent='기록 불러오기 실패';$('cloudPill').classList.remove('on');
   setMsg('기록을 불러오지 못했어요. 기존 기록은 보호됩니다. 인터넷 연결을 확인하고 다시 로그인하거나 새로고침해 주세요.',true);
  }
 })();
 authLoadTask=task;
 try{return await task}finally{if(authLoadTask===task)authLoadTask=null}
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
$('customizationShop')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.cosmeticTab){cosmeticTab=b.dataset.cosmeticTab;cosmeticPreview=null;renderCustomization()}else if(b.dataset.cosmeticPreview)previewCosmetic(b.dataset.cosmeticPreview);else if(b.dataset.cosmeticApply)applyCosmetic(b.dataset.cosmeticApply);else if(b.dataset.cosmeticReset)resetCosmetic(b.dataset.cosmeticReset)});
$('characterGrid')?.addEventListener('click',e=>{const button=e.target.closest('[data-character]');if(button)selectCharacter(button.dataset.character)});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else alert('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 눌러주세요.')};
document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{pauseLearningClock();checkpointSession();if(session?.preparation)session.preparation.cancel();session=null;state.selected=b.dataset.profile;localSave();cloudSave();renderAll();show('home');warmDailyQuestions()});
document.querySelectorAll('[data-report-profile]').forEach(b=>b.onclick=()=>{reportProfile=b.dataset.reportProfile;reportHistoryPage=0;renderReport()});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));
document.querySelectorAll('[data-wordbook-view]').forEach(b=>b.onclick=()=>{wordbookView=b.dataset.wordbookView;renderWordbook();if(wordbookView==='levels')loadVocabularyIndex()});
$('vocabularyLevels')?.addEventListener('click',e=>{const b=e.target.closest('[data-vocabulary-band]');if(!b)return;vocabularyFilter.band=Number(b.dataset.vocabularyBand);vocabularyFilter.page=0;renderVocabularyOverview()});
if($('vocabularySearch'))$('vocabularySearch').oninput=()=>{vocabularyFilter.query=$('vocabularySearch').value;vocabularyFilter.page=0;renderVocabularyOverview()};
if($('vocabularyStatus'))$('vocabularyStatus').onchange=()=>{vocabularyFilter.status=$('vocabularyStatus').value;vocabularyFilter.page=0;renderVocabularyOverview()};
if($('vocabularyAll'))$('vocabularyAll').onclick=()=>{vocabularyFilter.band=0;vocabularyFilter.page=0;renderVocabularyOverview()};
if($('vocabularyReload'))$('vocabularyReload').onclick=()=>loadVocabularyIndex(true);
$('vocabularyPages')?.addEventListener('click',e=>{const b=e.target.closest('[data-vocabulary-page]');if(!b||b.disabled)return;vocabularyFilter.page+=Number(b.dataset.vocabularyPage);renderVocabularyOverview()});
$('startDaily').onclick=()=>buildSession('daily');$('startReview').onclick=()=>buildSession('review');$('levelTest').onclick=()=>buildSession('level');
$('submit').onclick=()=>gradeCurrent(false);$('hint').onclick=showHint;$('dontKnow').onclick=()=>gradeCurrent(true);$('next').onclick=nextQuestion;$('introNext').onclick=nextIntro;
if($('finishEarly')){$('finishEarly').textContent='잠시 쉬기';$('finishEarly').onclick=()=>{if(!session)return;if(session.mode==='level'){finishSession();return}pauseLearningClock();checkpointSession();localSave();cloudSave();show('home');renderResumeButton()}};$('mic').onclick=startVoice;
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
window.addEventListener('pagehide',()=>{pauseLearningClock();if(checkpointSession()){localSave();cloudSave()}});
setInterval(()=>{if(!document.hidden&&session&&!session.completed&&['learn','intro'].some(id=>$(id)?.classList.contains('active'))&&checkpointSession()){localSave();cloudSave()}},30000);

