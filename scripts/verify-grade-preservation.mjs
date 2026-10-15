import assert from 'node:assert/strict';
import {createGradeDelivery} from '../lib/server/grade-delivery.js';
const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only-no-network';
function fixture(){
 const rows=new Map();let calls=0,writes=0,failWrites=0,failAll=false,owner='family';
 const rpc=async(auth,name,a)=>{
  const k=owner+'|'+a.p_hash;let row=rows.get(k);
  if(name==='claim_vocab_grade'){
   if(row?.result)return {result:row.result};
   if(row?.started)return {recoveryRequired:true,lease:row.lease};
   if(row)return {pending:true};
   row={lease:'lease-'+rows.size,started:false,result:null};rows.set(k,row);return {lease:row.lease};
  }
  if(name==='start_vocab_grade'){if(!row||row.started)return false;row.started=true;return true}
  if(name==='finish_vocab_grade'){
   if(a.p_result){writes++;if(failAll||failWrites-->0)throw Error('Storage timeout')}
   if(!row||row.lease!==a.p_lease||row.result)return false;
   row.result=a.p_result;row.started=false;return true;
  }
  throw Error('Unexpected RPC');
 };
 const dependencies={verifyUser:async()=>({id:owner}),runGrade:async()=>{calls++;return {score:1,contextSuccess:true,targetRecall:false,feedback:'문맥에 맞아요.'}},gradeRPC:rpc,gradeForRequest:(x,p)=>({...x,copiedExample:p.previousExamples?.length>0}),pause:async()=>{}};
 const build=()=>createGradeDelivery(dependencies);let handler=build();
 const body={taskType:'sentence_use',targetWord:'의견',question:'의견으로 문장 쓰기',answer:'친구의 의견을 들었다.'};
 async function call(extra={}){let status=0,result;await handler({method:'POST',headers:{authorization:'Bearer test'},body:{...body,...extra}},{status(n){status=n;return this},json(x){result=x;return this}});return {status,result}}
 return {call,rows,restart:()=>handler=build(),set failWrites(x){failWrites=x},set failAll(x){failAll=x},set owner(x){owner=x},get calls(){return calls},get writes(){return writes}};
}
try{
 const first=fixture();first.failWrites=1;
 assert.equal((await first.call()).status,200);assert.equal(first.calls,1);assert.equal(first.writes,2);
 assert.equal((await first.call()).status,200);assert.equal(first.calls,1,'transient result-store failure never regenerates');
 const down=fixture();down.failAll=true;
 const original=await down.call();assert.equal(original.status,200);assert.equal(original.result.cachePending,true);assert.ok(original.result.gradeReceipt);assert.equal(down.calls,1);
 const repeat=await down.call();assert.equal(repeat.status,200);assert.equal(down.calls,1,'same warm worker preserves completed grade');
 down.restart();const noReceipt=await down.call();assert.equal(noReceipt.status,202);assert.equal(noReceipt.result.code,'grading_result_recovery_required');assert.equal(down.calls,1,'expired started work must not rebill on a cold worker');
 down.failAll=false;const recovery=await down.call({gradeReceipt:original.result.gradeReceipt,previousExamples:['shown']});
 assert.equal(recovery.status,200);assert.equal(recovery.result.cachePending,false);assert.equal(recovery.result.copiedExample,true);assert.equal(down.calls,1,'signed receipt repairs storage without paid generation');
 assert.equal((await down.call({gradeReceipt:original.result.gradeReceipt,answer:'다른 답'})).status,400);
 assert.equal((await down.call({gradeReceipt:original.result.gradeReceipt+'bad'})).status,400);
 down.owner='other-family';assert.equal((await down.call({gradeReceipt:original.result.gradeReceipt})).status,400);assert.equal(down.calls,1);
 console.log('Grade preservation PASS: transient/persistent store failure, repeated request, cold worker, signed recovery, copied-example recalculation, tamper/answer/account isolation; one simulated paid grade, zero external calls.');
}finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
