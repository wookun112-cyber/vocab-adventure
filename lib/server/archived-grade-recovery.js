import {copiedUsageExample,recordLearningEvidence,researchSchedule,syncUnfinishedUsage,learningDay,isRecordedVocabulary} from '../learning-model.js';
import {recordStudySession} from '../study-history.js';

// Reconcile an already graded answer without reopening its lesson or changing
// today's ability. Old evidence must never undo a later successful use.
export function reconcileArchivedGrade(snapshot,grade,now=Date.now()){
 if(!snapshot?.job||![0,.5,1].includes(grade?.score)||typeof grade.contextSuccess!=='boolean')return null;
 const {job,plan}=snapshot,learner=structuredClone(snapshot.learner),lesson=structuredClone(snapshot.lesson);
 if(job.status==='applied'||!plan?.w||plan.w.w!==job.word||!isRecordedVocabulary(plan.w.w))return null;
 lesson.results=lesson.results||[];
 let prior=lesson.results.findIndex(r=>r.gradingPending&&r.gradingJobId===job.id);
 if(prior<0){
  // The durable submitted job can precede its UI placeholder when the app closes.
  if(!Number.isInteger(job.index)||job.index!==lesson.results.length||lesson.results.some(r=>r.gradingJobId===job.id))return null;
  prior=job.index;
 }
 const word=plan.w.w,st=learner.words[word]||(learner.words[word]={});
 const day=job.submittedDay||learningDay(new Date(job.submittedAt||now));
 const copied=grade.copiedExample===true||copiedUsageExample(job.answer,job.payload?.previousExamples||[]);
 const credit=job.hintUsed&&grade.score===1?.75:grade.score;
 const rec={word,type:plan.type,band:plan.w.band||3,result:credit>=1?'○':credit>0?'△':'×',credit,
  contextSuccess:grade.contextSuccess,targetRecall:plan.type==='subjective_use'?false:grade.targetRecall===true,
  independent:false,practiceOnly:true,levelEligible:false,hintUsed:!!job.hintUsed,revealed:copied,copiedExample:copied,
  answeredAt:job.submittedAt||now,studyDate:day,gradingJobId:job.id,rawAnswer:job.answer,
  feedback:grade.feedback||'',exampleAnswer:grade.exampleAnswer||'',recoveredFromArchive:true};
 st.seen=(st.seen||0)+1;st.types={...st.types,[plan.type]:(st.types?.[plan.type]||0)+1};
 const field=credit>=1?'correct':credit>0?'assisted':'wrong';st[field]=(st[field]||0)+1;
 if(grade.contextSuccess)st.contextSuccess=(st.contextSuccess||0)+1;
 const newer=(st.lastExposureAt||st.lastFeedbackDate||'')>day||Number(st.usageConfirmedStamp)>Number(job.submittedAt||0);
 const protectedDates={lastExposureAt:st.lastExposureAt,usageConfirmedAt:st.usageConfirmedAt};
 rec.evidence=recordLearningEvidence(learner,st,{...plan,showTarget:plan.type==='subjective_use'},rec,day);
 if(newer){for(const [k,v] of Object.entries(protectedDates))if(v&&v>day)st[k]=v}
 else {st.last=rec.result;st.lastFeedbackDate=day;researchSchedule(st,rec.evidence,rec,day);if(credit<1||copied)st.streak=0}
 if(rec.exampleAnswer)st.shownExamples=[...new Set([...(st.shownExamples||[]),rec.exampleAnswer])].slice(-30);
 lesson.results[prior]=rec;
 // A newer submission cannot be completed by an older recovered answer.
 syncUnfinishedUsage(learner,{...lesson,lessonId:lesson.id},now);
 recordStudySession(learner,{...lesson,lessonId:lesson.id,clockStarted:null},now);
 learner.preparationRevision=(learner.preparationRevision||0)+1;
 const summary=(learner.sessions||[]).find(s=>s.sourceLessonId===lesson.id&&s.date===day);
 if(summary){const rows=lesson.results.filter(r=>!r.excludedFromVocabulary&&r.studyDate===day);summary.total=rows.length;summary.good=rows.filter(r=>r.credit>=1).length;summary.wrong=rows.filter(r=>r.credit===0).length;summary.score=rows.length?Math.round(rows.reduce((n,r)=>n+(r.credit||0),0)/rows.length*100):null}
 return {learner,record:rec};
}
