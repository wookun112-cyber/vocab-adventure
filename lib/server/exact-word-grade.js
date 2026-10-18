// Exact spelling is deterministic. This does not grade sentence-use answers or
// infer synonyms; the caller must verify the task against the saved assignment.
export const normalizeExactWord=value=>String(value??'').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\s"'“”‘’.,!?()\[\]{}]/g,'').trim();
export function exactWordGrade(p){
 if(!['definition_recall','context_answer'].includes(p.taskType)||typeof p.targetWord!=='string'||typeof p.answer!=='string')return null;
 const word=normalizeExactWord(p.targetWord);
 if(!word||normalizeExactWord(p.answer)!==word)return null;
 return {score:1,result:'○',contextSuccess:true,targetRecall:true,normalizedAnswer:p.answer,feedback:'입력한 답이 정답 어휘와 일치해요.',exampleAnswer:'',correctionApplied:false,correctionNote:'',gradingMethod:'exact_word'};
}
