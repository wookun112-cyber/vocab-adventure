import {isStudyRound,roundState} from './study-rounds.js';
export * from './study-rounds.js';
import {learningDay,isRecordedVocabulary} from './learning-model.js';

export const STUDY_HISTORY_VERSION=1;
export const STUDY_IDLE_POLICY='activity-idle-10s-12.16.39';
export const STUDY_IDLE_LIMIT_MS=10000;
export const DAILY_STUDY_MAX_MS=25*60*1000;
const dailyAllowance=active=>active?.mode==='level'||!active?.dailyStudyLimit?Infinity:
 Math.max(0,active.dailyStudyLimit.remainingMs-Math.max(0,(Number(active.activeMs)||0)-active.dailyStudyLimit.baselineMs));
// Input renews the allowance only from the moment it actually occurs. Idle
// gaps are never retrospectively counted and hidden/grading states are gated by UI.
export function recordStudyActivity(active,now=Date.now()){
 if(!active)return;
 captureStudyClock(active,now);
 active.studyIdle={policy:STUDY_IDLE_POLICY,key:active.studyIdle?.key||'activity',remainingMs:STUDY_IDLE_LIMIT_MS};
 active.clockStarted=now;
}
const PREVIOUS_IDLE_POLICY='answer-submit-idle-30s-12.16.17';
const LEGACY_STUDY_IDLE_POLICY='answer-submit-idle-60s-12.16.16';
const boundedBudget=(value,limit)=>Math.max(0,Math.min(limit,Number(value)||0));
const windowBudget=active=>active?.studyIdle?.policy===STUDY_IDLE_POLICY
 ?boundedBudget(active.studyIdle.remainingMs,STUDY_IDLE_LIMIT_MS)
 :active?.studyIdle?.policy===PREVIOUS_IDLE_POLICY
  ?Math.max(0,boundedBudget(active.studyIdle.remainingMs,30000)-(30000-STUDY_IDLE_LIMIT_MS))
 :active?.studyIdle?.policy===LEGACY_STUDY_IDLE_POLICY
  ?Math.max(0,boundedBudget(active.studyIdle.remainingMs,60000)-(60000-STUDY_IDLE_LIMIT_MS)):Infinity;
export function pendingStudyMs(active,now=Date.now()){
 return Number.isFinite(active?.clockStarted)?Math.min(Math.max(0,now-active.clockStarted),windowBudget(active),dailyAllowance(active)):0;
}
export function activeStudyTime(active,now=Date.now()){
 return Math.max(0,Number(active?.activeMs)||0)+pendingStudyMs(active,now);
}
export function studyWindowRemaining(active,now=Date.now()){
 return Math.max(0,Math.min(windowBudget(active),dailyAllowance(active))-pendingStudyMs(active,now));
}
// Sum each lesson once, including an unsaved active lesson. Profiles keep their
// own histories; placement tests do not consume the daily practice allowance.
// The optional primary scope excludes voluntary review from the basic daily
// allowance. By default all real practice time remains visible in reports.
export function dailyStudyTime(learner,active=null,now=Date.now(),scope='all'){
 const day=dayAt(now),id=String(active?.lessonId||active?.id||''),entries=historyFor(learner).entries;
 const counts=mode=>mode!=='level'&&(scope!=='daily'||mode==='daily');
 let total=0;
 for(const [key,entry] of Object.entries(entries))if(counts(entry.mode)&&key!==id)total+=Math.max(0,Number(entry.days?.[day]?.activeMs)||0);
 if(active&&counts(active.mode)){
  const fallback=active.studyFallbackDay||dayAt(active.studyStartedAt||now);
  const own=Number(active.studyDays?.[day]?.activeMs)||(!Object.keys(active.studyDays||{}).length&&fallback===day?Number(active.activeMs)||0:0);
  const pending=Number.isFinite(active.clockStarted)?Math.max(0,Math.min(active.clockStarted+pendingStudyMs(active,now),now)-Math.max(active.clockStarted,Date.parse(day+'T00:00:00+09:00'))):0;
  total+=Math.max(own+pending,Number(entries[id]?.days?.[day]?.activeMs)||0);
 }
 return total;
}
export function bindDailyStudyLimit(learner,active,now=Date.now()){
 if(!active||active.mode==='level')return;
 if(isStudyRound(active)){
  captureStudyClock(active,now);active.dailyStudyLimit=null;
  const elapsed=Number(active.activeMs)||0,limit=roundState(active,elapsed).limitMs;
  active.dailyStudyLimit={day:dayAt(now),baselineMs:elapsed,remainingMs:Math.max(0,limit-elapsed)};return;
 }
 captureStudyClock(active,now);
 active.dailyStudyLimit={day:dayAt(now),baselineMs:Number(active.activeMs)||0,remainingMs:Math.max(0,DAILY_STUDY_MAX_MS-dailyStudyTime(learner,active,now,'daily'))};
}
export function beginStudyWindow(active,key,now=Date.now(),renew=false){
 if(!active)return;
 captureStudyClock(active,now);
 // Repainting a hint, restoring a draft, or reopening the same unanswered
 // question retains the original unused allowance rather than granting time.
 if(renew||active.studyIdle?.policy!==STUDY_IDLE_POLICY||active.studyIdle.key!==key)
  active.studyIdle={policy:STUDY_IDLE_POLICY,key,remainingMs:STUDY_IDLE_LIMIT_MS};
}
const count=x=>Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0;
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'));
const emptyDay=()=>({activeMs:0,timeKnown:true,total:0,good:0,partial:0,wrong:0,unknown:0,assessmentAttempts:0,assessmentCorrect:0,upperAttempts:0,upperCorrect:0});
const dayAt=timestamp=>learningDay(new Date(timestamp));
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value}
function fingerprint(value){let hash=2166136261;for(const ch of JSON.stringify(canonical(value)))hash=Math.imul(hash^ch.charCodeAt(0),16777619);return (hash>>>0).toString(16)}

