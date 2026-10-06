import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const today=()=>new Date().toISOString().slice(0,10);
const dayOffset=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
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
 if(data?.state){state=mergeState(data.state)} else await cloudSave();
 localSave(); renderAll();
}
function rebuildCatalog(){
 WORDS=[...SEED_WORDS];
 const seen=new Set(WORDS.map(x=>x.w));
 for(const x of Object.values(state.catalog||{})){
   const studied=Object.values(state.users||{}).some(u=>(u?.words?.[x?.w]?.seen||0)>0);
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
 const unseen=b0=>[...FIXED_CACHE.values()].filter(w=>w.band===b0&&!(child().words[w.w]?.seen)).length;
 if(mode==='diagnostic'){
   const missing=[1,2,3,4,5,6,7,8,9].filter(x=>unseen(x)<25);
   if(missing.length)await loadFixedCurriculum(missing,80);
   return;
 }
 const bands=[b-1,b,b+1].filter(x=>x>=1&&x<=9);
 const missing=bands.filter(x=>unseen(x)<25);
 if(missing.length)await loadFixedCurriculum(missing,180);
 const near=WORDS.filter(w=>w.source==='fixed'&&Math.abs((w.band||3)-b)<=1&&!(child().words[w.w]?.seen)).length;
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
 return WORDS.filter(w=>!(child().words[w.w]?.seen))
   .map(w=>({w,score:Math.abs((w.band||3)-target)*5+(w.source==='fixed'?-3:2)+Math.random()*4}))
   .sort((a,b)=>a.score-b.score).slice(0,n).map(x=>x.w);
}
function chooseReview(n=15){
 const seen=WORDS.filter(w=>child().words[w.w]?.seen);
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
const TYPE_LABELS={mc_context:'문맥 선택',mc_usage:'사용 상황',subjective_context:'문맥 빈칸',subjective_dialogue:'대화 완성'};
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
     successStreak:p.successStreak,firstLearning:p.firstLearning,
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
     w:p.w,type:q.type,label:TYPE_LABELS[q.type]||'문맥',q:q.prompt,ctx:q.context||'',
     showTarget:!!q.showTarget,open:q.type.startsWith('subjective_'),hideWord:!q.showTarget,
     opts:(q.options||[]).map(o=>({t:o.text,ok:!!o.correct,reason:o.reason||''})),
     acceptedAnswers:q.acceptedAnswers||[],hints:q.hints||[],feedbackCorrect:q.feedbackCorrect||'',
     signature:q.signature||'',validation:q.validation||null
   };
 });
}
const PREPARATION_ENGINE='10.8.0';
const PREPARATION_CONCURRENCY=4;
const PREPARATION_TTL=36*60*60*1000;
const preparations=new Map(),preparationLoads=new Map();
const SCENARIOS=['집에서 가족과 계획을 세우는 일','학교에서 친구들과 함께 해결하는 일','동네에서 이웃을 돕는 일','숲에서 동식물을 살피는 일','가게에서 물건을 고르는 일','도서관에서 정보를 찾는 일','여행에서 새로운 곳을 알아보는 일','운동이나 놀이를 하는 일','과학 활동에서 작은 실험을 하는 일','비나 바람 때문에 계획을 바꾸는 일','공원이나 거리의 불편을 개선하는 일','친구와 의견이 달라 대화하는 일'];
function preparationSnapshot(profile){
 const c=state.users[profile];
 const words=Object.entries(c.words||{}).filter(([,s])=>s.seen>0).sort(([a],[b])=>a.localeCompare(b)).map(([w,s])=>[w,s.seen,s.correct,s.wrong,s.streak,s.supportLevel,s.nextReviewAt,s.lastFeedbackDate,(s.usedPassageKeys||[]).length]);
 return JSON.stringify([c.difficulty,c.levelTestCompleted,words]);
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
function validPreparedQuestion(q,plan){return q?.w?.w===plan?.w?.w&&q.type===plan.type&&q.validation?.deterministic===true&&q.validation?.aiVerified===true&&q.validation?.checks?.coherentSituation===true}
function questionPassageKeys(q){return passageKeys(q.ctx,(q.opts||[]).map(o=>o.t))}
function savePreparation(p){
 if(p.adopted||p.cancelled)return;
 try{localStorage.setItem(p.key,JSON.stringify({engine:PREPARATION_ENGINE,created:p.created,account:p.account,profile:p.profile,snapshot:p.snapshot,mode:p.mode,difficulty:p.difficulty,newWords:p.newWords,baseWords:p.baseWords,plans:p.plans,serverId:p.serverId,ready:[...p.ready]}))}catch{}
}
function createPreparation(meta,saved=[]){
 const p={...meta,queue:[],ready:new Map(),jobs:[],waiters:[],running:0,adopted:false,cancelled:false};
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
   if(!p.adopted&&!p.cancelled&&p.mode==='daily'&&authUser?.id===p.account&&state.selected===p.profile&&!preparingSession&&(!session||current>=session.target)){
     const failed=p.jobs.find(j=>j.indices.includes(0))?.error;
     $('cloudPill').textContent=failed?'문제 준비 지연 · 시작 버튼으로 재시도':p.queue.length>=20?'학습 준비 완료':p.queue.length?'학습 시작 가능 · 다음 문제 준비 중':'학습 문제 미리 준비 중';
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
    // Explicitly running lessons can recover missing questions after bounded
    // server retries, while keeping every validated question already saved.
    if(p.adopted){for(const job of p.jobs)job.error=null;p.pump=ordinaryPump;ordinaryPump();return}
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
     // A consumed server lesson cannot be replayed from local storage.
     if(saved?.serverId)saved=null;
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
     if(mode==='level')reviewWords=WORDS.filter(w=>!(child().words[w.w]?.seen)).sort(()=>Math.random()-.5).slice(0,30);
     else if(mode==='review')reviewWords=chooseReview(20);
     else{newWords=chooseNew(5);reviewWords=chooseReview(15)}
     const baseWords=[...newWords,...reviewWords];
     if(!baseWords.length)throw new Error(mode==='review'?'아직 복습할 기록이 충분하지 않아요. 오늘의 학습을 먼저 진행해 주세요.':'출제할 어휘를 준비하지 못했습니다.');
     meta={key,account,profile,mode,snapshot:preparationSnapshot(profile),created:Date.now(),difficulty:child().difficulty,newWords:newWords.map(w=>w.w),baseWords,plans:assignScenarios(makeQuestionPlan(newWords,reviewWords,20,mode))};
   }
   const p=createPreparation(meta,restored?saved.ready||[]:[]);
   preparations.set(key,p);p.pump();return p;
 })();
 preparationLoads.set(key,loading);
 try{return await loading}finally{preparationLoads.delete(key)}
}
function warmDailyQuestions(){
 if(!authUser||preparingSession||(session&&current<session.target))return;
 getPreparation('daily').catch(()=>{});
}
function renderIntro(){
 const list=session?.intros||[];
 if(introIndex>=list.length){show('learn');renderQuestion();return}
 const w=list[introIndex],st=wordState(w.w);
 if(!st.introducedAt)st.introducedAt=today();
 $('introCounter').textContent=(introIndex+1)+' / '+list.length;
 $('introWord').textContent=w.w;
 $('introDefinition').textContent=w.d;
 $('introExample').textContent=w.example||('“'+w.w+'”이 실제 문장에서 어떻게 쓰이는지 다음 문제에서 확인해 봅니다.');
 $('introNext').textContent=introIndex===list.length-1?'문제 시작':'다음 단어';
 localSave();
}
function nextIntro(){introIndex++;renderIntro()}

