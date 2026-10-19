import assert from 'node:assert/strict';
import {createGradeDelivery} from '../lib/server/grade-delivery.js';
import {runGrade,recoverGrade} from '../api/grade.js';

const originalFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY,previousModel=process.env.OPENAI_MODEL;
process.env.OPENAI_API_KEY='offline-test-no-provider-calls';process.env.OPENAI_MODEL='gpt-6-luna';
const answer={score:1,result:'○',contextSuccess:true,targetRecall:false,normalizedAnswer:'나는 친구의 의견을 들었다.',feedback:'맞아요',exampleAnswer:'',correctionApplied:false,correctionNote:'',
 usageAssessment:{meaning:'correct',target:'present',expression:'complete',issue:'none'}};
const body={taskType:'sentence_use',gradingPolicy:'meaning-first-20261018',question:'의견으로 문장을 쓰세요.',targetWord:'의견',definition:'어떤 일에 대한 생각',answer:'나는 친구의 의견을 들었다.'};
function fixture(){
 const rows=new Map();let posts=0,gets=0,done=false,dbWriteFailures=0,attachmentFails=false;
 const rpc=async(auth,name,a)=>{
  const row=rows.get(a.p_hash);
  if(name==='claim_vocab_grade'){
   if(!row){rows.set(a.p_hash,{lease:'lease-test',started:false,result:null,responseId:null});return {lease:'lease-test'}}
   if(row.result)return {result:row.result};
   return row.started?{recoveryRequired:true,lease:row.lease}:{pending:true};
  }
  if(name==='start_vocab_grade'){if(!row||row.started)return false;row.started=true;return true}
  if(name==='attach_vocab_grade_response'){
   if(attachmentFails)throw Error('DB unavailable');
   if(row?.lease!==a.p_lease||!row.started)return false;
   if(row.responseId&&row.responseId!==a.p_response_id)return false;
   row.responseId=a.p_response_id;return true;
  }
  if(name==='read_vocab_grade_status'){
   if(row?.result)return {status:'ready',result:row.result};
   if(row?.responseId)return {status:'pending',providerResponseId:row.responseId,lease:row.lease};
   return {status:row?.started?'recovery_required':'retryable'};
  }
  if(name==='finish_vocab_grade'){
   if(a.p_result&&dbWriteFailures-->0)throw Error('DB statement timeout');
   if(!row||row.lease!==a.p_lease||row.result)return false;
   row.result=a.p_result;row.started=false;return true;
  }
  throw Error('Unexpected RPC '+name);
 };
 const build=()=>createGradeDelivery({
  verifyUser:async()=>({id:'family'}),runGrade:async(p,{onResponseId})=>{posts++;await onResponseId('resp_durable_example1');return {pending:true}},
  recoverGrade:async(id,p)=>{gets++;assert.equal(id,'resp_durable_example1');return done?answer:null},
  gradeRPC:rpc,gradeForRequest:(r,p)=>({...r,copiedExample:!!p.previousExamples?.length}),pause:async()=>{}
 });
 const submit=async(app,payload={})=>{
  let code,value;
  await app({method:'POST',headers:{authorization:'Bearer offline'},body:{...body,...payload}},
   {status(n){code=n;return this},json(v){value=v;return this}});
  return {code,value};
 };
 return {build,submit,get posts(){return posts},get gets(){return gets},done:()=>done=true,writeFailures:n=>dbWriteFailures=n,attachmentFails:()=>attachmentFails=true};
}
try{
 // Exercise the real Responses API adapter entirely offline.
 let posts=0,gets=0,responseState='in_progress',registered=[];
 globalThis.fetch=async(url,options={})=>{
  if(url==='https://api.openai.com/v1/responses'){
   posts++;const request=JSON.parse(options.body);
   assert.equal(request.background,true);assert.equal(request.store,true);assert.ok(request.max_output_tokens>=1300);
   return {ok:true,json:async()=>({id:'resp_mock123456',status:'queued'})};
  }
  if(url.endsWith('/resp_mock123456')){
   gets++;
   return {ok:true,json:async()=>responseState==='in_progress'
    ?{id:'resp_mock123456',status:'in_progress'}
    :responseState==='incomplete'
     ?{id:'resp_mock123456',status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}
     :{id:'resp_mock123456',status:'completed',output_text:JSON.stringify(answer)}};
  }
  throw Error('Unexpected network '+url);
 };
 assert.equal((await runGrade(body,{onResponseId:async id=>registered.push(id)})).pending,true);
 assert.deepEqual(registered,['resp_mock123456']);
 assert.equal(await recoverGrade('resp_mock123456',body),null);
 responseState='completed';assert.equal((await recoverGrade('resp_mock123456',body)).score,1);
 responseState='incomplete';await assert.rejects(recoverGrade('resp_mock123456',body),/no completed grade/);
 assert.equal(posts,1);assert.equal(gets,3);

 // Cold worker, repeated status polls and cache write all reuse one paid POST.
 const f=fixture(),initial=f.build();
 assert.equal((await f.submit(initial)).code,202);assert.equal(f.posts,1);
 const cold=f.build();
 for(let i=0;i<3;i++)assert.equal((await f.submit(cold,{pollOnly:true})).code,202);
 assert.equal(f.posts,1);
 f.done();const final=await f.submit(cold,{pollOnly:true});
 assert.equal(final.code,200);assert.equal(final.value.score,1);assert.equal(final.value.cachePending,false);
 assert.equal((await f.submit(f.build(),{pollOnly:true})).value.score,1);assert.equal(f.posts,1);

 // Result was generated but Supabase failed: a new instance repairs via GET.
 const down=fixture();
 assert.equal((await down.submit(down.build())).code,202);
 down.writeFailures(5);down.done();
 const delayed=await down.submit(down.build(),{pollOnly:true});
 assert.equal(delayed.code,200);assert.equal(delayed.value.cachePending,true);assert.ok(delayed.value.gradeReceipt);
 down.writeFailures(0);
 assert.equal((await down.submit(down.build(),{pollOnly:true})).value.cachePending,false);
 assert.equal(down.posts,1);

 // An unpersisted response ID is not a grade and can never be paid again.
 const orphan=fixture();orphan.attachmentFails();
 const missing=await orphan.submit(orphan.build());
 assert.equal(missing.code,202);assert.equal(missing.value.code,'grading_result_recovery_required');
 assert.equal((await orphan.submit(orphan.build(),{pollOnly:true})).value.code,'grading_result_recovery_required');
 assert.equal(orphan.posts,1);
 console.log('Durable grade PASS: provider ID, async/pending/completed/incomplete, restart, DB outage, no second paid POST or false grade.');
}finally{
 globalThis.fetch=originalFetch;
 if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;
 if(previousModel===undefined)delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=previousModel;
}
