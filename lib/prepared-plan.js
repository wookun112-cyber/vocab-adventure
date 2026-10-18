import {ROUND_POLICY} from './study-rounds.js';
import {DAILY_POLICY,buildDailyPlan} from './daily-practice.js';
import {AUTHORED_REVISION} from './authored-policy.js';
import {LEARNING_MODEL,QUESTION_POLICY,LEARNING_LABELS,learningDay,studyBudget,buildLearningPlan,isLearningTarget,selectLevelReviews,selectDailyTargets,COVERAGE_POLICY,RETENTION_POLICY,REVIEW_POLICY,SELECTION_POLICY,inTargetBand,calibratedWord,CALIBRATION_POLICY} from './learning-model.js';
let state;
let WORDS;
const child=()=>state.users.learner;
const wordState=w=>child().words[w]||{seen:0,correct:0,wrong:0,streak:0,supportLevel:0,targetRecall:0};
let learningDate;
let supplyPreference=null;
const isDue=date=>!date||date<=learningDate;
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

const SCENARIOS=['집에서 가족과 계획을 세우는 일','학교에서 친구들과 함께 해결하는 일','동네에서 이웃을 돕는 일','숲에서 동식물을 살피는 일','가게에서 물건을 고르는 일','도서관에서 정보를 찾는 일','여행에서 새로운 곳을 알아보는 일','운동이나 놀이를 하는 일','과학 활동에서 작은 실험을 하는 일','비나 바람 때문에 계획을 바꾸는 일','공원이나 거리의 불편을 개선하는 일','친구와 의견이 달라 대화하는 일'];
function preparationSnapshot(profile){
 const c=state.users[profile];
 const words=Object.entries(c.words||{}).filter(([,s])=>s.seen>0||s.introducedAt).sort(([a],[b])=>a.localeCompare(b)).map(([w,s])=>[w,s.seen,s.correct,s.wrong,s.streak,s.supportLevel,s.nextReviewAt,s.lastFeedbackDate,(s.usedPassageKeys||[]).length,s.introducedAt||null]);
 return JSON.stringify([c.difficulty,c.levelTestCompleted,words,c.lastDate||null,Object.entries(c.unfinishedUsage||{}).sort(([a],[b])=>a.localeCompare(b)), 'round-25-errors-5-12.16.39',AUTHORED_REVISION+':'+REVIEW_POLICY+':'+COVERAGE_POLICY+':'+RETENTION_POLICY]);
}

function assignScenarios(plans){
 const counts=new Map(),offset=Math.floor(Math.random()*SCENARIOS.length);
 for(const plan of plans){
   const count=counts.get(plan.w.w)||0;counts.set(plan.w.w,count+1);
   plan.contextSeed=SCENARIOS[(offset+count)%SCENARIOS.length];
 }
 return plans;
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
   .sort((a,b)=>supplyPreference?.fresh?.size?(Math.abs(a.w.band-target)-Math.abs(b.w.band-target)||Number(supplyPreference.fresh.has(b.w.w))-Number(supplyPreference.fresh.has(a.w.w))||a.score-b.score):a.score-b.score).slice(0,n).map(x=>x.w);
}
function chooseReview(n=10,includeNotDue=false){return selectLevelReviews(WORDS,child(),n,learningDate,{available:supplyPreference?.review,includeNotDue})}



