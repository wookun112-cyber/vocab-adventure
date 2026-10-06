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
 contextKeys:[],reviewStage:0,nextReviewAt:null,lastReviewAt:null,supportLevel:0,introducedAt:null
});
const hydrateWordState=raw=>{
 const x={...freshWord(),...(raw||{})};
 x.days=Array.isArray(x.days)?x.days:[];
 x.recallDays=Array.isArray(x.recallDays)?x.recallDays:[];
 x.contextKeys=Array.isArray(x.contextKeys)?x.contextKeys:[];
 x.confusions=Array.isArray(x.confusions)?x.confusions:[];
 x.types=x.types&&typeof x.types==='object'?x.types:{};
 return x;
};
const freshChild=name=>({
 name,difficulty:2,confidence:0,learningDays:0,sessions:[],
 words:Object.fromEntries(SEED_WORDS.map(x=>[x.w,freshWord()])),
 lastDate:null,levelTestCompleted:false,recentProblems:[]
});
const initial=()=>({v:4,curriculum:'elementary-to-high-3',selected:'ayoung',catalog:{},users:{ayoung:freshChild('아영'),inseong:freshChild('인성'),guest:freshChild('게스트')},updatedAt:Date.now()});
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
async function cloudSave(silent=true){
 if(!authUser||saving)return; saving=true; state.updatedAt=Date.now(); localSave();
 const {error}=await sb.from('app_state').upsert({user_id:authUser.id,state,updated_at:new Date().toISOString()});
 saving=false; $('cloudPill').textContent=error?'저장 오류':'클라우드 저장됨'; $('cloudPill').classList.toggle('on',!error);
 if(error&&!silent) alert('클라우드 저장에 실패했어요. 인터넷 연결을 확인해 주세요.');
}
async function expandCatalog(band=3,mode='daily',count=24){
 if(!authUser)return 0;
 const {data}=await sb.auth.getSession(); const token=data.session?.access_token;
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
 for(const b0 of bands){
   const b=clamp(Math.round(b0),1,9);
   const cached=[...FIXED_CACHE.values()].filter(x=>x.band===b).map(x=>x.w);
   const exclude=[...new Set([...studiedWords,...cached])].slice(-2500);
   const {data,error}=await sb.rpc('get_curriculum_sample',{p_band:b,p_limit:Math.min(200,perBand),p_exclude:exclude});
   if(error)continue;
   for(const x of data||[]){
     if(FIXED_CACHE.has(x.word))continue;
     FIXED_CACHE.set(x.word,{
       w:x.word,d:x.definition,band:x.band,cat:x.domain,
       example:x.example||'',pair:x.confusion||'',contrast:x.contrast||'',source:'fixed'
     });
     added++;
   }
 }
 if(added)rebuildCatalog();
 return added;
}
async function ensureCatalog(band=3,mode='daily'){
 const b=clamp(Math.round(Number(band)||3),1,9);
 if(mode==='diagnostic'){
   await loadFixedCurriculum([1,2,3,4,5,6,7,8,9],80);
   return;
 }
 const bands=[b-1,b,b+1].filter(x=>x>=1&&x<=9);
 await loadFixedCurriculum(bands,180);
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
 const s=wordState(w.w); let p=s.wrong*5+(5-s.streak)*2+(s.seen?2:0);
 if(w.pair&&wordState(w.pair)?.wrong)p+=5; if(s.mastered)p-=12;
 return p+Math.random()*2;
}
function chooseNew(n=5){
 const target=child().difficulty;
 return WORDS.filter(w=>!(child().words[w.w]?.seen))
   .map(w=>({w,score:Math.abs((w.band||3)-target)*5+(w.source==='fixed'?-3:2)+Math.random()*4}))
   .sort((a,b)=>a.score-b.score).slice(0,n).map(x=>x.w);
}
function chooseReview(n=15){return WORDS.filter(w=>child().words[w.w]?.seen&&!child().words[w.w]?.mastered).sort((a,b)=>scorePriority(b)-scorePriority(a)).slice(0,n)}
function takeRandom(arr){
 if(!arr.length)return null;
 return arr[Math.floor(Math.random()*arr.length)];
}
function distractors(target,usedTexts=new Set(),reservedWords=new Set()){
 const pair=target.pair&&byWord(target.pair);
 const eligible=WORDS.filter(x=>
   x.w!==target.w &&
   !reservedWords.has(x.w) &&
   x.d && x.d!==target.d &&
   !usedTexts.has(x.d)
 );
 const chosen=[],chosenWords=new Set(),chosenCats=new Set();
 const add=x=>{
   if(!x||chosenWords.has(x.w)||usedTexts.has(x.d)||x.d===target.d)return false;
   chosen.push(x);chosenWords.add(x.w);chosenCats.add(x.cat||'');return true;
 };
 const closeSame=eligible.filter(x=>x.cat===target.cat&&Math.abs((x.band||3)-(target.band||3))<=1);
 const closeOther=eligible.filter(x=>x.cat!==target.cat&&Math.abs((x.band||3)-(target.band||3))<=1);
 const nearby=eligible.filter(x=>Math.abs((x.band||3)-(target.band||3))<=2);
 if(pair&&eligible.some(x=>x.w===pair.w)&&Math.random()<.55)add(pair);
 add(takeRandom(closeSame.filter(x=>!chosenWords.has(x.w))));
 add(takeRandom(closeOther.filter(x=>!chosenWords.has(x.w))));
 while(chosen.length<4){
   const pool=(nearby.length?nearby:eligible)
     .filter(x=>!chosenWords.has(x.w))
     .map(x=>({x,score:(chosenCats.has(x.cat||'')?2:0)+Math.random()*5}))
     .sort((a,b)=>a.score-b.score);
   if(!pool.length)break;
   add(pool[0].x);
 }
 if(chosen.length<3){
   for(const x of eligible.sort(()=>Math.random()-.5)){
     add(x);if(chosen.length>=4)break;
   }
 }
 return chosen.slice(0,4);
}
function clozeFromExample(w){
 const ex=String(w.example||'').trim();
 if(ex&&ex.includes(w.w)) return ex.replaceAll(w.w,'＿＿＿＿');
 return '';
}
function fallbackClozeContext(w){
 const ex=String(w.example||'').trim();
 if(ex&&ex.includes(w.w)){
   const blanked=ex.replaceAll(w.w,'＿＿＿＿');
   return blanked+' 앞뒤의 상황을 보면 빈칸에는 이 상황이나 개념을 가장 정확하게 나타내는 어휘가 들어갑니다.';
 }
 if(ex){
   return ex+' 이 상황을 가장 정확하게 나타내는 어휘를 생각해 보세요. 그 어휘를 빈칸에 넣으면 문맥이 자연스럽게 이어집니다: ＿＿＿＿';
 }
 return '다음 상황에 알맞은 어휘를 생각해 보세요. “'+String(w.d||'').replace(/[.。]$/,'')+'”라는 뜻이 문맥에 자연스럽게 드러나도록 빈칸에 한 단어를 넣습니다: ＿＿＿＿';
}
async function fetchClozeContexts(words){
 const map=new Map();
 if(!authUser||!words.length)return map;
 try{
   const {data}=await sb.auth.getSession(); const token=data.session?.access_token;
   if(!token)return map;
   const items=words.map((w,i)=>({id:String(i),word:w.w,definition:w.d,example:w.example||'',band:w.band||3,domain:w.cat||'국어'}));
   const r=await fetch('/api/cloze-contexts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({items})});
   if(!r.ok)return map;
   const j=await r.json();
   for(const x of j.items||[])map.set(Number(x.id),String(x.passage||''));
 }catch{}
 return map;
}
function makeQuestion(w,i,optionState=null,clozePassage=''){
 const subjective=i%2===1;
 if(subjective){
   const ctx=clozePassage||fallbackClozeContext(w);
   return {
     w,type:'cloze',label:'문맥 빈칸',
     q:'다음 지문을 읽고 빈칸에 들어갈 가장 알맞은 어휘를 직접 써 보세요.',
     ctx,open:true,hideWord:true,expectedAnswer:w.w
   };
 }
 const used=optionState?.usedTexts||new Set(),reserved=optionState?.reservedWords||new Set();
 const ds=distractors(w,used,reserved);
 const opts=[{t:w.d,ok:true},...ds.map(x=>({t:x.d,ok:false}))].sort(()=>Math.random()-.5);
 if(optionState)for(const o of opts)optionState.usedTexts.add(o.t);
 return {w,type:'meaning',label:'뜻 이해',q:'다음 중 “'+w.w+'”의 뜻으로 가장 알맞은 것은?',opts};
}
async function buildSession(mode='daily'){
 const c=child();
 if(mode==='level') await ensureCatalog(c.difficulty,'diagnostic'); else await ensureCatalog(c.difficulty,'daily');
 let pool=[];
 if(mode==='level'){
   const unseen=WORDS.filter(w=>!(c.words[w.w]?.seen));
   const byBand={1:[],2:[],3:[],4:[],5:[],6:[],7:[],8:[],9:[]};
   for(const w of unseen) (byBand[w.band||3]||(byBand[w.band||3]=[])).push(w);
   for(let b=1;b<=9;b++) byBand[b].sort(()=>Math.random()-.5);
   const mixed=[]; for(let round=0;round<5;round++)for(let b=1;b<=9;b++)if(byBand[b][round])mixed.push(byBand[b][round]);
   pool=mixed.slice(0,30);
 } else if(mode==='review'){
   pool=chooseReview(20); if(pool.length<12)pool=[...pool,...chooseNew(20-pool.length)];
 } else {
   pool=[...chooseNew(5),...chooseReview(15)];
 }
 if(pool.length<20) pool=[...pool,...WORDS.filter(w=>!pool.some(x=>x.w===w.w)).sort((a,b)=>Math.abs((a.band||3)-c.difficulty)-Math.abs((b.band||3)-c.difficulty)).slice(0,30-pool.length)];
 const optionState={usedTexts:new Set(),reservedWords:new Set(pool.map(w=>w.w))};
 const subjectiveWords=pool.filter((_,i)=>i%2===1);
 const ctxMap=await fetchClozeContexts(subjectiveWords);
 let subjectIndex=0;
 const queue=pool.map((w,i)=>{
   const ctx=i%2===1?(ctxMap.get(subjectIndex++)||''):'';
   return makeQuestion(w,i,optionState,ctx);
 });
 session={mode,queue,results:[],target:20,max:30,difficulty:c.difficulty,ability:clamp(c.difficulty||3,1,9)};
 current=0; show('learn'); renderQuestion();
}
function renderQuestion(){
 if(current>=session.queue.length||current>=session.target){finishSession();return}
 const q=session.queue[current]; selectedOption=null; answerSource='typed';
 $('learnType').textContent=session.mode==='level'?'레벨 확인':session.mode==='review'?'집중 복습':'오늘의 학습';
 $('counter').textContent=(current+1)+'번째 문제'; $('progressBar').style.width=Math.round(current/session.target*100)+'%';
 $('qTag').textContent=q.label; $('difficulty').textContent=bandLabel(child().difficulty)+' · '+child().difficulty.toFixed(1); $('qWord').textContent=q.hideWord?'빈칸 어휘':q.w.w; $('qWord').classList.toggle('hidden',!!q.hideWord); $('qText').textContent=q.q;
 $('qContext').classList.toggle('hidden',!q.ctx); $('qContext').textContent=q.ctx||'';
 $('feedback').className='feedback hidden'; $('next').classList.add('hidden'); $('answer').value='';
 $('options').innerHTML=''; $('answer').classList.toggle('hidden',!q.open); $('voiceRow').classList.toggle('hidden',!q.open); $('submit').classList.toggle('hidden',!q.open); $('answer').placeholder=q.type==='cloze'?'빈칸에 들어갈 어휘를 써 보세요.':'답을 입력해 보세요.';
 if(q.opts) q.opts.forEach((o,i)=>{const b=document.createElement('button');b.className='option';b.textContent=o.t;b.onclick=()=>{if($('next').classList.contains('hidden')){selectedOption=i;document.querySelectorAll('.option').forEach((x,j)=>x.classList.toggle('selected',j===i));gradeCurrent(false)}};$('options').appendChild(b)});
}
function resultCredit(result){return result==='◎'||result==='○'?1:result==='△'?.5:result==='?'?.25:0}
function applyResult(q,result,feedback,normalized=''){
 const s=wordState(q.w.w),good=result==='◎'||result==='○'; s.seen++; s.last=result; s.types[q.type]=(s.types[q.type]||0)+1;
 if(good){s.correct++;s.streak++;if(!s.days.includes(today()))s.days.push(today())}else if(result==='△'){s.assisted++;s.streak=0}else{s.wrong++;s.streak=0}
 s.level=clamp(1+Math.floor(s.correct/2)-Math.floor(s.wrong/2),1,5);
 s.mastered=s.streak>=5&&s.days.length>=3&&s.level>=4;
 if(q.w.pair&&!good&&!s.confusions.includes(q.w.pair))s.confusions.push(q.w.pair);
 session.results.push({word:q.w.w,result,credit:resultCredit(result),type:q.type,band:q.w.band||3});
 const recent=session.results.slice(-6),bad=recent.filter(x=>(x.credit??resultCredit(x.result))<.75).length;
 if(session.mode==='level'){
   const answered=session.results.length;
   if(answered%4===0){
     const block=session.results.slice(-4),g=block.reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0);
     if(g>=3)session.ability=clamp(session.ability+.5,1,9); else if(g<=1.5)session.ability=clamp(session.ability-.5,1,9);
     const used=session.queue.slice(0,current+1),rest=session.queue.slice(current+1).sort((a,b)=>Math.abs((a.w.band||3)-session.ability)-Math.abs((b.w.band||3)-session.ability));
     session.queue=[...used,...rest];
   }
   if(answered===20){
     const ratio=session.results.reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0)/20;
     const last4=session.results.slice(-4).reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0);
     if((ratio>=.4&&ratio<=.8)||(last4>=1.5&&last4<=2.5))session.target=Math.min(25,session.queue.length);
   }else if(answered===25&&session.target===25){
     const last5=session.results.slice(-5).reduce((a,x)=>a+(x.credit??resultCredit(x.result)),0);
     if(last5>=2&&last5<=3.5)session.target=Math.min(30,session.queue.length);
   }
 }else{
   if(recent.length>=5){if(bad>=3)child().difficulty=clamp(child().difficulty-.3,1,9);else if(bad<=1)child().difficulty=clamp(child().difficulty+.2,1,9)}
   if(current>=14&&bad>=3&&session.target<session.max)session.target=Math.min(session.max,session.target+5);
 }
 $('feedback').className='feedback '+(good?'good':result==='×'?'bad':'');
 $('feedback').innerHTML='<strong>'+result+' '+(good?'좋아요!':result==='△'?'조금 더 다듬어 볼게요.':'다시 생각해 볼 단어예요.')+'</strong><br>'+feedback+(normalized&&normalized!==$('answer').value?'<br><small>제가 이해한 답: '+escapeHtml(normalized)+'</small>':'');
 $('feedback').classList.remove('hidden'); $('next').classList.remove('hidden'); $('submit').classList.add('hidden');
 cloudSave();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function gradeCurrent(dontKnow){
 const q=session.queue[current]; if(!$('next').classList.contains('hidden'))return;
 if(dontKnow){applyResult(q,'×','괜찮아요. 뜻은 “'+q.w.d+'”예요. 같은 문제를 바로 반복하지 않고 나중에 다른 문맥에서 다시 만나요.');return}
 if(q.opts){
   if(selectedOption==null)return; const ok=q.opts[selectedOption].ok;
   document.querySelectorAll('.option').forEach((x,i)=>{if(q.opts[i].ok)x.classList.add('correct');else if(i===selectedOption&&!ok)x.classList.add('wrong')});
   applyResult(q,ok?'○':'×',ok?'문맥에 맞게 잘 골랐어요.':'정답의 핵심 뜻은 “'+q.w.d+'”입니다.'); return;
 }
 const answer=$('answer').value.trim(); if(!answer)return alert('답을 쓰거나 “모르겠어”를 눌러주세요.');
 if(q.type==='cloze'){
   const normalized=answer.replace(/[\s"'“”‘’.,!?()\[\]{}]/g,'').trim();
   const expected=String(q.expectedAnswer||q.w.w).replace(/[\s"'“”‘’.,!?()\[\]{}]/g,'').trim();
   if(normalized===expected){
     applyResult(q,'◎','문맥에 맞는 어휘를 정확히 넣었어요.',answer);
     return;
   }
   $('submit').disabled=true;$('submit').textContent='의미 확인 중…';
   try{
     const {data}=await sb.auth.getSession(); const token=data.session?.access_token;
     const r=await fetch('/api/grade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({
       taskType:'cloze_synonym',question:q.q+'\n지문: '+q.ctx,targetWord:q.w.w,definition:q.w.d,band:q.w.band||3,answer,source:answerSource
     })});
     if(r.ok){
       const j=await r.json();
       const result=j.result==='◎'||j.result==='○'?'△':(j.result==='△'?'△':'×');
       const feedback=result==='△'?'정답과 뜻이 비슷한 말이라 부분점수를 줬어요. 정확한 목표 어휘는 “'+q.w.w+'”입니다.':'정답은 “'+q.w.w+'”입니다. 지문의 단서를 다시 살펴보세요.';
       applyResult(q,result,feedback,j.normalizedAnswer||answer);
     }else applyResult(q,'×','정답은 “'+q.w.w+'”입니다. 지문의 단서를 다시 살펴보세요.',answer);
   }catch{
     applyResult(q,'×','정답은 “'+q.w.w+'”입니다. 지문의 단서를 다시 살펴보세요.',answer);
   }finally{$('submit').disabled=false;$('submit').textContent='채점하기'}
   return;
 }
 $('submit').disabled=true;$('submit').textContent='AI 채점 중…';
 try{
   const {data}=await sb.auth.getSession(); const token=data.session?.access_token;
   const r=await fetch('/api/grade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({question:q.q+(q.ctx?'\n상황: '+q.ctx:''),targetWord:q.w.w,definition:q.w.d,band:q.w.band||3,gradingContext:q.gradingContext||'',answer,source:answerSource})});
   if(r.ok){const j=await r.json();applyResult(q,j.result||'△',j.feedback||'답을 확인했어요.',j.normalizedAnswer||answer)}
   else{fallbackOpen(q,answer)}
 }catch{fallbackOpen(q,answer)}
 finally{$('submit').disabled=false;$('submit').textContent='채점하기'}
}
function fallbackOpen(q,answer){
 const key=q.w.w,def=q.w.d; const words=def.replace(/[.,()]/g,'').split(/\s+/).filter(x=>x.length>=2).slice(0,5);
 const hit=answer.includes(key)||words.some(x=>answer.includes(x)); applyResult(q,hit?'△':'×',hit?'AI 연결 전이라 임시 채점했어요. 뜻의 방향은 맞아 보여요.':'AI 연결 전이라 임시 채점했어요. 핵심 뜻을 다시 확인해 보세요: '+def,answer);
}
function nextQuestion(){current++;renderQuestion()}
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
 cloudSave(); renderAll(); show(state.selected==='guest'?'home':'report');
 alert((session.mode==='level'?'레벨 확인':'학습')+' 완료! '+score+'점'+(session.mode==='level'?' · 시작 단계 '+bandLabel(c.difficulty):''));
 if(session.mode!=='level')setTimeout(()=>ensureCatalog(c.difficulty,'daily'),400);
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
 $('wordList').innerHTML=arr.length?arr.map(w=>{const s=c.words[w.w];return '<div class="item row between"><div><strong>'+w.w+'</strong><br><small>'+w.d+'</small><br><small>정답 '+s.correct+' · 오답 '+s.wrong+' · '+s.days.length+'일 학습</small></div><span class="tag">Lv.'+s.level+(s.mastered?' 숙달':'')+'</span></div>'}).join(''):'<div class="card muted">아직 학습 기록이 없어요.</div>';
}
function renderReport(){
 const reportId=['ayoung','inseong'].includes(reportProfile)?reportProfile:(['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung'); reportProfile=reportId; const c=state.users[reportId],studied=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0),weak=[...studied].sort((a,b)=>(c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0)).slice(0,5),conf=[...new Set(weak.flatMap(w=>c.words[w.w]?.confusions||[]))].slice(0,4);
 $('reportTitle').textContent=c.name+' 부모 리포트';
 document.querySelectorAll('[data-report-profile]').forEach(b=>b.classList.toggle('active',b.dataset.reportProfile===reportId));
 $('reportBody').innerHTML='<div class="grid4"><div class="stat"><strong>'+(c.sessions[0]?.score??'-')+'</strong><span>최근 점수</span></div><div class="stat"><strong>'+studied.length+'</strong><span>학습 단어</span></div><div class="stat"><strong>'+studied.filter(w=>c.words[w.w]?.mastered).length+'</strong><span>숙달</span></div><div class="stat"><strong>'+c.difficulty.toFixed(1)+'</strong><span>현재 난이도</span></div></div><div class="card"><h3>다음 우선순위</h3><div class="list">'+(weak.length?weak.map(w=>'<div class="item"><strong>'+w.w+'</strong> <small>오답 '+c.words[w.w].wrong+'회 · '+w.d+'</small></div>').join(''):'<span class="muted">학습을 시작하면 자동으로 분석됩니다.</span>')+'</div></div><div class="card"><h3>부모용 한줄 요약</h3><p class="muted">'+(weak.length?'현재 '+weak.map(x=>x.w).join(', ')+'을 우선 복습하면 좋습니다. 현재 학습 단계는 '+bandLabel(c.difficulty)+'입니다.'+(conf.length?' 특히 '+conf.join(', ')+'과의 구별을 다시 확인합니다.':''):'아직 충분한 학습 기록이 없습니다.')+'</p></div>';
}
function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.go===id));if(id==='wordbook')renderWordbook();if(id==='report'){if(!['ayoung','inseong'].includes(reportProfile))reportProfile=['ayoung','inseong'].includes(state.selected)?state.selected:'ayoung';renderReport()}window.scrollTo({top:0,behavior:'smooth'})}
async function login(){setMsg('로그인 중…');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)setMsg('로그인 실패: 이메일과 비밀번호를 확인해 주세요.',true)}
async function signup(){const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6)return setMsg('이메일과 6자 이상의 비밀번호를 입력해 주세요.',true);setMsg('계정을 만드는 중…');const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg(data.session?'계정이 만들어졌어요.':'확인 메일을 보냈어요. 메일의 확인 링크를 눌러 주세요.')}
async function resendConfirm(){const email=$('email').value.trim();if(!email)return setMsg('먼저 이메일을 입력해 주세요.',true);setMsg('확인 메일을 다시 보내는 중…');const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg('새 확인 메일을 보냈어요. 가장 최근 메일의 링크를 눌러 주세요.')}
function setMsg(m,e=false){$('authMsg').textContent=m;$('authMsg').className='authmsg'+(e?' error':'')}
async function applyAuth(sessionObj){
 authUser=sessionObj?.user||null;$('authGate').classList.toggle('hidden',!!authUser);
 if(authUser){$('accountEmail').textContent=authUser.email||'가족 계정';try{await cloudLoad();$('cloudPill').textContent='클라우드 연결';$('cloudPill').classList.add('on');setTimeout(async()=>{await ensureCatalog(child().difficulty,'daily');const st=await curriculumStatus();if(st&&$('curriculumProgress')){const n=Object.values(st).reduce((a,b)=>a+Number(b||0),0);
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
document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.profile;localSave();cloudSave();renderAll()});
document.querySelectorAll('[data-report-profile]').forEach(b=>b.onclick=()=>{reportProfile=b.dataset.reportProfile;renderReport()});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));
$('startDaily').onclick=()=>buildSession('daily');$('startReview').onclick=()=>buildSession('review');$('levelTest').onclick=()=>buildSession('level');
$('submit').onclick=()=>gradeCurrent(false);$('dontKnow').onclick=()=>gradeCurrent(true);$('next').onclick=nextQuestion;$('mic').onclick=startVoice;
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
