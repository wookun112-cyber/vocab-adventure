import fs from 'node:fs';
import assert from 'node:assert/strict';
import {OFFLINE_ROWS} from '../lib/server/offline-bank-runtime.js';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
const rows=OFFLINE_ROWS.filter(r=>['증여','예측'].includes(r.word));
assert.equal(rows.length,2);
for(const row of rows){assert.equal(row.questions.length,10);assert.equal(new Set(row.questions.map(q=>q.slot)).size,10)}
if(!process.argv[2])throw Error('Output SQL path required');
fs.writeFileSync(process.argv[2],`-- Additive historical vocabulary compatibility. No learner or existing grade changes.
do $migration$
declare before_state text;
begin
 select md5(state::text) into before_state from public.app_state where user_id='${AUTHORED_OWNER}';
 insert into vocab_private.bank_authoring_items(user_id,batch_key,word,band,slot,task_type,status,word_snapshot,question)
 select '${AUTHORED_OWNER}'::uuid,r->>'revision',r->>'word',(r->>'band')::smallint,(q->>'slot')::smallint,q->>'type','authored_draft',r-'questions',q
 from jsonb_array_elements($bank$${JSON.stringify(rows)}$bank$::jsonb) r cross join lateral jsonb_array_elements(r->'questions') q
 on conflict(user_id,batch_key,word,slot) do nothing;
 if (select count(*) from vocab_private.bank_authoring_items where user_id='${AUTHORED_OWNER}' and batch_key='vocab-bank-offline-20261014-v1' and word in ('증여','예측') and status='authored_draft')<>20 then raise exception 'Missing compatibility bank slots';end if;
 if before_state is distinct from (select md5(state::text) from public.app_state where user_id='${AUTHORED_OWNER}') then raise exception 'Learner state changed';end if;
end $migration$;
`);
