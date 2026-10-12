import {learningDay,isRecordedVocabulary} from './learning-model.js';

export const STUDY_HISTORY_VERSION=1;
const count=x=>Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0;
const validDay=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'));
const emptyDay=()=>({activeMs:0,timeKnown:true,total:0,good:0,partial:0,wrong:0,unknown:0});
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
  if(!validDay(session.date))continue;
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
 active.studyStartedAt=Number.isFinite(active.studyStartedAt)?active.studyStartedAt:now;
 active.studyFallbackDay=validDay(active.studyFallbackDay)?active.studyFallbackDay:dayAt(active.studyStartedAt);
 active.studyDays=active.studyDays&&typeof active.studyDays==='object'?active.studyDays:{};
 if(!active.studyTimeInitialized){
  if(!Object.keys(active.studyDays).length&&Number(active.activeMs)>0)active.studyDays[active.studyFallbackDay]={activeMs:Math.round(Number(active.activeMs)),timeKnown:true};
  active.studyTimeInitialized=true;
 }
 if(!Number.isFinite(active.clockStarted))return;
 let cursor=active.clockStarted;const end=Math.max(cursor,now);
 while(cursor<end){
  const day=dayAt(cursor),boundary=Date.parse(day+'T00:00:00+09:00')+86400000,until=Math.min(end,boundary);
  const bucket=active.studyDays[day]||(active.studyDays[day]={activeMs:0,timeKnown:true});bucket.activeMs+=until-cursor;
  cursor=until;
 }
 active.activeMs=Math.max(0,Number(active.activeMs)||0)+end-active.clockStarted;
 active.clockStarted=end;
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
  if(credit>=1&&!result.hintUsed&&!result.revealed)row.good++;
  else if(credit>0)row.partial++;
  else row.wrong++;
 }
 if(!Object.keys(days).length)days[dayAt(now)]=emptyDay();
 history.entries[id]={id,mode:active.mode||'daily',source:'recorded',startedAt:active.studyStartedAt,updatedAt:now,status:completed||previous?.status==='completed'?'completed':'in_progress',
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
   const row=rows.get(date)||{date,activeMs:0,unknownTimes:0,total:0,good:0,partial:0,wrong:0,unknown:0,sessions:0,completed:0,ongoing:0,modes:new Set()};
   for(const key of ['activeMs','total','good','partial','wrong','unknown'])row[key]+=count(d[key]);
   if(d.timeKnown===false)row.unknownTimes++;
   row.sessions++;row.modes.add(entry.mode);
   if(entry.status==='completed'&&entry.completedDay===date)row.completed++;
   if(entry.status!=='completed')row.ongoing++;
   rows.set(date,row);
  }
 }
 return [...rows.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(row=>({...row,modes:[...row.modes],accuracy:row.total-row.unknown>0?Math.round(row.good/(row.total-row.unknown)*100):null}));
}
export function studyRangeSummary(rows){
 const summary=rows.reduce((total,row)=>{for(const key of ['activeMs','unknownTimes','total','good','partial','wrong','unknown'])total[key]+=row[key];return total},{activeMs:0,unknownTimes:0,total:0,good:0,partial:0,wrong:0,unknown:0});
 return {...summary,days:rows.length,accuracy:summary.total-summary.unknown>0?Math.round(summary.good/(summary.total-summary.unknown)*100):null};
}
export function formatStudyTime(ms){const seconds=Math.round(Math.max(0,Number(ms)||0)/1000),minutes=Math.floor(seconds/60);return minutes?minutes+'분'+(seconds%60?' '+seconds%60+'초':''):seconds+'초'}