// A completed legacy session is imported once, with its recorded time only.
// Weighted scores cannot reconstruct missing full-correct counts.
export function historyFor(learner){
 const original=learner?.studyHistory;
 const history=original?.version===STUDY_HISTORY_VERSION&&original.entries&&typeof original.entries==='object'?JSON.parse(JSON.stringify(original)):{version:STUDY_HISTORY_VERSION,entries:{}};
 const occurrences=new Map();
 for(const session of learner?.sessions||[]){
  if(!validDay(session.date)||session.sourceLessonId&&history.entries[session.sourceLessonId])continue;
  const key=fingerprint(session),ordinal=occurrences.get(key)||0;occurrences.set(key,ordinal+1);
  const id=String(session.lessonId||session.levelAdjustment?.lessonId||'legacy:'+key+':'+ordinal);
  if(history.entries[id])continue;
  const total=count(session.total),hasCounts=Number.isFinite(session.good)&&Number.isFinite(session.wrong);
  const good=hasCounts?Math.min(total,count(session.good)):0,wrong=hasCounts?Math.min(total-good,count(session.wrong)):0;
  const timeKnown=typeof session.activeMinutes==='number'&&Number.isFinite(session.activeMinutes)&&session.activeMinutes>=0;
  history.entries[id]={id,mode:['daily','review','level'].includes(session.mode)?session.mode:'daily',source:'legacy',status:'completed',completedDay:session.date,updatedAt:0,
   days:{[session.date]:{activeMs:timeKnown?Math.round(session.activeMinutes*60000):0,timeKnown,total,good,wrong,partial:hasCounts?total-good-wrong:0,unknown:hasCounts?0:total}}};
 }
 return history;
}

