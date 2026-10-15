import {enrichBankWideReasons} from './bank-wide-feedback.js';
import {AUTHORED_OWNER} from '../authored-policy.js';
import {authoredEntry,authoredCurriculum} from '../../api/authored-bank.js';
import {QUESTION_POLICY,calibratedWord,inTargetBand,isCoveragePlan,isLearningTarget,sentenceWritingTask} from '../learning-model.js';
import {passageKeys} from '../prepared-plan.js';
import {offlineSupplementRows,OFFLINE_BANK_REVISION} from './offline-bank-supplement.js';
const canonical=authoredCurriculum(AUTHORED_OWNER).map(row=>row.word==='예측하다'?{...row,word:'예측',canonicalWord:'예측하다'}:row);
export const OFFLINE_ROWS=offlineSupplementRows(canonical).map(row=>{
 if(!row.canonicalWord)return row;
 return {...row,word:row.canonicalWord,answerForm:'예측',questions:row.questions.map(q=>({...q,prompt:q.prompt.replace('‘예측’','‘예측하다’'),acceptedAnswers:q.type==='subjective_use'?[]:[...new Set([row.canonicalWord,...q.acceptedAnswers])]}))};
});
for(const row of OFFLINE_ROWS)for(const q of row.questions)for(const o of q.options||[])if(!o.correct)delete o.reason;
export const offlineFeedbackStats=Object.freeze(enrichBankWideReasons(OFFLINE_ROWS));
const byWord=new Map(OFFLINE_ROWS.map(row=>[row.word,row]));
const norm=value=>String(value||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
export function offlineAuthoredEntry(plan,learner,account,reserved=[]){
 const ordinary=authoredEntry(plan,learner,account,reserved);if(ordinary)return ordinary;
 if(account!==AUTHORED_OWNER)return null;
 const row=byWord.get(plan.w.w);if(!row)return null;
 const w=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain});
 if(!isLearningTarget(w.w,w.cat,w.band)||w.d!==plan.w.d||w.band!==plan.w.band||(!plan.review&&!inTargetBand(w,learner.difficulty)&&!isCoveragePlan(plan)))return null;
 if(plan.needsCard&&!row.example)return null;
 const st=learner.words?.[w.w]||{},history=st.problemHistory||[],held=reserved.filter(q=>q.w?.w===w.w);
 const used=new Set([...(st.usedPassageKeys||[]),...history.flatMap(h=>passageKeys(h.context,h.options||[])),...held.flatMap(q=>passageKeys(q.ctx,(q.opts||[]).map(o=>o.t)))]);
 const signatures=new Set([...history.map(h=>h.signature),...held.map(q=>q.signature)]),contexts=new Set([...history.map(h=>norm(h.context)),...held.map(q=>norm(q.ctx))].filter(Boolean));
 for(const slot of row.questions.filter(q=>q.type===plan.type)){
  const own=slot.type==='subjective_use',task=own?sentenceWritingTask(w.w):null;
  const signature=OFFLINE_BANK_REVISION+':'+w.w+':'+slot.slot,ctx=own?'':slot.context;
  if(!own&&(signatures.has(signature)||(norm(ctx)&&contexts.has(norm(ctx)))||passageKeys(ctx,(slot.options||[]).map(o=>o.text)).some(k=>used.has(k))))continue;
  const opts=(slot.options||[]).map(o=>({t:o.text,ok:o.correct,reason:o.reason||''}));
  if(opts.length){const [correct]=opts.splice(opts.findIndex(o=>o.ok),1);opts.splice(Math.max(0,Math.min(4,Number(plan.answerSlot)||0)),0,correct)}
  const answerForm=row.answerForm||w.w;
  const question={w:plan.w,type:slot.type,stage:plan.stage,taskDemand:plan.taskDemand,needsCard:!!plan.needsCard,practiceOnly:!!plan.practiceOnly,review:!!plan.review,
   q:own?task.prompt:slot.prompt,ctx,opts,acceptedAnswers:own?[]:slot.acceptedAnswers.map(text=>({text,credit:1,targetRecall:text===w.w||text===answerForm,rationale:'사전 제작 문항의 인정 답안'})),
   showTarget:own||slot.type==='mc_usage',open:slot.type.startsWith('subjective_'),hideWord:!own&&slot.type!=='mc_usage',label:own?'내 문장 만들기':slot.type==='subjective_recall'?'문맥에서 떠올리기':'뜻과 쓰임',answerForm,
   hints:own?task.hints:['글에 나온 판단 근거나 확인 여부를 살펴보세요.','앞뒤 문장의 시점과 단서를 다시 읽어 보세요.'],feedbackCorrect:slot.explanation,signature,
   learningCard:plan.needsCard?{definition:row.definition,example:row.example,nonExample:'비슷한 말이라도 핵심 뜻이 다르면 이 단어를 쓰지 않아요.',structureNote:row.contrast||''}:null,
   authored:{revision:OFFLINE_BANK_REVISION,owner:account,word:w.w,slot:slot.slot,band:w.band,sourceBand:row.band},semanticGraderRequired:own,allowNaturalDerivations:[],
   validation:{policy:QUESTION_POLICY,source:'authored_bank',sourceRevision:OFFLINE_BANK_REVISION,deterministic:true,schemaChecked:true,aiVerified:false,independentReviewComplete:false},
   bankReaderLevel:Number(learner.difficulty),bankSupportLevel:Number(plan.supportLevel)||0};
  return {readerLevel:Number(learner.difficulty),supportLevel:Number(plan.supportLevel)||0,question};
 }
 return null;
}
export function savedOfflineChoiceFeedback(q,account){
 if(account!==AUTHORED_OWNER||q?.authored?.owner!==account||q.authored.revision!==OFFLINE_BANK_REVISION)return null;
 const row=byWord.get(q.w?.w),slot=row?.questions.find(s=>s.slot===q.authored.slot);
 if(!slot||!slot.type.startsWith('mc_')||q.type!==slot.type||q.w.d!==row.definition||q.q!==slot.prompt||q.ctx!==slot.context)return null;
 const key=options=>JSON.stringify(options.map(o=>[o.text,!!o.correct]).sort((a,b)=>a[0].localeCompare(b[0])));
 if(key((q.opts||[]).map(o=>({text:o.t,correct:o.ok})))!==key(slot.options))return null;
 return slot.options.filter(o=>!o.correct).map(o=>({text:o.text,reason:o.reason}));
}
