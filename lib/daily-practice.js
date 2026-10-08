import {calibratedWord,isLearningTarget,inTargetBand,learningDay,reviewFloor,REVIEW_POLICY,selectLevelReviews,confirmedReviewWeakness} from './learning-model.js';

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
   taskDemand:isNew?'initial-practice':w.band<reviewFloor(level)?'foundation-review':level>4.5?'advanced':'standard',needsCard:isNew,
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

// Pure checkpoint migration: never creates results, changes words, or touches the current input.
export function applyPendingReviewPolicy(saved,learner){
 if(!['daily','review'].includes(saved?.mode)||saved.completionPolicy!==DAILY_POLICY||saved.reviewPolicy===REVIEW_POLICY)return saved;
 const next=Number(saved.nextIndex),plans=saved.plans||[],ready=new Map(saved.ready||[]);
 if(!Number.isInteger(next)||next!==(saved.results||[]).length)return saved;
 if(Array.from({length:saved.baseCount||plans.length},(_,i)=>i).some(i=>!ready.has(i)))return saved;
 const original=saved.baseWords||[],fresh=new Set(saved.newWords||[]),currentWord=plans[next]?.w?.w;
 const reviews=original.filter(w=>!fresh.has(w.w)),selected=selectLevelReviews(reviews,learner,20);
 const current=reviews.find(w=>w.w===currentWord),floor=reviewFloor(learner.difficulty);
 // A remote easy current item is a one-time carry, never a renewed completion target.
 const carry=current&&current.band<floor;
 if(carry){const at=selected.findIndex(w=>w.w===currentWord);if(at>=0)selected.splice(at,1)}
 const allowed=new Set([...fresh,...selected.map(w=>w.w)]);
 const kept=[],keptReady=[],deferred=[];let retainedBase=0;
 for(let i=0;i<plans.length;i++){
  if(i<=next||allowed.has(plans[i].w.w)){
   const at=kept.length;if(i<(saved.baseCount||plans.length))retainedBase++;kept.push(i<=next?plans[i]:{...plans[i],id:String(at)});if(ready.has(i))keptReady.push([at,ready.get(i)]);
  }else deferred.push({originalIndex:i,plan:plans[i],question:ready.get(i)||null,reason:'review_outside_window'});
 }
 return {...saved,reviewPolicy:REVIEW_POLICY,plans:kept,ready:keptReady,target:kept.length,baseCount:retainedBase,
  baseWords:original.filter(w=>allowed.has(w.w)),
  deferredReview:{policy:REVIEW_POLICY,originalBaseWords:original,originalTarget:saved.target,preservedCurrent:{index:next,word:currentWord},carriedCurrent:carry?{index:next,word:currentWord,oneTime:true}:null,items:deferred},
  pendingAnswer:saved.pendingAnswer||''};
}
