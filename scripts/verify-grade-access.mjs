import assert from 'node:assert/strict';
import {createGradeDelivery} from '../lib/server/grade-delivery.js';
import {requireGradingAccount,authorizeGradeTask} from '../lib/server/grade-access.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-no-network';
let owner='uninvited',assigned=false,limit=false,paid=0,rpcs=0,finished=null;
const rpc=async(auth,name,args)=>{rpcs++;if(name==='claim_vocab_grade')return finished?{result:finished}:{lease:'lease'};if(name==='get_vocab_grade_assignment')return assigned;if(name==='start_vocab_grade'){if(limit)throw Error('GRADE_DAILY_LIMIT');return true}if(name==='finish_vocab_grade'){finished=args.p_result;return true}throw Error('Unexpected RPC');};
const handler=createGradeDelivery({verifyUser:async()=>({id:owner}),authorizeAccount:requireGradingAccount,authorizeTask:authorizeGradeTask,gradeRPC:rpc,runGrade:async()=>{paid++;return {score:1,contextSuccess:true}},gradeForRequest:r=>r,pause:async()=>{}});
const body={answer:'서로 의견을 나누었어.',question:'의견을 넣어 문장을 쓰세요.',targetWord:'의견',definition:'어떤 일에 대한 생각',source:'typed',taskType:'sentence_use'};
async function call(extra={}){const res={status(n){this.code=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',headers:{authorization:'Bearer test'},body:{...body,...extra}},res);return res;}
try{
 assert.equal((await call()).code,403);assert.equal(paid,0);assert.equal(rpcs,0);
 owner=AUTHORED_OWNER;assert.equal((await call()).code,409);assert.equal(paid,0);
 assigned=true;assert.equal((await call({taskType:'arbitrary_chat'})).code,400);assert.equal(paid,0);
 limit=true;assert.equal((await call()).code,429);assert.equal(paid,0);
 limit=false;assert.equal((await call()).code,200);assert.equal(paid,1);
 limit=true;assigned=false;assert.equal((await call()).code,200);assert.equal(paid,1,'cached result unaffected by budget/assignment expiry');
 let received;await authorizeGradeTask('test',{...body,assignmentId:'11111111-1111-4111-8111-111111111111:3'},async(a,n,args)=>{received=args;return true});assert.equal(received.p_request.assignmentId,'11111111-1111-4111-8111-111111111111:3');
 assert.equal(await import('../lib/server/grade-delivery.js').then(m=>m.gradeHash(body)),await import('../lib/server/grade-delivery.js').then(m=>m.gradeHash({...body,assignmentId:'new-id'})),'assignment IDs do not change existing paid-grade cache keys');
 console.log('Grade access PASS: uninvited account, unassigned task, unsupported type and budget blocked before provider; cached repair bypasses new-payment limits.');
}finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
