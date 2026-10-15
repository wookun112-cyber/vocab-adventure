import assert from 'node:assert/strict';
import handler from '../api/grade.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
const cache=new Map();let charges=0;
process.env.OPENAI_API_KEY='test-only-not-a-real-key';
globalThis.fetch=async(url,options={})=>{
 if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:AUTHORED_OWNER})};
 const args=JSON.parse(options.body||'{}');
 if(url.endsWith('/get_vocab_grade_assignment'))return {ok:true,json:async()=>true};
 if(url.endsWith('/claim_vocab_grade')){
  if(cache.has(args.p_hash))return {ok:true,json:async()=>cache.get(args.p_hash)};
  cache.set(args.p_hash,{pending:true});return {ok:true,json:async()=>({lease:'test-lease'})};
 }
 if(url.endsWith('/start_vocab_grade'))return {ok:true,json:async()=>true};
 if(url.endsWith('/finish_vocab_grade')){cache.set(args.p_hash,{result:args.p_result});return {ok:true,json:async()=>true}}
 if(url==='https://api.openai.com/v1/responses'){
  charges++;await new Promise(r=>setTimeout(r,5));return {ok:true,json:async()=>({output_text:JSON.stringify({score:1,contextSuccess:true,targetRecall:false,result:'○',normalizedAnswer:'친구의 의견을 존중했다.',feedback:'생각을 뜻하는 의견을 알맞게 썼어요.',exampleAnswer:'친구의 의견을 존중했다.'})})};
 }
 throw Error('Unexpected network '+url);
};
const body={taskType:'sentence_use',source:'typed',targetWord:'의견',definition:'어떤 일에 대한 생각',question:'의견을 넣어 문장을 쓰세요.',answer:'친구의 의견을 존중했다.',previousExamples:[]};
async function call(payload=body){let status=200,result;await handler({method:'POST',headers:{authorization:'Bearer test'},body:payload},{status(n){status=n;return this},json(v){result=v;return this}});return {status,result}}
try{
 const [first,second]=await Promise.all([call(),call()]);
 assert.equal(first.status,200);assert.equal(second.status,202);assert.equal(charges,1,'concurrent submissions charge once');
 const again=await call();assert.equal(again.result.cached,true);assert.equal(charges,1);
 const copied=await call({...body,previousExamples:[body.answer]});
 assert.equal(copied.status,200);
 assert.equal(copied.result.cached,true,'display-only examples reuse prior semantic decision');
 assert.equal(copied.result.copiedExample,true,'copying is evaluated with the CURRENT shown examples');
 assert.equal(charges,1,'adding a previously shown example must NOT trigger an extra paid grade');
 const repeated=await call({...body,previousExamples:[]});
 assert.equal(repeated.result.copiedExample,false,'prior cache flags must not stick to a new submission');
 assert.equal(charges,1,'removing shown examples must not trigger extra API work');
 const newAnswer=await call({...body,answer:'친구들은 저마다 다른 의견을 말했다.'});
 assert.equal(newAnswer.status,200);
 assert.equal(charges,2,'a distinct student response still requires semantic grading');
 assert.equal((await call({...body,answer:'a'.repeat(3001)})).status,400);
 console.log('Server grading: idempotent cache, concurrent lease, repeated response, no duplicate billing on shown-example changes, copied example and input bounds verified without paid calls.');
}finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey}
