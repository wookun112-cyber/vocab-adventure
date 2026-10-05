import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL='https://qhqumfgbbsurgmlpyira.supabase.co';
const SUPABASE_KEY='sb_publishable_c7R0cHF0-lY7D7MA9xJoog_x6BLpUMN';
const sb=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const today=()=>new Date().toISOString().slice(0,10);

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
];
const byWord=w=>WORDS.find(x=>x.w===w);
const freshWord=()=>({seen:0,correct:0,wrong:0,assisted:0,streak:0,days:[],level:1,mastered:false,last:null,types:{},confusions:[]});
const freshChild=name=>({name,difficulty:2,confidence:0,learningDays:0,sessions:[],words:Object.fromEntries(SEED_WORDS.map(x=>[x.w,freshWord()])),lastDate:null,levelTestCompleted:false});
const initial=()=>({v:3,curriculum:'elementary-to-middle-3',selected:'ayoung',catalog:{},users:{ayoung:freshChild('아영'),inseong:freshChild('인성')},updatedAt:Date.now()});
let state=initial(),authUser=null,deferredPrompt=null,session=null,current=0,selectedOption=null,answerSource='typed',saving=false;

function child(){return state.users[state.selected]}
function wordState(w){return child().words[w]||(child().words[w]=freshWord())}
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
   if(!x?.w||seen.has(x.w))continue;
   seen.add(x.w);
   WORDS.push({...x,band:clamp(Number(x.band)||3,1,6)});
 }
}
function mergeState(raw){
 const base=initial(); const src=raw&&typeof raw==='object'?raw:{};
 base.catalog=src.catalog&&typeof src.catalog==='object'?src.catalog:{};
 base.selected=src.selected==='inseong'?'inseong':'ayoung';
 base.updatedAt=src.updatedAt||Date.now();
 for(const id of ['ayoung','inseong']){
   const childSrc=src.users?.[id]||{},dst=base.users[id];
   Object.assign(dst,childSrc);
   dst.words={...dst.words,...(childSrc.words||{})};
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
     state.catalog[x.w]={...x,band:clamp(Number(x.band)||band,1,6)};
     added++;
   }
   rebuildCatalog(); localSave(); await cloudSave();
   return added;
 }catch{return 0}
 finally{$('cloudPill').textContent=oldText||'클라우드 연결'}
}
async function ensureCatalog(band=3,mode='daily'){
 const b=clamp(Math.round(Number(band)||3),1,6);
 if(mode==='diagnostic'){
   const counts={1:0,2:0,3:0,4:0,5:0,6:0};
   for(const w of WORDS) if(!(child().words[w.w]?.seen)) counts[w.band||3]=(counts[w.band||3]||0)+1;
   if(Object.values(counts).some(n=>n<4)) await expandCatalog(3,'diagnostic',30);
   return;
 }
 const near=WORDS.filter(w=>Math.abs((w.band||3)-b)<=1 && !(child().words[w.w]?.seen)).length;
 if(near<18) await expandCatalog(b,'daily',24);
}
function scorePriority(w){
 const s=wordState(w.w); let p=s.wrong*5+(5-s.streak)*2+(s.seen?2:0);
 if(w.pair&&wordState(w.pair)?.wrong)p+=5; if(s.mastered)p-=12;
 return p+Math.random()*2;
}
function chooseNew(n=5){return WORDS.filter(w=>!(child().words[w.w]?.seen)).sort((a,b)=>Math.abs((a.band||3)-child().difficulty)-Math.abs((b.band||3)-child().difficulty)).slice(0,n)}
function chooseReview(n=15){return WORDS.filter(w=>child().words[w.w]?.seen&&!child().words[w.w]?.mastered).sort((a,b)=>scorePriority(b)-scorePriority(a)).slice(0,n)}
function distractors(target){
 const pair=target.pair&&byWord(target.pair); let list=WORDS.filter(x=>x.w!==target.w);
 list.sort((a,b)=>((pair&&a.w===pair.w)?-10:0)+Math.abs((a.band||3)-(target.band||3))-(((pair&&b.w===pair.w)?-10:0)+Math.abs((b.band||3)-(target.band||3))));
 return list.slice(0,3);
}
function makeQuestion(w,i){
 const band=w.band||3;
 const types=band>=4?['meaning','passage','distinguish','explain','sentence','context']:['meaning','context','distinguish','explain','sentence'];
 let type=types[i%types.length];
 if(w.pair&&i%3===2) type='distinguish';
 if(type==='meaning'){
   const ds=distractors(w),opts=[{t:w.d,ok:true},...ds.map(x=>({t:x.d,ok:false}))].sort(()=>Math.random()-.5);
   return {w,type,label:'뜻 이해',q:'다음 중 “'+w.w+'”의 뜻으로 가장 알맞은 것은?',opts};
 }
 if(type==='passage'){
   const ctx=w.example||('글쓴이는 여러 정보와 앞뒤 내용을 살펴 “'+w.w+'”이라는 표현을 사용했다.');
   return {w,type,label:'짧은 글 추론',q:'다음 문맥에서 “'+w.w+'”이 어떤 뜻으로 쓰였는지 자기 말로 설명해 보세요.',ctx,open:true};
 }
 if(type==='context'){
   const ctx=w.example||('친구들이 “'+w.w+'”이라는 말을 사용해야 할 상황을 이야기하고 있다.');
   return {w,type,label:'문맥 추론',q:'이 상황에서 “'+w.w+'”이 어떤 의미로 쓰였는지 설명해 보세요.',ctx,open:true};
 }
 if(type==='distinguish'&&w.pair){
   const p=byWord(w.pair);
   if(p){
     const opts=[{t:w.w+' — '+w.d,ok:true},{t:p.w+' — '+w.d,ok:false},{t:w.w+' — '+p.d,ok:false},{t:p.w+' — '+p.d,ok:false}].sort(()=>Math.random()-.5);
     return {w,type,label:'유사어 구별',q:'“'+w.w+'”과 “'+p.w+'”을 구별했을 때 옳은 설명을 고르세요.',opts};
   }
   if(w.contrast)return {w,type:'distinguish',label:'유사어 구별',q:'“'+w.w+'”과 “'+w.pair+'”의 차이를 설명해 보세요.',ctx:w.contrast,open:true};
 }
 if(type==='sentence') return {w,type,label:'문장 활용',q:'“'+w.w+'”을 넣어 뜻이 분명하게 드러나는 문장 하나를 만들어 보세요.',open:true};
 return {w,type:'explain',label:'자기 말 설명',q:'“'+w.w+'”이 무슨 뜻인지 친구에게 설명하듯 자기 말로 써 보세요.',open:true};
}
function buildSessionasync function buildSession(mode='daily'){
 const c=child();
 if(mode==='level') await ensureCatalog(c.difficulty,'diagnostic'); else await ensureCatalog(c.difficulty,'daily');
 let pool=[];
 if(mode==='level'){
   const unseen=WORDS.filter(w=>!(c.words[w.w]?.seen));
   const byBand={1:[],2:[],3:[],4:[],5:[],6:[]};
   for(const w of unseen) (byBand[w.band||3]||(byBand[w.band||3]=[])).push(w);
   for(let b=1;b<=6;b++) byBand[b].sort(()=>Math.random()-.5);
   const mixed=[]; for(let round=0;round<5;round++)for(let b=1;b<=6;b++)if(byBand[b][round])mixed.push(byBand[b][round]);
   pool=mixed.slice(0,30);
 } else if(mode==='review'){
   pool=chooseReview(20); if(pool.length<12)pool=[...pool,...chooseNew(20-pool.length)];
 } else {
   pool=[...chooseNew(5),...chooseReview(15)];
 }
 if(pool.length<20) pool=[...pool,...WORDS.filter(w=>!pool.some(x=>x.w===w.w)).sort((a,b)=>Math.abs((a.band||3)-c.difficulty)-Math.abs((b.band||3)-c.difficulty)).slice(0,30-pool.length)];
 session={mode,queue:pool.map((w,i)=>makeQuestion(w,i)),results:[],target:20,max:30,difficulty:c.difficulty,ability:clamp(c.difficulty||3,1,6)};
 current=0; show('learn'); renderQuestion();
}
function renderQuestion(){
 if(current>=session.queue.length||current>=session.target){finishSession();return}
 const q=session.queue[current]; selectedOption=null; answerSource='typed';
 $('learnType').textContent=session.mode==='level'?'레벨 확인':session.mode==='review'?'집중 복습':'오늘의 학습';
 $('counter').textContent=(current+1)+'번째 문제'; $('progressBar').style.width=Math.round(current/session.target*100)+'%';
 $('qTag').textContent=q.label; $('difficulty').textContent=bandLabel(child().difficulty)+' · '+child().difficulty.toFixed(1); $('qWord').textContent=q.w.w; $('qText').textContent=q.q;
 $('qContext').classList.toggle('hidden',!q.ctx); $('qContext').textContent=q.ctx||'';
 $('feedback').className='feedback hidden'; $('next').classList.add('hidden'); $('answer').value='';
 $('options').innerHTML=''; $('answer').classList.toggle('hidden',!q.open); $('voiceRow').classList.toggle('hidden',!q.open); $('submit').classList.toggle('hidden',!q.open);
 if(q.opts) q.opts.forEach((o,i)=>{const b=document.createElement('button');b.className='option';b.textContent=o.t;b.onclick=()=>{if($('next').classList.contains('hidden')){selectedOption=i;document.querySelectorAll('.option').forEach((x,j)=>x.classList.toggle('selected',j===i));gradeCurrent(false)}};$('options').appendChild(b)});
}
function applyResult(q,result,feedback,normalized=''){
 const s=wordState(q.w.w),good=result==='◎'||result==='○'; s.seen++; s.last=result; s.types[q.type]=(s.types[q.type]||0)+1;
 if(good){s.correct++;s.streak++;if(!s.days.includes(today()))s.days.push(today())}else if(result==='△'){s.assisted++;s.streak=0}else{s.wrong++;s.streak=0}
 s.level=clamp(1+Math.floor(s.correct/2)-Math.floor(s.wrong/2),1,5);
 s.mastered=s.streak>=5&&s.days.length>=3&&s.level>=4;
 if(q.w.pair&&!good&&!s.confusions.includes(q.w.pair))s.confusions.push(q.w.pair);
 session.results.push({word:q.w.w,result,type:q.type,band:q.w.band||3});
 const recent=session.results.slice(-6),bad=recent.filter(x=>!['◎','○'].includes(x.result)).length;
 if(session.mode==='level'){
   const answered=session.results.length;
   if(answered%4===0){
     const block=session.results.slice(-4),g=block.filter(x=>['◎','○'].includes(x.result)).length;
     if(g>=3)session.ability=clamp(session.ability+.5,1,6); else if(g<=1)session.ability=clamp(session.ability-.5,1,6);
     const used=session.queue.slice(0,current+1),rest=session.queue.slice(current+1).sort((a,b)=>Math.abs((a.w.band||3)-session.ability)-Math.abs((b.w.band||3)-session.ability));
     session.queue=[...used,...rest];
   }
   if(answered===20){
     const ratio=session.results.filter(x=>['◎','○'].includes(x.result)).length/20;
     const last4=session.results.slice(-4).filter(x=>['◎','○'].includes(x.result)).length;
     if((ratio>=.4&&ratio<=.8)||last4===2)session.target=Math.min(25,session.queue.length);
   }else if(answered===25&&session.target===25){
     const last5=session.results.slice(-5).filter(x=>['◎','○'].includes(x.result)).length;
     if(last5>=2&&last5<=3)session.target=Math.min(30,session.queue.length);
   }
 }else{
   if(recent.length>=5){if(bad>=3)child().difficulty=clamp(child().difficulty-.3,1,6);else if(bad<=1)child().difficulty=clamp(child().difficulty+.2,1,6)}
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
 $('submit').disabled=true;$('submit').textContent='AI 채점 중…';
 try{
   const {data}=await sb.auth.getSession(); const token=data.session?.access_token;
   const r=await fetch('/api/grade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({question:q.q+(q.ctx?'\n상황: '+q.ctx:''),targetWord:q.w.w,answer,source:answerSource})});
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
 const c=child(),r=session.results,total=r.length,good=r.filter(x=>['◎','○'].includes(x.result)).length,ind=r.filter(x=>x.result==='◎').length,wrong=r.filter(x=>x.result==='×').length,score=Math.round((good+ind*.25)/Math.max(1,total)*100);
 if(session.mode!=='level'){
   if(c.lastDate!==today()){c.learningDays++;c.lastDate=today()}
   c.sessions.unshift({date:today(),score,total,good,wrong,difficulty:c.difficulty});
   c.sessions=c.sessions.slice(0,60);
 }else{
   const weighted=r.reduce((sum,x)=>sum+((['◎','○'].includes(x.result)?1:0)*(x.band||3)),0);
   const goodN=Math.max(1,good);
   const evidence=good?weighted/goodN:1;
   c.difficulty=clamp((session.ability*0.65+evidence*0.35),1,6);
   c.confidence=clamp(total/30,0,1);
   c.levelTestCompleted=true;
 }
 cloudSave(); renderAll(); show('report');
 alert((session.mode==='level'?'레벨 확인':'학습')+' 완료! '+score+'점'+(session.mode==='level'?' · 시작 단계 '+bandLabel(c.difficulty):''));
 if(session.mode!=='level')setTimeout(()=>ensureCatalog(c.difficulty,'daily'),400);
}
function renderAll(){
 const c=child(); document.querySelectorAll('.profile').forEach(x=>x.classList.toggle('active',x.dataset.profile===state.selected));
 $('ayoungLevel').textContent='현재 단계 '+bandLabel(state.users.ayoung.difficulty)+' · '+state.users.ayoung.difficulty.toFixed(1); $('inseongLevel').textContent='현재 단계 '+bandLabel(state.users.inseong.difficulty)+' · '+state.users.inseong.difficulty.toFixed(1);
 $('hello').textContent=c.name+'의 오늘 탐험'; $('subtitle').textContent=c.name+' · '+bandLabel(c.difficulty)+' 단계';
 $('statScore').textContent=c.sessions[0]?.score??'-'; $('statWords').textContent=Object.values(c.words).filter(x=>x.seen>0).length; $('statMaster').textContent=Object.values(c.words).filter(x=>x.mastered).length; $('statDay').textContent=Math.max(1,c.learningDays);
 renderWordbook();renderReport();
}
function renderWordbook(){
 const c=child(),arr=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0).sort((a,b)=>((c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0))||((c.words[b.w]?.seen||0)-(c.words[a.w]?.seen||0)));
 $('wordList').innerHTML=arr.length?arr.map(w=>{const s=c.words[w.w];return '<div class="item row between"><div><strong>'+w.w+'</strong><br><small>'+w.d+'</small><br><small>정답 '+s.correct+' · 오답 '+s.wrong+' · '+s.days.length+'일 학습</small></div><span class="tag">Lv.'+s.level+(s.mastered?' 숙달':'')+'</span></div>'}).join(''):'<div class="card muted">아직 학습 기록이 없어요.</div>';
}
function renderReport(){
 const c=child(),studied=WORDS.filter(w=>(c.words[w.w]?.seen||0)>0),weak=[...studied].sort((a,b)=>(c.words[b.w]?.wrong||0)-(c.words[a.w]?.wrong||0)).slice(0,5),conf=[...new Set(weak.flatMap(w=>c.words[w.w]?.confusions||[]))].slice(0,4);
 $('reportBody').innerHTML='<div class="grid4"><div class="stat"><strong>'+(c.sessions[0]?.score??'-')+'</strong><span>최근 점수</span></div><div class="stat"><strong>'+studied.length+'</strong><span>학습 단어</span></div><div class="stat"><strong>'+studied.filter(w=>c.words[w.w]?.mastered).length+'</strong><span>숙달</span></div><div class="stat"><strong>'+c.difficulty.toFixed(1)+'</strong><span>현재 난이도</span></div></div><div class="card"><h3>다음 우선순위</h3><div class="list">'+(weak.length?weak.map(w=>'<div class="item"><strong>'+w.w+'</strong> <small>오답 '+c.words[w.w].wrong+'회 · '+w.d+'</small></div>').join(''):'<span class="muted">학습을 시작하면 자동으로 분석됩니다.</span>')+'</div></div><div class="card"><h3>부모용 한줄 요약</h3><p class="muted">'+(weak.length?'현재 '+weak.map(x=>x.w).join(', ')+'을 우선 복습하면 좋습니다. 현재 학습 단계는 '+bandLabel(c.difficulty)+'입니다.'+(conf.length?' 특히 '+conf.join(', ')+'과의 구별을 다시 확인합니다.':''):'아직 충분한 학습 기록이 없습니다.')+'</p></div>';
}
function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.go===id));if(id==='wordbook')renderWordbook();if(id==='report')renderReport();window.scrollTo({top:0,behavior:'smooth'})}
async function login(){setMsg('로그인 중…');const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)setMsg('로그인 실패: 이메일과 비밀번호를 확인해 주세요.',true)}
async function signup(){const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6)return setMsg('이메일과 6자 이상의 비밀번호를 입력해 주세요.',true);setMsg('계정을 만드는 중…');const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg(data.session?'계정이 만들어졌어요.':'확인 메일을 보냈어요. 메일의 확인 링크를 눌러 주세요.')}
async function resendConfirm(){const email=$('email').value.trim();if(!email)return setMsg('먼저 이메일을 입력해 주세요.',true);setMsg('확인 메일을 다시 보내는 중…');const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin}});if(error)return setMsg(error.message,true);setMsg('새 확인 메일을 보냈어요. 가장 최근 메일의 링크를 눌러 주세요.')}
function setMsg(m,e=false){$('authMsg').textContent=m;$('authMsg').className='authmsg'+(e?' error':'')}
async function applyAuth(sessionObj){
 authUser=sessionObj?.user||null;$('authGate').classList.toggle('hidden',!!authUser);
 if(authUser){$('accountEmail').textContent=authUser.email||'가족 계정';try{await cloudLoad();$('cloudPill').textContent='클라우드 연결';$('cloudPill').classList.add('on');setTimeout(()=>ensureCatalog(child().difficulty,'daily'),700)}catch(e){const loc=localStorage.getItem('vocab-adventure-v8');if(loc)state=mergeState(JSON.parse(loc));renderAll();$('cloudPill').textContent='로컬 모드'}} 
}
function startVoice(){
 const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return alert('이 브라우저에서는 음성입력을 지원하지 않아요. Chrome/Edge에서 사용해 주세요.');
 const r=new R();r.lang='ko-KR';r.interimResults=false;$('mic').classList.add('recording');$('mic').textContent='듣는 중…';
 r.onresult=e=>{$('answer').value=e.results[0][0].transcript;answerSource='voice'};r.onend=()=>{$('mic').classList.remove('recording');$('mic').textContent='🎤 음성 입력'};r.onerror=()=>{$('mic').classList.remove('recording');$('mic').textContent='🎤 음성 입력'};r.start();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installHint').textContent='지금 바로 앱으로 설치할 수 있어요.'});
$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else alert('브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 눌러주세요.')};
document.querySelectorAll('[data-profile]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.profile;localSave();cloudSave();renderAll()});
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));
$('startDaily').onclick=()=>buildSession('daily');$('startReview').onclick=()=>buildSession('review');$('levelTest').onclick=()=>buildSession('level');
$('submit').onclick=()=>gradeCurrent(false);$('dontKnow').onclick=()=>gradeCurrent(true);$('next').onclick=nextQuestion;$('mic').onclick=startVoice;
$('signIn').onclick=login;$('signUp').onclick=signup;$('resendConfirm').onclick=resendConfirm;$('password').addEventListener('keydown',e=>{if(e.key==='Enter')login()});
$('signOut').onclick=()=>sb.auth.signOut();$('syncNow').onclick=()=>cloudSave(false);
sb.auth.getSession().then(({data})=>applyAuth(data.session));sb.auth.onAuthStateChange((_e,s)=>setTimeout(()=>applyAuth(s),0));
if('serviceWorker'in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
renderAll();