async function buildSession(mode='daily'){
 if(preparingSession)return;
 preparingSession=true;
 const profile=state.selected,account=authUser?.id,button=mode==='level'?'levelTest':mode==='review'?'startReview':'startDaily',oldText=$(button).textContent;
 for(const id of ['startDaily','startReview','levelTest'])$(id).disabled=true;
 $(button).textContent='준비된 문제를 불러오는 중…';$('cloudPill').textContent='문제 준비 중';
 try{
   // The background queue keeps preparing after this bounded UI wait ends.
   const p=await withDeadline((async()=>{
     const prepared=await getPreparation(mode);
     await prepared.waitFor(0,true);return prepared;
   })(),QUESTION_WAIT_MS,'맞춤 문제를 서버에서 준비 중이에요. 앱을 닫아도 준비는 계속됩니다. 잠시 뒤 다시 눌러 주세요.');
   if(state.selected!==profile||authUser?.id!==account)return;
   if(p.serverId){
     const {data,error}=await withDeadline(sb.rpc('consume_prepared_lesson',{p_profile:profile,p_id:p.serverId}),10000,'학습 시작 확인이 지연됐어요. 기록은 유지됩니다. 다시 눌러 주세요.');
     if(error||!data){p.cancel();preparations.delete(p.key);localStorage.removeItem(p.key);throw new Error('이 학습은 이미 시작되었거나 기록이 바뀌었어요. 시작 버튼을 다시 눌러 주세요.')}
     if(state.selected!==profile||authUser?.id!==account)return;
   }
   p.adopted=true;preparations.delete(p.key);
   try{localStorage.removeItem(p.key)}catch{}
   session={mode,queue:p.queue,preparation:p,results:[],target:20,max:30,difficulty:p.difficulty,ability:clamp(p.difficulty||3,1,9),intros:[],newWords:p.newWords,baseWords:p.baseWords,validated:true,loadingQuestions:null,profile};
   Object.defineProperty(session,'pendingPlans',{get:()=>p.plans.slice(p.queue.length)});
   current=0;introIndex=0;hintLevel=0;$('next').disabled=false;
   show('learn');renderQuestion();prefetchQuestions();
 }catch(e){
   if(state.selected===profile&&authUser?.id===account){alert('문제 준비를 완료하지 못했어요. 학습 기록은 유지됩니다.\n'+String(e?.message||e));show('home')}
 }finally{
   preparingSession=false;
   $(button).textContent=oldText;
   for(const id of ['startDaily','startReview','levelTest'])$(id).disabled=false;
   $('cloudPill').textContent='클라우드 연결';$('cloudPill').classList.add('on');
 }
}
function renderQuestion(){
 if(current>=session.queue.length||current>=session.target){finishSession();return}
 const q=session.queue[current];rememberQuestion(q);localSave(); selectedOption=null; answerSource='typed';hintLevel=0;
 $('learnType').textContent=session.mode==='level'?'레벨 확인':session.mode==='review'?'집중 복습':'오늘의 학습';
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
 $('answer').placeholder=q.type==='subjective_dialogue'?'대화에 어울리는 어휘를 써 보세요.':'빈칸에 들어갈 어휘를 써 보세요.';
 $('hint').classList.remove('hidden'); $('hint').disabled=false; $('hint').textContent='힌트';
 if(q.opts?.length)q.opts.forEach((o,i)=>{
   const b=document.createElement('button');b.className='option';b.textContent=o.t;
   b.onclick=()=>{if($('next').classList.contains('hidden')){selectedOption=i;document.querySelectorAll('.option').forEach((x,j)=>x.classList.toggle('selected',j===i));gradeCurrent(false)}};
   $('options').appendChild(b);
 });
 prefetchQuestions();
}
function resultCredit(result){return result==='◎'||result==='○'?1:result==='△'?.5:result==='?'?.25:0}
function applyResult(q,result,feedback,normalized='',meta={}){
 rememberQuestion(q);
 const st=wordState(q.w.w);
 let credit=Number.isFinite(meta.credit)?clamp(meta.credit,0,1):resultCredit(result);
 const hintUsed=Boolean(meta.hintUsed);
 const revealed=Boolean(meta.revealed);
 const contextSuccess=meta.contextSuccess??credit>=.5;
 const targetRecall=Boolean(meta.targetRecall);
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
 scheduleReview(st,{credit,independent,revealed,hintUsed});
 if(q.w.pair&&credit<.5&&!st.confusions.includes(q.w.pair))st.confusions.push(q.w.pair);
 const rec={word:q.w.w,result,credit,type:q.type,band:q.w.band||3,contextSuccess,targetRecall,independent,practiceOnly,hintUsed,revealed,signature:q.signature||''};
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
 }else{
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
 cloudSave();
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
}
const normalizeTyped=s=>String(s||'').replace(/[\s"'“”‘’.,!?()\[\]{}]/g,'').trim();

async function gradeCurrent(dontKnow){
 const q=session.queue[current];if(!$('next').classList.contains('hidden'))return;
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
 if(typed===expected){
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
       taskType:'context_answer',
       question:q.q+'\n지문: '+q.ctx,
       targetWord:q.w.w,definition:q.w.d,band:q.w.band||3,
       acceptedAnswers:q.acceptedAnswers||[],answer,source:answerSource
     })
   });
   if(!r.ok)throw new Error('채점 서버 오류');
   const j=await r.json();
   const credit=Number(j.score)===1?1:Number(j.score)===0.5?.5:0;
   const result=credit===1?'○':credit===.5?'△':'×';
   applyResult(q,result,j.feedback||q.feedbackCorrect||'문맥에 맞는지 확인했어요.',j.normalizedAnswer||answer,{
     credit,contextSuccess:Boolean(j.contextSuccess),targetRecall:Boolean(j.targetRecall),
     independent:credit===1&&!hintUsed,hintUsed,revealed:false
   });
 }catch(e){
   alert('채점을 완료하지 못했어요. 답은 기록하지 않았습니다. 인터넷 연결을 확인한 뒤 다시 채점해 주세요.');
 }finally{
   $('submit').disabled=false;$('submit').textContent='채점하기';
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
 const c=child(),r=session.results,total=r.length,good=r.filter(x=>['◎','○'].includes(x.result)).length,ind=r.filter(x=>x.result==='◎').length,wrong=r.filter(x=>x.result==='×').length,score=Math.round(r.reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0)/Math.max(1,total)*100);
 if(session.mode!=='level'){
   if(c.lastDate!==today()){c.learningDays++;c.lastDate=today()}
   c.sessions.unshift({date:today(),score,total,good,wrong,difficulty:c.difficulty});
   c.sessions=c.sessions.slice(0,60);
 }else{
   const weighted=r.reduce((sum,x)=>sum+((x.credit??resultCredit(x.result))*(x.band||3)),0);
   const creditTotal=Math.max(.5,r.reduce((sum,x)=>sum+(x.credit??resultCredit(x.result)),0));
   const evidence=weighted/creditTotal;
   c.difficulty=clamp((session.ability*0.65+evidence*0.35),1,9);
   c.confidence=clamp(total/30,0,1);
   c.levelTestCompleted=true;
 }
 c.preparationRevision=(c.preparationRevision||0)+1;
 cloudSave().then(()=>warmDailyQuestions()); renderAll(); show(state.selected==='guest'?'home':'report');
 alert((session.mode==='level'?'레벨 확인':'학습')+' 완료! '+score+'점'+(session.mode==='level'?' · 시작 단계 '+bandLabel(c.difficulty):''));
}
function renderAll(){
 const c=child(); document.querySelectorAll('[data-profile]').forEach(x=>x.classList.toggle('active',x.dataset.profile===state.selected));
 $('ayoungLevel').textContent='현재 단계 '+bandLabel(state.users.ayoung.difficulty)+' · '+state.users.ayoung.difficulty.toFixed(1);
 $('inseongLevel').textContent='현재 단계 '+bandLabel(state.users.inseong.difficulty)+' · '+state.users.inseong.difficulty.toFixed(1);
 $('guestLevel').textContent='현재 단계 '+bandLabel(state.users.guest.difficulty)+' · '+state.users.guest.difficulty.toFixed(1);
 $('hello').textContent=c.name+'의 오늘 탐험'; $('subtitle').textContent=c.name+' · '+bandLabel(c.difficulty)+' 단계';
 $('statScore').textContent=c.sessions[0]?.score??'-'; $('statWords').textContent=Object.values(c.words).filter(x=>x.seen>0).length; $('statMaster').textContent=Object.values(c.words).filter(x=>x.mastered).length; $('statDay').textContent=Math.max(1,c.learningDays);
 renderWordbook();renderReport();
}
function renderWordbook(){
 const c=child(),arr=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0).sort((a,b)=>((c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0))||((c.words[b.w]?.seen||0)-(c.words[a.w]?.seen||0)));
 $('wordList').innerHTML=arr.length?arr.map(w=>{const s=hydrateWordState(c.words[w.w]);return '<div class="item row between"><div><strong>'+w.w+'</strong><br><small>'+w.d+'</small><br><small>문맥 이해 '+(s.contextSuccess||0)+' · 목표어 직접 회상 '+(s.targetRecall||0)+' · 오답 '+(s.wrong||0)+'</small><br><small>도움 없이 '+(s.independentCorrect||0)+'회 · 학습 '+(s.days?.length||0)+'일 · 다음 복습 '+(s.nextReviewAt||'미정')+'</small></div><span class="tag">Lv.'+s.level+(s.mastered?' 숙달':'')+'</span></div>'}).join(''):'<div class="card muted">아직 학습 기록이 없어요.</div>';
}
function renderReport(){
 const reportId=['ayoung','inseong'].includes(reportProfile)?reportProfile:(['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung'); reportProfile=reportId; const c=state.users[reportId],studied=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0),weak=[...studied].sort((a,b)=>(c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0)).slice(0,5),conf=[...new Set(weak.flatMap(w=>c.words[w.w]?.confusions||[]))].slice(0,4);
 $('reportTitle').textContent=c.name+' 부모 리포트';
 document.querySelectorAll('[data-report-profile]').forEach(b=>b.classList.toggle('active',b.dataset.reportProfile===reportId));
 $('reportBody').innerHTML='<div class="grid4"><div class="stat"><strong>'+(c.sessions[0]?.score??'-')+'</strong><span>최근 점수</span></div><div class="stat"><strong>'+studied.length+'</strong><span>학습 단어</span></div><div class="stat"><strong>'+studied.filter(w=>c.words[w.w]?.mastered).length+'</strong><span>숙달</span></div><div class="stat"><strong>'+c.difficulty.toFixed(1)+'</strong><span>현재 난이도</span></div></div><div class="card"><h3>다음 우선순위</h3><div class="list">'+(weak.length?weak.map(w=>'<div class="item"><strong>'+w.w+'</strong> <small>오답 '+c.words[w.w].wrong+'회 · '+w.d+'</small></div>').join(''):'<span class="muted">학습을 시작하면 자동으로 분석됩니다.</span>')+'</div></div><div class="card"><h3>부모용 한줄 요약</h3><p class="muted">'+(weak.length?'현재 '+weak.map(x=>x.w).join(', ')+'을 우선 복습하면 좋습니다. 현재 학습 단계는 '+bandLabel(c.difficulty)+'입니다.'+(conf.length?' 특히 '+conf.join(', ')+'과의 구별을 다시 확인합니다.':''):'아직 충분한 학습 기록이 없습니다.')+'</p></div>';
}
function show(id){if(id==='home')setTimeout(warmDailyQuestions,0);document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.go===id));if(id==='wordbook')renderWordbook();if(id==='report'){if(!['ayoung','inseong'].includes(reportProfile))reportProfile=['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung';renderReport()}window.scrollTo({top:0,behavior:'smooth'})}
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
 if($('buildCurriculum')){$('buildCurriculum').textContent=ready?'어휘 DB 확인 완료':'다시 확인';$('buildCurriculum').disabled=ready;}}},700)}catch(e){const loc=localStorage.getItem('vocab-adventure-v8');if(loc)state=mergeState(JSON.parse(loc));renderAll();$('cloudPill').textContent='로컬 모드'}} 
}
function startVoice(){
 const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return alert('이 브라우저에서는 음성입력을 지원하지 않아요. Chrome/Edge에서 사용해 주세요.');
 const r=new R();r.lang='ko-KR';r.interimResults=false;$('mic').classList.add('recording');$('mic').textContent='듣는 중…';
 r.onresult=e=>{$('answer').value=e.results[0][0].transcript;answerSource='voice'};r.onend=()=>{$('mic').classList.remove('recording');$('mic').textContent='🎤 음성 입력'};r.onerror=()=>{$('mic').classList.remove('recording');$('mic').textContent='🎤 음성 입력'};r.start();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installHint').textContent='지금 바로 앱으로 설치할 수 있어요.'});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else alert('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 눌러주세요.')};
document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{if(session?.preparation)session.preparation.cancel();session=null;state.selected=b.dataset.profile;localSave();cloudSave();renderAll();show('home');warmDailyQuestions()});
document.querySelectorAll('[data-report-profile]').forEach(b=>b.onclick=()=>{reportProfile=b.dataset.reportProfile;renderReport()});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));
$('startDaily').onclick=()=>buildSession('daily');$('startReview').onclick=()=>buildSession('review');$('levelTest').onclick=()=>buildSession('level');
$('submit').onclick=()=>gradeCurrent(false);$('hint').onclick=showHint;$('dontKnow').onclick=()=>gradeCurrent(true);$('next').onclick=nextQuestion;$('introNext').onclick=nextIntro;$('mic').onclick=startVoice;
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
