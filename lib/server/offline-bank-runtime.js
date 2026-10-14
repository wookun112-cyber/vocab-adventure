import {AUTHORED_OWNER} from '../authored-policy.js';
import {authoredEntry,authoredCurriculum} from '../../api/authored-bank.js';
import {QUESTION_POLICY,calibratedWord,inTargetBand,isCoveragePlan,isLearningTarget,sentenceWritingTask} from '../learning-model.js';
import {passageKeys} from '../prepared-plan.js';
import {offlineSupplementRows,OFFLINE_BANK_REVISION} from './offline-bank-supplement.js';
export const OFFLINE_ROWS=offlineSupplementRows(authoredCurriculum(AUTHORED_OWNER));
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
  if(!own&&(signatures.has(signature)||contexts.has(norm(ctx))&&norm(ctx)||passageKeys(ctx,(slot.options||[]).map(o=>o.text)).some(k=>used.has(k))))continue;
  const opts=(slot.options||[]).map(o=>({t:o.text,ok:o.correct,reason:o.reason||''}));
  if(opts.length){const [correct]=opts.splice(opts.findIndex(o=>o.ok),1);opts.splice(Math.max(0,Math.min(4,Number(plan.answerSlot)||0)),0,correct)}
  const question={w:plan.w,type:slot.type,stage:plan.stage,taskDemand:plan.taskDemand,needsCard:!!plan.needsCard,practiceOnly:!!plan.practiceOnly,review:!!plan.review,
   q:own?task.prompt:slot.prompt,ctx,opts,acceptedAnswers:own?[]:slot.acceptedAnswers.map(text=>({text,credit:1,targetRecall:text===w.w,rationale:'사전 제작 문항의 인정 답안'})),
   showTarget:own||slot.type==='mc_usage',open:slot.type.startsWith('subjective_'),hideWord:!own&&slot.type!=='mc_usage',label:own?'내 문장 만들기':slot.type==='subjective_recall'?'문맥에서 떠올리기':'뜻과 쓰임',answerForm:w.w,
   hints:own?task.hints:['글에 나온 판단 근거나 확인 여부를 살펴보세요.','앞뒤 문장의 시점과 단서를 다시 읽어 보세요.'],feedbackCorrect:slot.explanation,signature,
   learningCard:plan.needsCard?{definition:row.definition,example:row.example,nonExample:'비슷한 말이라도 핵심 뜻이 다르면 이 단어를 쓰지 않아요.',structureNote:row.contrast||''}:null,
   authored:{revision:OFFLINE_BANK_REVISION,owner:account,word:w.w,slot:slot.slot,band:w.band,sourceBand:row.band},semanticGraderRequired:own,allowNaturalDerivations:[],
   validation:{policy:QUESTION_POLICY,source:'authored_bank',sourceRevision:OFFLINE_BANK_REVISION,deterministic:true,schemaChecked:true,aiVerified:false,independentReviewComplete:false},
   bankReaderLevel:Number(learner.difficulty),bankSupportLevel:Number(plan.supportLevel)||0};
  return {readerLevel:Number(learner.difficulty),supportLevel:Number(plan.supportLevel)||0,question};
 }
 return null;
}
