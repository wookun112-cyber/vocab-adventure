import {calibratedWord,isLearningTarget,inTargetBand,learningDay} from './learning-model.js';

export const DAILY_POLICY='daily-5-new-20-review-use-unlimited-12.15';
export function buildDailyPlan(newWords,reviewWords,getState=()=>({}),level=2){
 const seen=new Set(),fresh=new Set();
 const unique=(words,isNew)=>words.map(calibratedWord).filter(w=>{
  if(seen.has(w.w)||!isLearningTarget(w.w,w.cat,w.band)||(isNew&&!inTargetBand(w,level)))return false;
  seen.add(w.w);if(isNew)fresh.add(w.w);return true;
 });
 const newly=unique(newWords.slice(0,5),true),reviews=unique(reviewWords.slice(0,20),false);
 const ordered=[...reviews.slice(0,4),...newly,...reviews.slice(4)];
 let slot=0;
 return ordered.map((w,i)=>{
  const st=getState(w.w)||{},isNew=fresh.has(w.w),r=reviews.findIndex(v=>v.w===w.w);
  const type=isNew?'mc_usage':r<4?'subjective_recall':r%2?'subjective_use':'mc_usage';
  return {id:String(i),w,type,review:!isNew,stage:isNew?'practice':r<4?'check':type==='subjective_use'?'use':'bridge',
   taskDemand:isNew?'initial-practice':level>4.5?'advanced':'standard',needsCard:isNew,
   practiceOnly:!isNew&&!!st.nextReviewAt&&st.nextReviewAt>learningDay(),answerSlot:type.startsWith('mc_')?slot++%5:0,
   supportLevel:st.supportLevel||0,successStreak:st.streak||0,firstLearning:isNew};
 });
}
export function usageCompleted(results=[]){
 return new Set(results.filter(r=>!r.excludedFromVocabulary&&r.type==='subjective_use'&&r.credit>=1&&r.contextSuccess===true&&!r.hintUsed&&!r.revealed).map(r=>r.word));
}
export function usageLessonComplete(words,results){
 const targets=[...new Set((words||[]).filter(w=>isLearningTarget(w.w,w.cat,w.band)).map(w=>w.w))];
 const completed=usageCompleted(results);
 return targets.length>0&&targets.every(w=>completed.has(w));
}
export function nextUsagePlan(plan,results,index,state={}){
 if(usageCompleted(results).has(plan.w.w))return null;
 const previous=results.filter(r=>r.word===plan.w.w&&!r.excludedFromVocabulary).at(-1);
 // A failed sentence gets a different practice type; every other type returns
 // to productive use, even when its answer was correct. No attempt ceiling.
 const type=previous?.type==='subjective_use'?'mc_usage':'subjective_use';
 return {...plan,id:String(index),type,stage:type==='subjective_use'?'use':'bridge',needsCard:false,
  review:true,firstLearning:false,practiceOnly:true,remedial:true,answerSlot:index%5,
  taskDemand:plan.taskDemand==='initial-practice'?'standard':plan.taskDemand,
  supportLevel:state.supportLevel||0,successStreak:state.streak||0,
  contextSeed:'이전 문제와 다른 사건과 문장으로 뜻과 쓰임을 확인하세요. 재연습 '+results.filter(r=>r.word===plan.w.w).length};
}
