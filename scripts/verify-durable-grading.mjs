import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGradeDelivery,gradeHash} from '../lib/server/grade-delivery.js';
import {createGradeProvider} from '../lib/server/grade-provider.js';
import {gradeRequest,parseGradeResponse} from '../api/grade.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {createArchivedRecovery} from '../api/recover-grades.js';
const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='offline-fixture-not-a-key';
const lease='11111111-1111-4111-8111-111111111111';
const payload={gradingPolicy:'meaning-first-20261018',taskType:'sentence_use',targetWord:'의견',definition:'어떤 일에 대한 생각',question:'의견을 넣어 문장을 만드세요.',answer:'친구의 의견을 들었어요.',source:'typed',readerLevel:4};
const semantic={normalizedAnswer:payload.answer,result:'○',score:1,contextSuccess:true,targetRecall:false,feedback:'의견을 알맞게 썼어요.',exampleAnswer:payload.answer,correctionApplied:false,correctionNote:'',usageAssessment:{meaning:'correct',target:'present',expression:'complete',issue:'none'}};
const completed=id=>({id,status:'completed',model:'gpt-6-luna',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify(semantic)}]}],usage:{input_tokens:100,output_tokens:200,output_tokens_details:{reasoning_tokens:20}}});
function fixture(){
 const rows=new Map();let creates=0,gets=0,checkpoints=0,owner='family',providerStatus='queued',storeFail=false,checkpointFail=false,lookupFail=false,dropCreate=false,startAckLost=false,seenBody;
 const fetcher=async(url,opts={})=>{
  if(opts.method==='POST'){
   creates++;seenBody=JSON.parse(opts.body);
   if(dropCreate)throw Object.assign(Error('Injected connection loss before ID'),{name:'TimeoutError'});
   return {ok:true,json:async()=>providerStatus==='completed'?completed('resp_fixture'):{id:'resp_fixture',status:providerStatus}};
  }
  gets++;if(lookupFail)throw Object.assign(Error('Injected GET timeout'),{name:'TimeoutError'});
  return {ok:true,json:async()=>providerStatus==='completed'?completed('resp_fixture'):{id:'resp_fixture',status:providerStatus,incomplete_details:providerStatus==='incomplete'?{reason:'max_output_tokens'}:undefined}};
 };
 const rpc=async(auth,name,args)=>{
  const key=owner+'|'+args.p_hash;let row=rows.get(key);
  if(name==='claim_vocab_grade'){
   if(row?.result)return {result:row.result};
   if(row?.started)return {recoveryRequired:true,lease};
   if(row)return {pending:true};rows.set(key,{lease,started:false});return {lease};
  }
  if(name==='start_vocab_grade'){if(row.started)return false;row.started=true;if(startAckLost)throw Object.assign(Error('Lost start acknowledgement'),{name:startAckLost==='timeout'?'TimeoutError':'Error'});return true}
  if(name==='record_vocab_grade_response'){
   checkpoints++;
   if(checkpointFail)throw Object.assign(Error('Injected checkpoint outage'),{code:'57014'});
   if(!row||row.lease!==args.p_lease)return false;
   if(row.providerId&&row.providerId!==args.p_response.id)return false;
   row.providerId=args.p_response.id;row.providerResponse=args.p_response;return true;
  }
  if(name==='read_vocab_grade_status'){
   if(checkpointFail)throw Error('Injected read outage');
   return row?.result?{status:'ready',result:row.result}:row?.providerId?{status:'pending',providerId:row.providerId,providerResponse:row.providerResponse,lease}:row?.started?{status:startAckLost==='timeout'?'pending':'recovery_required',startReserved:true,lease}:{status:'retryable'};
  }
  if(name==='record_vocab_grade_failure'){if(row){row.failureStage=args.p_stage;row.failureCode=args.p_code}return true}
  if(name==='finish_vocab_grade'){
   if(args.p_result&&storeFail)throw Object.assign(Error('Injected result write timeout'),{code:'57014'});
   if(!row||row.result||row.lease!==args.p_lease)return false;
   row.result=args.p_result;row.started=false;return true;
  }
  throw Error('Unexpected RPC '+name);
 };
 const build=()=>createGradeDelivery({verifyUser:async()=>({id:owner}),authorizeAccount:u=>{if(u.id!=='family')throw Object.assign(Error('wrong owner'),{status:403,code:'grading_account_not_allowed'})},runGrade:()=>{throw Error('Legacy synchronous path must not run')},gradeRPC:rpc,gradeForRequest:r=>r,pause:async()=>{},provider:createGradeProvider({request:gradeRequest,decode:parseGradeResponse,fetcher,fastWaitMs:0})});
 let handler=build();
 return {rows,rpc,restart(){handler=build()},async call(extra={}){let status,value;await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{...payload,...extra}},{status(n){status=n;return this},json(v){value=v;return this}});return {status,value}},get checkpoints(){return checkpoints},get creates(){return creates},get gets(){return gets},get seenBody(){return seenBody},set status(v){providerStatus=v},set storeFail(v){storeFail=v},set checkpointFail(v){checkpointFail=v},set lookupFail(v){lookupFail=v},set dropCreate(v){dropCreate=v},set startAckLost(v){startAckLost=v},set owner(v){owner=v}};
}
try{
 // Lost DB start acknowledgement: confirm the same lease, never reserve twice.
 const ack=fixture();ack.startAckLost='timeout';ack.status='completed';
 assert.equal((await ack.call()).status,200);assert.equal(ack.creates,1);
 assert.equal((await ack.call()).status,200);assert.equal(ack.creates,1);
 // Crash/redeploy after dispatch: a cold function retrieves the same provider ID.
 const cold=fixture();const pending=await cold.call();assert.equal(pending.status,202);assert.equal(pending.value.code,'grading_pending');assert.ok(pending.value.providerReceipt);
 assert.equal(cold.creates,1);assert.equal(cold.seenBody.background,true);assert.equal(cold.seenBody.store,true);assert.ok(cold.seenBody.max_output_tokens>=1200);
 cold.restart();cold.status='completed';const result=await cold.call({pollOnly:true});assert.equal(result.status,200);assert.equal(result.value.score,1);assert.equal(cold.creates,1);assert.equal(cold.gets,1);
 assert.equal((await cold.call({pollOnly:true})).value.score,1);assert.equal(cold.creates,1);
 // Warm repeated polls keep the ID checkpoint durable without rewriting it.
 const quietProvider=fixture();await quietProvider.call();for(let i=0;i<5;i++)await quietProvider.call({pollOnly:true});assert.equal(quietProvider.checkpoints,1);
 // DB ID checkpoint unavailable, browser persists signed receipt on 202.
 const receipt=fixture();receipt.checkpointFail=true;const waiting=await receipt.call();assert.ok(waiting.value.providerReceipt);receipt.restart();receipt.status='completed';
 const recovered=await receipt.call({pollOnly:true,providerReceipt:waiting.value.providerReceipt});assert.equal(recovered.status,200);assert.equal(recovered.value.score,1);assert.equal(receipt.creates,1);
 // Valid result received while both DB copies fail: signed grade receipt repairs on a poll.
 const signed=fixture();signed.status='completed';signed.checkpointFail=true;signed.storeFail=true;const signedGrade=await signed.call();assert.equal(signedGrade.status,200);assert.ok(signedGrade.value.gradeReceipt);
 signed.restart();signed.checkpointFail=false;signed.storeFail=false;const repair=await signed.call({pollOnly:true,gradeReceipt:signedGrade.value.gradeReceipt});assert.equal(repair.status,200);assert.equal(repair.value.cachePending,false);assert.equal(signed.creates,1);assert.ok([...signed.rows.values()][0].result);
 // Provider lookup timeout is retriable with GET, never with another POST.
 const timeout=fixture();const t=await timeout.call();timeout.restart();timeout.lookupFail=true;
 assert.equal((await timeout.call({pollOnly:true,providerReceipt:t.value.providerReceipt})).value.code,'grading_pending');
 assert.equal([...timeout.rows.values()][0].failureStage,'provider_lookup');
 timeout.lookupFail=false;timeout.status='completed';assert.equal((await timeout.call({pollOnly:true})).value.score,1);assert.equal(timeout.creates,1);
 // A final provider envelope survives result-table failure + process memory loss.
 const down=fixture();down.status='completed';down.storeFail=true;const delivered=await down.call();assert.equal(delivered.value.score,1);assert.equal(delivered.value.cachePending,true);
 down.restart();down.storeFail=false;const saved=await down.call({pollOnly:true});assert.equal(saved.value.score,1);assert.equal(saved.value.cachePending,false);assert.equal(down.creates,1);assert.equal(down.gets,0,'terminal envelope re-parsed without any provider request');
 // 12 seconds client < 22 seconds provider was not a durable job. The new
 // queued job outlives that UI window and still resolves after a restart.
 const slow=fixture();const s=await slow.call();for(let i=0;i<3;i++){slow.restart();assert.equal((await slow.call({pollOnly:true})).value.code,'grading_pending')}
 slow.status='completed';assert.equal((await slow.call({pollOnly:true})).value.score,1);assert.equal(slow.creates,1);
 // The old untraceable window and already-started legacy requests never rebill.
 const unknown=fixture();unknown.dropCreate=true;assert.equal((await unknown.call()).value.code,'grading_result_recovery_required');unknown.restart();unknown.dropCreate=false;
 assert.equal((await unknown.call({pollOnly:true})).value.code,'grading_result_recovery_required');assert.equal((await unknown.call()).value.code,'grading_result_recovery_required');assert.equal(unknown.creates,1);assert.equal([...unknown.rows.values()][0].failureStage,'provider_create');
 // An incomplete JSON/reasoning response is not a grade and never auto-recreated.
 const incomplete=fixture();await incomplete.call();incomplete.status='incomplete';const inc=await incomplete.call({pollOnly:true});assert.equal(inc.status,202);assert.equal(inc.value.causeCode,'grading_provider_incomplete');assert.equal(inc.value.score,undefined);incomplete.restart();assert.equal((await incomplete.call({pollOnly:true})).value.code,'grading_result_recovery_required');assert.equal(incomplete.creates,1);
 // Duplicate concurrent requests share one paid start even across cold handlers.
 const concurrent=fixture();await Promise.all([concurrent.call(),concurrent.call(),concurrent.call()]);assert.equal(concurrent.creates,1);
 const before=concurrent.gets;assert.equal((await concurrent.call({pollOnly:true,providerReceipt:pending.value.providerReceipt+'bad'})).status,400);assert.equal(concurrent.gets,before);
 assert.equal((await concurrent.call({pollOnly:true,providerReceipt:pending.value.providerReceipt,answer:'다른 답'})).status,400);concurrent.owner='other';assert.equal((await concurrent.call({pollOnly:true})).status,403);assert.equal(concurrent.creates,1);
 // Archive reconciliation reaches provider recovery only after cache and receipt miss.
 let checked=0,commits=0;const stamp=Date.now(),job={id:'old:0',word:'의견',index:0,status:'pending',submittedAt:stamp,submittedDay:'2026-10-20',payload,answer:payload.answer};
 const snapshot={expected:'cas',job,plan:{w:{w:'의견',d:payload.definition,band:4},type:'subjective_use'},learner:{words:{},sessions:[],activeLesson:{id:'new'}},lesson:{id:'old',mode:'daily',studyFallbackDay:'2026-10-20',studyStartedAt:stamp,baseWords:[{w:'의견'}],results:[{word:'의견',gradingPending:true,gradingJobId:job.id,excludedFromVocabulary:true}],gradingQueue:[job]}};
 const archive=createArchivedRecovery({verify:async()=>({id:AUTHORED_OWNER}),rpc:async(auth,name,args)=>{if(name==='read_paused_grade_recovery')return args.p_profile==='ayoung'&&!args.p_skip.length?snapshot:null;if(name==='read_saved_vocab_grade')return null;if(name==='commit_paused_grade_recovery'){commits++;return true}throw Error(name)},recover:async()=>{checked++;return semantic}});
 let archived;await archive({method:'POST',headers:{authorization:'Bearer fixture'}},{setHeader(){},status(){return this},json(v){archived=v}});assert.equal(checked,1);assert.equal(commits,1);assert.equal(archived.recovered,1);
 console.log('Durable grading PASS: provider-ID-first, cold restart, timeouts, DB ID/result failure, signed receipt fallback, terminal snapshot, duplicate concurrent submission, incomplete response without false score, legacy no-rebill, archive recovery and owner/hash isolation. No external calls.');
}finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey}