export function captureStudyClock(active,now=Date.now()){
 if(!active)return;
 // Shorten an existing window without replenishing time or rewriting history.
 if([LEGACY_STUDY_IDLE_POLICY,PREVIOUS_IDLE_POLICY].includes(active.studyIdle?.policy))
  active.studyIdle={...active.studyIdle,policy:STUDY_IDLE_POLICY,remainingMs:windowBudget(active)};
 active.studyStartedAt=Number.isFinite(active.studyStartedAt)?active.studyStartedAt:now;
 active.studyFallbackDay=validDay(active.studyFallbackDay)?active.studyFallbackDay:dayAt(active.studyStartedAt);
 active.studyDays=active.studyDays&&typeof active.studyDays==='object'?active.studyDays:{};
 if(!active.studyTimeInitialized){
  if(!Object.keys(active.studyDays).length&&Number(active.activeMs)>0)active.studyDays[active.studyFallbackDay]={activeMs:Math.round(Number(active.activeMs)),timeKnown:true};
  active.studyTimeInitialized=true;
 }
 if(!Number.isFinite(active.clockStarted))return;
 const started=active.clockStarted,elapsed=pendingStudyMs(active,now),budget=windowBudget(active);
 let cursor=started;const end=started+elapsed;
 while(cursor<end){
  const day=dayAt(cursor),boundary=Date.parse(day+'T00:00:00+09:00')+86400000,until=Math.min(end,boundary);
  const bucket=active.studyDays[day]||(active.studyDays[day]={activeMs:0,timeKnown:true});bucket.activeMs+=until-cursor;
  cursor=until;
 }
 active.activeMs=Math.max(0,Number(active.activeMs)||0)+elapsed;
 if(Number.isFinite(budget))active.studyIdle.remainingMs=Math.max(0,budget-elapsed);
 active.clockStarted=windowBudget(active)>0?Math.max(started,now):null;
}

export function recordStudySession(learner,active,now=Date.now(),completed=false){
 if(!active?.lessonId)return false;
 captureStudyClock(active,now);
 const history=historyFor(learner),id=String(active.lessonId),previous=history.entries[id];
 if(previous?.status==='completed'){learner.studyHistory=history;return false}
 const days=Object.fromEntries(Object.entries(active.studyDays||{}).filter(([date])=>validDay(date)).map(([date,values])=>[date,{...emptyDay(),activeMs:Math.max(0,Math.round(Number(values.activeMs)||0)),timeKnown:values.timeKnown!==false}]));
 for(const result of active.results||[]){
  if(result.excludedFromVocabulary||result.word&&!isRecordedVocabulary(result.word))continue;
  const date=validDay(result.studyDate)?result.studyDate:Number.isFinite(result.answeredAt)?dayAt(result.answeredAt):active.studyFallbackDay;
  const row=days[date]||(days[date]=emptyDay());
  const credit=Number.isFinite(result.credit)?result.credit:['◎','○'].includes(result.result)?1:result.result==='△'?.5:0;
  row.total++;
  if(typeof result.practiceOnly==='boolean'){
   const field=result.assessmentEligible||!result.practiceOnly&&!result.hintUsed&&!result.revealed&&!result.remedial?'independentAttempts':'practiceAttempts';
   row[field]=(row[field]||0)+1;
  }
  if(result.assessmentEligible){
   row.assessmentAttempts=(row.assessmentAttempts||0)+1;
   if(credit>=1&&!result.hintUsed&&!result.revealed)row.assessmentCorrect=(row.assessmentCorrect||0)+1;
   if(result.assessedUpper){
    row.upperAttempts=(row.upperAttempts||0)+1;
    if(credit>=1&&!result.hintUsed&&!result.revealed)row.upperCorrect=(row.upperCorrect||0)+1;
   }
  }
  if(credit>=1&&!result.hintUsed&&!result.revealed)row.good++;
  else if(credit>0)row.partial++;
  else row.wrong++;
 }
 if(!Object.keys(days).length)days[dayAt(now)]=emptyDay();
 history.entries[id]={id,roundPolicy:active.roundPolicy||null,roundNumber:active.roundNumber||null,roundEndReason:active.roundEndReason||null,unfinishedWords:active.unfinishedWords||[],mode:active.mode||'daily',source:'recorded',startedAt:active.studyStartedAt,updatedAt:now,status:completed||previous?.status==='completed'?'completed':'in_progress',
  ...(completed?{completedDay:dayAt(now),completedAt:now}:previous?.completedDay?{completedDay:previous.completedDay,completedAt:previous.completedAt}:{}),days};
 learner.studyHistory=history;
 return true;
}

