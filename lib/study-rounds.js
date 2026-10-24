import {usageCompleted} from './daily-practice.js';
export const LEGACY_ROUND_POLICY='round-25-errors-5-12.16.39';
export const ROUND_POLICY='round-adaptive-breadth-25-5-20261019';
export const BREADTH_POLICY=ROUND_POLICY;
export const ROUND_MIN_MS=20*60000,ROUND_MAX_MS=25*60000;
export const isStudyRound=a=>[ROUND_POLICY,LEGACY_ROUND_POLICY].includes(a?.roundPolicy)&&a.mode!=='level';
export const isBreadthRound=a=>a?.roundPolicy===BREADTH_POLICY&&a.mode!=='level';
const graded=r=>!r.excludedFromVocabulary&&!r.gradingPending&&Number.isFinite(r.credit);
export function roundHasErrors(a){return (a?.results||[]).some(r=>graded(r)&&(r.credit<1||r.hintUsed||r.revealed||r.copiedExample))}
export function roundUnfinished(a){
 if(isBreadthRound(a)&&!a.sentenceCyclePolicy){
  const results=a?.results||[];
  return (a?.baseWords||[]).filter(w=>{
   if(results.some(r=>r.word===w.w&&r.exclusionReason==='correct_cooldown'))return false;
   const last=results.findLast(r=>r.word===w.w&&!r.excludedFromVocabulary&&!r.gradingPending&&Number.isFinite(r.credit));
   // A single first-attempt recognition can finish today's encounter; it NEVER
   // creates independent recall, usage or long-term mastery.
   return !last||last.credit<.75||last.revealed||last.hintUsed;
  });
 }
 const results=a?.results||[],completed=usageCompleted(results);
 return (a?.baseWords||[]).filter(w=>{
  if(results.some(r=>r.word===w.w&&r.exclusionReason==='correct_cooldown'))return false;
  if(!completed.has(w.w))return true;
  const success=results.findLastIndex(r=>r.word===w.w&&usageCompleted([r]).has(w.w));
  return results.some((r,i)=>i>success&&r.word===w.w&&graded(r)&&(r.credit<1||r.hintUsed||r.revealed||r.copiedExample));
 });
}
export function roundState(a,elapsed=Number(a?.activeMs)||0){
 const unfinished=roundUnfinished(a),pending=(a?.gradingQueue||[]).some(j=>['pending','ready','sending'].includes(j.status));
 const readingDone=!isBreadthRound(a)||a.readingPractice?.completed===true;
 const complete=unfinished.length===0&&!pending&&readingDone;
 return {unfinished,pending,complete,hadErrors:roundHasErrors(a),phase:elapsed>=ROUND_MIN_MS?'correction':'basic',
  shouldEnd:elapsed>=ROUND_MAX_MS||elapsed>=ROUND_MIN_MS&&complete,
  reason:elapsed>=ROUND_MAX_MS&&!complete?'time_limit':'completed',limitMs:complete?ROUND_MIN_MS:ROUND_MAX_MS};
}
// Deterministic one-number-per-lesson registry. Old duplicate summary rows are
// retained for recovery, but never become separate rounds or double-count time.
export function organizeStudyRounds(learner,history,active=learner?.activeLesson){
 const registry=learner.studyRounds?.version===1?learner.studyRounds:{version:1,entries:{}};
 registry.entries=registry.entries||{};
 const candidates=new Map();
 for(const [id,e] of Object.entries(history?.entries||{})){
  if(e.mode==='level'||id.includes(':time-limit:'))continue;
  candidates.set(id,{id,day:Object.keys(e.days||{}).sort()[0]||e.completedDay||'',stamp:Number(e.startedAt)||Number(e.completedAt)||0});
 }
 for(const row of learner.pausedLessonIndex||[])if(!candidates.has(row.id))candidates.set(row.id,{id:row.id,day:row.day||'',stamp:0});
 const id=String(active?.lessonId||active?.id||'');
 if(id&&active.mode!=='level'&&!candidates.has(id))candidates.set(id,{id,day:active.studyFallbackDay||'',stamp:Number(active.studyStartedAt||active.created)||0});
 let number=Math.max(0,...Object.values(registry.entries).map(x=>Number(x.number)||0));
 for(const c of [...candidates.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.stamp-b.stamp||a.id.localeCompare(b.id)))if(!registry.entries[c.id])registry.entries[c.id]={number:++number,day:c.day};
 learner.studyRounds=registry;
 if(id&&registry.entries[id])active.roundNumber=registry.entries[id].number;
 return registry;
}
export function roundHistoryRows(learner,history){
 const registry=organizeStudyRounds(learner,history),active=learner.activeLesson;
 return Object.entries(registry.entries).map(([id,info])=>{
  const e=history?.entries?.[id],days=Object.entries(e?.days||{}),isActive=active?.id===id;
  const totals=days.reduce((sum,[,d])=>({ms:sum.ms+(Number(d.activeMs)||0),total:sum.total+(Number(d.total)||0),good:sum.good+(Number(d.good)||0),unknown:sum.unknown+(Number(d.unknown)||0)}),{ms:0,total:0,good:0,unknown:0});
  return {id,number:info.number,date:e?.completedDay||days.map(([d])=>d).sort().at(-1)||info.day,completed:e?.status==='completed',reason:e?.roundEndReason||null,
   activeMs:totals.ms,timeKnown:!!days.length&&days.every(([,d])=>d.timeKnown!==false),total:totals.total,accuracy:totals.total>totals.unknown?Math.round(totals.good/(totals.total-totals.unknown)*100):null,
   active:isActive,archived:!isActive&&e?.status!=='completed',legacy:e?.roundPolicy!==ROUND_POLICY,unfinished:e?.unfinishedWords||[]};
 }).sort((a,b)=>b.number-a.number);
}