export {passageKeys};
export function learnerSnapshot(learner){state={users:{learner}};return preparationSnapshot('learner')}
export function makePreparedPlan(learner,catalog,curriculum,account,profile,options={}){
 state={users:{learner}};
 supplyPreference=options.supplyPreference||null;
 learningDate=learningDay();
 const unique=new Map(SEED_WORDS.map(w=>[w.w,w]));
 for(const w of Object.values(catalog||{}))if(w?.w&&(learner.words?.[w.w]?.seen||learner.words?.[w.w]?.introducedAt))unique.set(w.w,w);
 for(const w of curriculum||[])unique.set(w.word,{w:w.word,d:w.definition,band:w.band,cat:w.domain,example:w.example||'',pair:w.confusion||'',contrast:w.contrast||'',source:'fixed'});
 WORDS=[...unique.values()].map(calibratedWord);
 const budget={...studyBudget(learner,learningDate),newCount:5,perRound:true},additionalPractice=!!options.reviewOnly||learner.lastDate===learningDate;
 const {newWords,reviewWords,coverage}=selectDailyTargets(WORDS,learner,learningDate,{reviewOnly:options.reviewOnly,newCount:budget.newCount,reviewCount:budget.reviewCount,includeNotDue:additionalPractice,available:supplyPreference?.review,freshAvailable:supplyPreference?.fresh});

 if(options.reviewOnly){budget.newCount=0;budget.reserve=true;}
 const plans=assignScenarios(buildDailyPlan(newWords,reviewWords,wordState,learner.difficulty));

 budget.target=plans.length;budget.availableReviews=reviewWords.length;budget.reviewShortfall=Math.max(0,budget.reviewCount-reviewWords.length);budget.waitingForReviews=plans.length===0;budget.additionalPractice=additionalPractice;
 return {roundPolicy:ROUND_POLICY,retentionPolicy:RETENTION_POLICY,coveragePolicy:COVERAGE_POLICY,coverage,reviewPolicy:REVIEW_POLICY,calibrationPolicy:CALIBRATION_POLICY,selectionPolicy:SELECTION_POLICY,questionPolicy:QUESTION_POLICY,engine:LEARNING_MODEL,model:LEARNING_MODEL,completionPolicy:DAILY_POLICY,baseCount:plans.length,target:plans.length,introAt:plans.filter(p=>p.stage==='check').length,plannedFor:learningDate,budget,created:Date.now(),account,profile,snapshot:learnerSnapshot(learner),mode:'daily',difficulty:learner.difficulty,newWords:newWords.map(w=>w.w),baseWords:[...newWords,...reviewWords],plans,ready:[]};
}
export function generationItems(plans,learner,ready=[]){
 return plans.map(p=>{
  const st=learner.words?.[p.w.w]||{};
  const known=ready.map(([,q])=>q).filter(q=>q.w.w===p.w.w);
  return {id:p.id,type:p.type,word:p.w.w,definition:p.w.d,band:p.w.band||3,readerLevel:Number(learner.difficulty)||2,domain:apiDomain(p.w.cat),example:p.w.example||'',contextSeed:p.contextSeed,answerSlot:p.answerSlot,supportLevel:p.supportLevel,successStreak:p.successStreak,firstLearning:p.firstLearning,review:!!p.review,needsCard:!!p.needsCard,structureNote:p.structureNote||'',stage:p.stage||'',taskDemand:p.taskDemand||'standard',
   previousContexts:[...(st.problemHistory||[]),...known.map(q=>({context:q.ctx,options:q.opts.map(o=>o.t)}))].slice(-8),
   usedPassageKeys:[...(st.usedPassageKeys||[]),...known.flatMap(q=>passageKeys(q.ctx,q.opts.map(o=>o.t)))]};
 });
}
export function browserQuestion(q,plan){return {w:q.authored&&q.targetMeaning?{...plan.w,d:q.targetMeaning}:plan.w,type:q.type,stage:plan.stage,taskDemand:plan.taskDemand,needsCard:plan.needsCard,practiceOnly:!!plan.practiceOnly,review:!!plan.review,remedial:!!plan.remedial,learningCard:q.learningCard,answerForm:q.answerForm||plan.w.w,label:TYPE_LABELS[q.type]||'문맥',q:q.prompt,ctx:q.context||'',showTarget:!!q.showTarget,open:q.type.startsWith('subjective_'),hideWord:!q.showTarget,opts:(q.options||[]).map(o=>({t:o.text,ok:!!o.correct,reason:o.reason||''})),acceptedAnswers:q.acceptedAnswers||[],hints:q.hints||[],feedbackCorrect:q.feedbackCorrect||'',signature:q.signature||'',validation:q.validation||null,authored:q.authored||null,semanticGraderRequired:!!q.semanticGraderRequired,allowNaturalDerivations:q.allowNaturalDerivations||[]}}