// Combine snapshots, never add the same lesson twice. The answer tuple stays
// coherent; elapsed time can only grow for each lesson/day.
export function mergeStudyHistories(previous,next){
 const left=previous?.version===STUDY_HISTORY_VERSION?previous:{version:STUDY_HISTORY_VERSION,entries:{}},right=next?.version===STUDY_HISTORY_VERSION?next:{version:STUDY_HISTORY_VERSION,entries:{}};
 const merged=JSON.parse(JSON.stringify(left));merged.entries=merged.entries||{};
 for(const [id,entry] of Object.entries(right.entries||{})){
  const old=merged.entries[id];if(!old){merged.entries[id]=JSON.parse(JSON.stringify(entry));continue}
  if(old.status==='completed')continue;
  const newer=Number(entry.updatedAt||0)>=Number(old.updatedAt||0),chosen=newer?entry:old;
  const out={...old,...chosen,days:{...old.days}};
  for(const [date,d] of Object.entries(entry.days||{})){
   const before=old.days?.[date];if(!before){out.days[date]={...d};continue}
   const counts=count(d.total)>count(before.total)||count(d.total)===count(before.total)&&newer?d:before;
   out.days[date]={...counts,activeMs:Math.max(count(d.activeMs),count(before.activeMs)),timeKnown:d.timeKnown!==false||before.timeKnown!==false};
  }
  if(old.status==='completed'){out.status='completed';out.completedDay=old.completedDay;out.completedAt=old.completedAt}
  merged.entries[id]=out;
 }
 return merged;
}

export function dailyStudyRows(learner,{from='',to='',mode='study'}={}){
 const rows=new Map();
 for(const entry of Object.values(historyFor(learner).entries)){
  if(mode==='study'&&entry.mode==='level'||mode==='level'&&entry.mode!=='level')continue;
  for(const [date,d] of Object.entries(entry.days||{})){
   if(!validDay(date)||from&&date<from||to&&date>to)continue;
   const row=rows.get(date)||{date,activeMs:0,unknownTimes:0,total:0,good:0,partial:0,wrong:0,unknown:0,independentAttempts:0,practiceAttempts:0,assessmentAttempts:0,assessmentCorrect:0,upperAttempts:0,upperCorrect:0,activityUnknown:0,sessions:0,completed:0,ongoing:0,modes:new Set()};
   for(const key of ['activeMs','total','good','partial','wrong','unknown'])row[key]+=count(d[key]);
   row.independentAttempts+=count(d.independentAttempts);row.practiceAttempts+=count(d.practiceAttempts);
   for(const key of ['assessmentAttempts','assessmentCorrect','upperAttempts','upperCorrect'])row[key]+=count(d[key]);
   row.activityUnknown+=Math.max(0,count(d.total)-count(d.independentAttempts)-count(d.practiceAttempts));
   if(d.timeKnown===false)row.unknownTimes++;
   row.sessions++;row.modes.add(entry.mode);
   if(entry.status==='completed'&&entry.completedDay===date)row.completed++;
   if(entry.status!=='completed')row.ongoing++;
   rows.set(date,row);
  }
 }
 return [...rows.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(row=>({...row,modes:[...row.modes],accuracy:row.total-row.unknown>0?Math.round(row.good/(row.total-row.unknown)*100):null,assessmentAccuracy:row.assessmentAttempts?Math.round(row.assessmentCorrect/row.assessmentAttempts*100):null}));
}
export function studyRangeSummary(rows){
 const summary=rows.reduce((total,row)=>{for(const key of ['activeMs','unknownTimes','total','good','partial','wrong','unknown'])total[key]+=row[key];return total},{activeMs:0,unknownTimes:0,total:0,good:0,partial:0,wrong:0,unknown:0});
 return {...summary,days:rows.length,accuracy:summary.total-summary.unknown>0?Math.round(summary.good/(summary.total-summary.unknown)*100):null};
}
export function formatStudyTime(ms){const seconds=Math.round(Math.max(0,Number(ms)||0)/1000),minutes=Math.floor(seconds/60);return minutes?minutes+'분'+(seconds%60?' '+seconds%60+'초':''):seconds+'초'}
