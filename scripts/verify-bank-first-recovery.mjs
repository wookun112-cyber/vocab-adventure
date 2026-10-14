import assert from 'node:assert/strict';
import {bankFallbackTypes,findBankFallback} from '../lib/bank-first-recovery.js';

const words={w:'근거',d:'생각을 뒷받침하는 자료',band:3,cat:'국어'};
const plan={id:'1',w:words,type:'mc_relation',stage:'bridge',review:true,firstLearning:false,needsCard:false};
assert.ok(bankFallbackTypes('mc_relation').every(x=>x.startsWith('mc_')));
assert.ok(bankFallbackTypes('subjective_context').every(x=>x.startsWith('subjective_')));
assert.deepEqual(bankFallbackTypes('subjective_use'),[]);
const hits=[];
const replacement=findBankFallback(plan,trial=>{hits.push(trial.type);return trial.type==='mc_usage'});
assert.equal(replacement.type,'mc_usage');
assert.equal(replacement.w,plan.w,'review target must be preserved');
assert.equal(plan.type,'mc_relation','a fallback must not mutate the original plan');
assert.deepEqual(hits,['mc_usage']);
assert.equal(findBankFallback(plan,()=>false),null,'exhausted valid choices must not fabricate questions');
for(const changed of [{review:false},{firstLearning:true},{needsCard:true},{type:'subjective_use'}]){
  assert.equal(findBankFallback({...plan,...changed},()=>true),null,'no silent reclassification of new, card, or own-sentence tasks');
}
assert.equal(findBankFallback({...plan,type:'subjective_context'},trial=>trial.type==='subjective_recall')?.type,'subjective_recall');
console.log('Bank-first fallback passed: same modality, preserved word, guarded new/recall/use tasks, exhausted bank explicit.');
