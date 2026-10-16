import assert from 'node:assert/strict';
import {createGradeDelivery} from '../lib/server/grade-delivery.js';
const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-test-only';
try{
 let status={status:'retryable'},paid=0,writes=0,reads=0,owner='family',release;
 const dependencies={verifyUser:async()=>owner?{id:owner}:null,authorizeAccount:user=>{if(user.id!=='family')throw Object.assign(Error('wrong account'),{status:403,code:'grading_account_not_allowed'})},
  runGrade:async()=>{paid++;return new Promise(resolve=>{release=resolve})},
  gradeForRequest:(r,p)=>({...r,copiedExample:!!p.previousExamples?.length}),
  gradeRPC:async(auth,name,args)=>{
   if(name==='read_vocab_grade_status'){reads++;return status}
   writes++;
   if(name==='claim_vocab_grade')return status.status==='ready'?{result:status.result}:status.status==='pending'?{pending:true}:{lease:'lease'};
   if(name==='start_vocab_grade'){status={status:'pending'};return true}
   if(name==='finish_vocab_grade'){status={status:'ready',result:args.p_result};return true}
   throw Error(name);
  }};
 const handler=createGradeDelivery(dependencies),cold=createGradeDelivery(dependencies);
 const payload={taskType:'sentence_use',question:'의견으로 문장 쓰기',targetWord:'의견',answer:'친구의 의견을 들었다.'};
 async function call(body={},deliver=handler){let code,value;await deliver({method:'POST',headers:{authorization:'Bearer fixture'},body:{...payload,...body}},{status(n){code=n;return this},json(v){value=v}});return {code,value}}
 assert.equal((await call({pollOnly:true})).value.code,'grading_retryable');
 assert.equal(writes,0);assert.equal(paid,0,'cache miss status never starts paid grading');
 const flight=call();await new Promise(r=>setTimeout(r,0));
 assert.equal(paid,1);const writesBefore=writes;
 for(let i=0;i<4;i++)assert.equal((await call({pollOnly:true},cold)).value.code,'grading_pending');
 assert.equal(writes,writesBefore,'pending polls never claim/start/finish');assert.equal(paid,1);
 release({score:1,contextSuccess:true,targetRecall:false,feedback:'알맞아요.'});await flight;
 const cached=await call({pollOnly:true,previousExamples:['shown']},cold);
 assert.equal(cached.value.score,1);assert.equal(cached.value.copiedExample,true);assert.equal(paid,1);
 status={status:'recovery_required'};const before=writes;
 assert.equal((await call({pollOnly:true},cold)).value.code,'grading_result_recovery_required');assert.equal(writes,before);assert.equal(paid,1);
 owner=null;assert.equal((await call({pollOnly:true},cold)).code,401);
 owner='other';assert.equal((await call({pollOnly:true},cold)).code,403);
 assert.equal(paid,1);assert.ok(reads>=7);
 console.log('Read-only polling PASS: missing/pending/ready/recovery states, cold worker, no lease writes or extra paid requests, copied-answer flags and account isolation.');
}finally{if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous}
