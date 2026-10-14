import {levelNineArchive} from '../lib/server/level-nine-bank-data.js';
import {recallQuestion} from '../lib/sentence-use-template.js';
import {gunzipSync} from 'node:zlib';
import {archive} from './authored-bank-data.js';
import {essentialArchive} from '../lib/server/essential-bank-data.js';
import {levelFiveSixArchive} from '../lib/server/level-five-six-bank-data.js';
import {levelFourArchive} from '../lib/server/level-four-bank-data.js';
import {AUTHORED_REVISION,AUTHORED_LEGACY_REVISION,AUTHORED_OWNER} from '../lib/authored-policy.js';
import {QUESTION_POLICY,calibratedWord,inTargetBand,isCoverageWord,sentenceWritingTask,isRetiredVocabulary} from '../lib/learning-model.js';
import {passageKeys} from '../lib/prepared-plan.js';
// Inflate and index exactly once per worker instance, never per question.
const originalRows=JSON.parse(gunzipSync(Buffer.from(archive,'base64')).toString('utf8'));
const supplementalRows=JSON.parse(gunzipSync(Buffer.from(essentialArchive,'base64')).toString('utf8'));
const supplementalWords=new Set(supplementalRows.map(r=>r.word));
const levelFourRows=JSON.parse(gunzipSync(Buffer.from(levelFourArchive,'base64')).toString('utf8'));
const levelFourWords=new Set(levelFourRows.map(r=>r.word));
const levelFiveSixRows=JSON.parse(gunzipSync(Buffer.from(levelFiveSixArchive,'base64')).toString('utf8'));
const levelFiveSixWords=new Set(levelFiveSixRows.map(r=>r.word));
const previousRows=[...originalRows.filter(r=>!supplementalWords.has(r.word)&&!levelFourWords.has(r.word)),...supplementalRows.filter(r=>!levelFourWords.has(r.word)),...levelFourRows];
const levelNineRows=JSON.parse(gunzipSync(Buffer.from(levelNineArchive,'base64')).toString('utf8'));
const rows=[...previousRows.filter(r=>!levelFiveSixWords.has(r.word)),...levelFiveSixRows,...levelNineRows];
const recoveredExample=rows.find(w=>w.word==='회복');
if(recoveredExample&&!recoveredExample.example)recoveredExample.example='비에 젖었던 운동장이 마르자 원래 모습을 회복했어요.';
const byWord=new Map(rows.map(row=>[row.word,row]));
export const authoredStats=Object.freeze({revision:AUTHORED_REVISION,words:byWord.size,questions:rows.reduce((n,w)=>n+w.questions.length,0),supplementalWords:supplementalRows.length,supplementalQuestions:supplementalRows.reduce((n,w)=>n+w.questions.length,0),independentReviewComplete:false});
export function authoredCurriculum(account){return account===AUTHORED_OWNER?rows.filter(w=>!isRetiredVocabulary(w)).map(({questions,...w})=>({...w,definition:w.definition})):[]}
// These existing accepted alternatives preserve answer credit, but they are
// distinct lexemes rather than an inflection of the requested target.
const recallAlternatives={
 '묻다':['질문','물어보'],'기르다':['키'],'도와주다':['도왔','도왔다','도와요'],
 '기억나다':['생각'],'늘어나다':['늘었'],'발견하다':['찾아내','찾아냈'],'피다':['피어나'],
 '안쓰럽다':['가여','가엾','불쌍'],'알아듣다':['이해'],'의논하다':['상의'],
 '정리하다':['정돈'],'협동하다':['협력'],'달성하다':['이루','이뤘','성취'],
 '되짚다':['살폈','살펴'],'봉사하다':['도왔','도왔다','도와요','자원봉사'],
 '비판하다':['지적'],'성취하다':['달성','이루','이뤘'],'수줍다':['쑥스러','쑥스럽']
};
function targetRecallAnswer(row,q,text){
 if((row.acceptedAlternatives||[]).includes(text)||(recallAlternatives[row.word]||[]).some(prefix=>text.startsWith(prefix)))return false;
 return text===row.word||text===q.answer||q.allowNaturalInflections===true;
}
function rawFromSlot(row,q,item){
 const revision=row.revision||AUTHORED_LEGACY_REVISION;
 const own=q.type==='subjective_use';
 const task=own?sentenceWritingTask(row.word):null;
 const options=structuredClone(q.options||[]);
 if(options.length){const at=options.findIndex(o=>o.correct),[correct]=options.splice(at,1);options.splice(item.answerSlot||0,0,correct)}
 const effective=calibratedWord({w:row.word,d:row.definition,band:row.band,cat:row.domain,example:row.example||'',source:'fixed'});
 // A repeated definition is an instructional clue, not a repeated practice sentence.
 // Keep the blank example in context so passage history compares the examples.
 const recall=q.type==='subjective_recall';
 const parts=recall?String(q.context||'').split('\n'):[];
 const clue=recall?(q.meaningClue||q.definition||q.prompt):'';
 const ctx=own?'':(q.exampleWithBlank||q.blankExample||(recall&&parts.length>1?parts.at(-1):q.context)||'');
 const prompt=own?task.prompt:(recall&&clue!==q.prompt?[clue,q.prompt].join('\n'):q.prompt);
 return {id:String(item.id),targetMeaning:row.definition,type:q.type,prompt,context:ctx,showTarget:own||q.type==='mc_usage',options,
  answerForm:row.word,acceptedAnswers:own?[]:(q.acceptedAnswers||[]).map(x=>typeof x==='string'?{text:x,credit:1,targetRecall:targetRecallAnswer(row,q,x),rationale:'작성 은행의 인정 답안'}:x),
  hints:own?task.hints:['지문에서 중요한 뜻을 찾아보세요.','보기나 뜻 설명이 상황에 맞는지 다시 읽어 보세요.'],feedbackCorrect:q.explanation||'',signature:revision+':'+row.word+':'+q.slot,
  learningCard:item.needsCard&&!own?{definition:row.definition,example:row.example||'',nonExample:'비슷한 말이라도 핵심 뜻이 다르면 이 단어를 쓰지 않아요.',structureNote:row.contrast||''}:null,
  authored:{revision,owner:AUTHORED_OWNER,word:row.word,slot:q.slot,band:effective.band,sourceBand:row.band},
  semanticGraderRequired:own,allowNaturalDerivations:q.grading?.allowNaturalDerivations||[],
  validation:{policy:QUESTION_POLICY,source:'authored_bank',sourceRevision:revision,deterministic:true,schemaChecked:true,aiVerified:false,independentReviewComplete:false}};
}
export function authoredQuestion(item,account,extra=[]){
 if(account!==AUTHORED_OWNER)return null;
 const row=byWord.get(item.word);if(!row)return null;
 const w=calibratedWord({w:row.word,band:row.band});
 if(isRetiredVocabulary(w))return null;
 if(!item.review&&!inTargetBand(w,item.readerLevel)&&!item.firstLearning)return null;
 // Lower unfinished vocabulary has an explicit coverage allocation. Ordinary
 // new words retain their level guard; retired vocabulary never gets an exception.
 if(item.firstLearning&&!inTargetBand(w,item.readerLevel)&&!isCoverageWord({...w,coveragePolicy:item.coveragePolicy},item.readerLevel))return null;
 const used=new Set([...(item.usedPassageKeys||[]),...(item.previousContexts||[]).flatMap(h=>passageKeys(h.context,h.options||[])),...extra.filter(q=>q.authored?.word===row.word).flatMap(q=>passageKeys(q.context,(q.options||[]).map(o=>o.text)))]);
 const usedSignatures=new Set([...(item.usedQuestionSignatures||[]),...(item.previousContexts||[]).map(h=>h.signature),...extra.map(q=>q.signature)].filter(Boolean));
 const normalizeContext=text=>String(text||'').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
 const usedContexts=new Set([...(item.previousContexts||[]).map(h=>h.context),...extra.filter(q=>q.authored?.word===row.word).map(q=>q.context)].map(normalizeContext).filter(Boolean));
 const available=row.questions.filter(q=>q.type===item.type);
 let hash=0;for(const ch of String(item.id)+'|'+(item.usedPassageKeys||[]).length)hash=(hash*31+ch.charCodeAt(0))>>>0;
 for(let i=0;i<available.length;i++){
  const q=rawFromSlot(row,available[(hash+i)%available.length],item);
  // Very short blank sentences do not have a passage fingerprint. Keep their
  // authored slot and full context in the duplicate check as well. Generic
  // own-sentence instructions may repeat; the learner supplies the sentence.
  if(q.type!=='subjective_use'&&(usedSignatures.has(q.signature)||usedContexts.has(normalizeContext(q.context))))continue;
  if(!passageKeys(q.context,q.options.map(o=>o.text)).some(k=>used.has(k)))return q;
 }
 return null;
}
export function resolveAuthoredQuestion(item,account,extra=[]){
 const original=authoredQuestion(item,account,extra);
 if(original)return original;
 const recall=recallQuestion(item);if(recall)return recall;
 // Only newly appended practice tasks may change type. Base lessons and
 // interrupted questions keep the task that the learner was already given.
 if(!item.allowBankTypeFallback||!item.review||item.firstLearning||item.needsCard||item.type==='subjective_use')return null;
 for(const type of ['subjective_recall','mc_context','mc_usage','subjective_use'].filter(t=>t!==item.type)){
  const fresh=authoredQuestion({...item,type},account,extra);
  if(fresh)return {...fresh,bankFallbackFrom:item.type};
 }
 return null;
}
export function authoredAvailability(learner,account,reserved=[]){
 const review=new Set(),fresh=new Set();
 if(account!==AUTHORED_OWNER)return {review,fresh};
 const held=reserved.map(q=>({authored:q.authored,context:q.ctx,options:(q.opts||[]).map(o=>({text:o.t}))}));
 for(const row of rows){
  const st=learner.words?.[row.word]||{},studied=!!(st.seen||st.introducedAt);
  const item={id:'availability',word:row.word,readerLevel:learner.difficulty,review:studied,firstLearning:!studied,usedPassageKeys:st.usedPassageKeys||[],previousContexts:st.problemHistory||[]};
  if(studied){
   // All daily review roles must have a fresh task, including the first recall check.
   if(['mc_usage','subjective_recall','subjective_use'].every(type=>authoredQuestion({...item,type},account,held)))review.add(row.word);
  }else if(authoredQuestion({...item,type:'mc_usage'},account,held))fresh.add(row.word);
 }
 return {review,fresh};
}
export function authoredEntry(plan,learner,account,reserved=[]){
 const st=learner.words?.[plan.w.w]||{};
 const raw=authoredQuestion({id:plan.id,type:plan.type,word:plan.w.w,readerLevel:learner.difficulty,coveragePolicy:plan.coveragePolicy,review:!!plan.review,firstLearning:!!plan.firstLearning,needsCard:!!plan.needsCard,answerSlot:plan.answerSlot,usedPassageKeys:st.usedPassageKeys||[],previousContexts:st.problemHistory||[]},account,reserved.map(q=>({authored:q.authored,context:q.ctx,options:(q.opts||[]).map(o=>({text:o.t}))})));
 if(!raw)return null;
 return {readerLevel:Number(learner.difficulty),supportLevel:plan.supportLevel||0,question:{w:plan.w,type:raw.type,taskDemand:plan.taskDemand,ctx:raw.context,q:raw.prompt,opts:raw.options.map(o=>({t:o.text,ok:o.correct})),acceptedAnswers:raw.acceptedAnswers,showTarget:raw.showTarget,open:raw.type.startsWith('subjective_'),hideWord:!raw.showTarget,label:raw.type==='subjective_recall'?'뜻 보고 떠올리기':raw.type==='subjective_use'?'내 문장 만들기':'뜻과 쓰임',answerForm:raw.answerForm,hints:raw.hints,feedbackCorrect:raw.feedbackCorrect,signature:raw.signature,learningCard:raw.learningCard,authored:raw.authored,semanticGraderRequired:raw.semanticGraderRequired,allowNaturalDerivations:raw.allowNaturalDerivations,validation:raw.validation,bankReaderLevel:Number(learner.difficulty),bankSupportLevel:plan.supportLevel||0}};
}
export default function handler(req,res){return res.status(404).json({error:'Not found'})}



