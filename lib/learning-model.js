// Shared, deterministic learning rules. These are app estimates, not a standardized test.
export const LEARNING_MODEL='12.0.0';
export const LEARNING_TYPES=['mc_context','mc_usage','subjective_context','subjective_dialogue','mc_relation','mc_structure','mc_reading','subjective_use'];
export const LEARNING_LABELS={mc_context:'문맥 선택',mc_usage:'쓰임 구별',subjective_context:'스스로 떠올리기',subjective_dialogue:'대화 속 회상',mc_relation:'의미 연결',mc_structure:'단어 구성',mc_reading:'새 글 이해',subjective_use:'내 문장 만들기'};
export const STAGE_LABELS={check:'지난 단어 확인',bridge:'의미 연결',recall:'간격을 둔 회상',transfer:'새 문맥에 적용',use:'직접 사용',diagnostic:'시작 수준 확인'};
export const STRUCTURE_NOTES={재사용:'재-는 다시라는 뜻이에요. 재사용은 이미 쓴 것을 다시 쓰는 것이에요.',재활용:'재-는 다시라는 뜻이에요. 재활용은 버리는 것을 다시 쓸 수 있게 만드는 것이에요.',불가능:'불-은 그렇지 않다는 뜻이에요. 불가능은 할 수 없다는 뜻이에요.',불필요:'불-은 그렇지 않다는 뜻이에요. 불필요는 필요하지 않다는 뜻이에요.',비공개:'비-는 그렇지 않다는 뜻이에요. 비공개는 모두에게 드러내지 않는 것이에요.',비공식:'비-는 그렇지 않다는 뜻이에요. 비공식은 공식적인 절차나 형식을 따르지 않는다는 뜻이에요.',맨손:'맨-은 아무것도 걸치거나 쥐지 않은 상태를 나타내요. 맨손은 아무것도 쥐지 않은 손이에요.',풋사과:'풋-은 아직 덜 익었다는 뜻이에요. 풋사과는 아직 덜 익은 사과예요.'};
export function learningDay(date=new Date()){return new Date(date.getTime()+9*3600000).toISOString().slice(0,10)}
export function daysBetween(a,b){if(!a||!b)return 0;const n=(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000;return Number.isFinite(n)?Math.max(0,Math.floor(n)):0}
export function dateAfter(day,n){return new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function studyBudget(learner,day=learningDay()){
 const studied=Object.values(learner.words||{}).filter(s=>s.seen>0||s.introducedAt);
 const due=studied.filter(s=>!s.nextReviewAt||s.nextReviewAt<=day).length;
 const taught=studied.filter(s=>s.introducedAt&&daysBetween(s.introducedAt,day)<7);
 const todayCount=taught.filter(s=>s.introducedAt===day).length;
 const newCount=Math.max(0,3-todayCount);
 return {policy:'daily-3-20-25',due,newCount,weeklyNew:taught.length,weeklyLimit:21,dailyLimit:3,target:20,minutes:20,maxMinutes:25,pauseMinutes:25,limit:20};
}
export function buildLearningPlan(newWords,reviewWords,total=20,mode='daily',getState=()=>({})){
 const plans=[],usage=new Map(),fresh=new Set(newWords.map(w=>w.w)),all=[...reviewWords,...newWords],cardAssigned=new Set();
 if(!all.length)return plans;
 const core=Math.min(20,total);
 let slot=0,last='';
 const pick=pool=>{
  const list=(pool.length?pool:all).slice().sort((a,b)=>(usage.get(a.w)||0)-(usage.get(b.w)||0));
  return list.find(w=>w.w!==last)||list[0];
 };
 const add=(w,type,stage)=>{
  if(!w||plans.length>=total)return;
  const st=getState(w.w)||{},needsCard=mode==='daily'&&fresh.has(w.w)&&!cardAssigned.has(w.w);
  if(needsCard)cardAssigned.add(w.w);
  plans.push({id:String(plans.length),type,w,stage,needsCard,structureNote:STRUCTURE_NOTES[w.w]||'',answerSlot:type.startsWith('mc_')?slot++%5:0,supportLevel:st.supportLevel||0,successStreak:st.streak||0,firstLearning:!st.seen&&!st.introducedAt});
  usage.set(w.w,(usage.get(w.w)||0)+1);last=w.w;
 };
 if(mode==='level'){
  for(let i=0;i<total;i++)add(pick(all),['mc_context','subjective_context','mc_usage','subjective_dialogue'][i%4],'diagnostic');
  return plans;
 }
 // Uncued review precedes every teaching card and meaning prompt.
 for(const w of reviewWords.slice(0,6))add(w,plans.length%2?'subjective_dialogue':'subjective_context','check');
 const bridgePool=reviewWords.length?reviewWords:newWords;
 for(let i=0;i<3&&plans.length<core-4;i++){
  const w=pick(bridgePool);add(w,STRUCTURE_NOTES[w.w]&&i%2===0?'mc_structure':i%2?'mc_usage':'mc_relation','bridge');
 }
 let freshIndex=0;
 while(plans.length<core-4){
  const w=freshIndex<newWords.length?newWords[freshIndex++]:pick(all);
  add(w,plans.length%2?'subjective_dialogue':'subjective_context','recall');
 }
 const applicationPool=newWords.length?newWords:all;
 for(let i=0;i<2;i++)add(pick(applicationPool),i%2?'subjective_context':'mc_reading','transfer');
 for(let i=0;i<2;i++)add(pick(applicationPool),'subjective_use','use');
 while(plans.length<total)add(pick(all),plans.length%2?'mc_usage':'subjective_context','bridge');
 return plans;
}
export function masteryConfirmed(st){return (st.independentRecallDays||[]).length>=3&&(st.retention7?.success||0)>=1&&(st.useDays||[]).length>=1}
export function recordLearningEvidence(learner,st,q,rec,day=learningDay()){
 const shown=!!q.showTarget,firstAttempt=!rec.practiceOnly,full=rec.credit>=1&&!rec.hintUsed&&!rec.revealed;
 const lag=daysBetween(st.lastExposureAt||st.lastFeedbackDate||st.introducedAt,day);
 const kind=q.type==='subjective_use'?'use':q.type==='mc_reading'?'transfer':q.type.startsWith('mc_')?'recognition':'recall';
 const success=full&&(kind==='recall'?rec.targetRecall:true);
 const unpromptedRecall=kind==='recall'&&!shown&&firstAttempt;
 const evidence={date:day,word:q.w.w,kind,success,lagDays:lag,band:q.w.band||3,independent:full&&!shown,firstAttempt};
 // Full sentences show the target and are never evidence of spontaneous recall.
 if(kind==='use'&&success){st.useDays=[...new Set([...(st.useDays||[]),day])];st.useSuccess=(st.useSuccess||0)+1}
 if(unpromptedRecall&&success)st.independentRecallDays=[...new Set([...(st.independentRecallDays||[]),day])];
 if(unpromptedRecall&&lag>=7){const key=lag>=30?'retention30':'retention7';st[key]={attempts:(st[key]?.attempts||0)+1,success:(st[key]?.success||0)+(success?1:0)}}
 learner.learningEvidence=[...(learner.learningEvidence||[]),evidence].slice(-400);
 st.researchMastered=masteryConfirmed(st);
 st.lastExposureAt=day;
 return {...evidence,unpromptedRecall};
}
export function researchSchedule(st,evidence,rec,day=learningDay()){
 if(rec.practiceOnly&&rec.credit>=1&&!rec.hintUsed&&!rec.revealed)return;
 let interval=1;
 if(evidence.unpromptedRecall&&evidence.success){
  if(st.lastIndependentRecallAt===day)return;
  const intervals=[1,3,7,14,30,60],stage=Math.min(5,st.recallStage||0);
  interval=intervals[stage];st.recallStage=Math.min(5,stage+1);st.lastIndependentRecallAt=day;
 }else if(rec.credit<1||rec.hintUsed||rec.revealed){st.recallStage=0}
 else{
  // Recognition and prompted use do not advance the direct-recall schedule.
  if(st.nextReviewAt&&st.nextReviewAt>day&&st.nextReviewAt<dateAfter(day,interval))return;
 }
 st.lastReviewAt=day;st.nextReviewAt=dateAfter(day,interval);
}
export function updateLearningLevels(learner,results,day=learningDay()){
 const previousLeague=Number(learner.leagueLevel??learner.difficulty)||2;
 const eligible=(learner.learningEvidence||[]).filter(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=1&&daysBetween(x.date,day)<=30);
 const current=eligible.filter(x=>x.date===day);
 if(current.length>=4&&learner.lastTeachingAdjustment!==day){
  const ratio=current.filter(x=>x.success).length/current.length;
  const delta=ratio>=.85?.15:ratio<.5?-.2:0;
  learner.difficulty=Math.max(1,Math.min(9,Math.round((learner.difficulty+delta)*100)/100));learner.lastTeachingAdjustment=day;
 }
 // Use the latest observation per word/day, across multiple days; never a rolling six-answer boost.
 const samples=[...new Map(eligible.map(x=>[x.date+'|'+x.word,x])).values()].slice(-24);
 if(samples.length>=12&&new Set(samples.map(x=>x.word)).size>=8&&new Set(samples.map(x=>x.date)).size>=3&&learner.lastLeagueAdjustment!==day){
  const ratio=samples.filter(x=>x.success).length/samples.length;
  const delta=ratio>=.85?.2:ratio<.45?-.2:0;
  const meanBand=samples.reduce((n,x)=>n+x.band,0)/samples.length;
  // Easy items cannot certify a harder tier; raising requires items around the current tier.
  const allowed=delta>0&&meanBand<previousLeague-.5?0:delta;
  learner.leagueLevel=Math.max(1,Math.min(9,Math.round((previousLeague+allowed)*10)/10));
  learner.lastLeagueAdjustment=day;learner.abilityEvidence={date:day,samples:samples.length,words:new Set(samples.map(x=>x.word)).size,days:new Set(samples.map(x=>x.date)).size,recallRate:ratio};
 }else if(learner.leagueLevel==null)learner.leagueLevel=previousLeague;
}
export function summarizeEvidence(learner){
 const entries=learner.learningEvidence||[];
 const stat=filter=>{const xs=entries.filter(filter);return {attempts:xs.length,success:xs.filter(x=>x.success).length,percent:xs.length?Math.round(xs.filter(x=>x.success).length/xs.length*100):null}};
 return {recognition:stat(x=>x.kind==='recognition'&&x.firstAttempt),recall:stat(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=1),use:stat(x=>x.kind==='use'),transfer:stat(x=>x.kind==='transfer'&&x.firstAttempt),retention7:stat(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=7&&x.lagDays<30),retention30:stat(x=>x.kind==='recall'&&x.firstAttempt&&x.lagDays>=30),mastered:Object.values(learner.words||{}).filter(masteryConfirmed).length};
}
