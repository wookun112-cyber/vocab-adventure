import fs from 'node:fs';
import {AUTHORED_OWNER} from '../lib/authored-policy.js';
import {gradeHash} from '../lib/server/grade-delivery.js';

// Maintenance export only. Never calls a provider, changes a grade or deletes an
// answer. The SQL rechecks age, owner, cache and response absence under row locks.
export function legacySettlementSQL(rows){
 const manifest=rows.map(r=>({profile:r.profile,lesson:r.lesson_id,id:r.job.id,hash:gradeHash(r.job.payload)}));
 for(const r of manifest)if(!['ayoung','inseong','guest','test'].includes(r.profile)||!/^[-a-f0-9]{36}$/i.test(r.lesson)||!/^[-a-f0-9]{36}:\d+:\d+$/i.test(r.id)||!/^[a-f0-9]{64}$/.test(r.hash))throw Error('Invalid legacy recovery manifest');
 return `do $settle$
 declare owner_id uuid:='${AUTHORED_OWNER}'; original jsonb; item jsonb; lesson jsonb; job jsonb; repaired jsonb; cache vocab_private.grading_cache; idx integer; profile_name text; archive_index jsonb; count_fixed integer:=0; result_rows jsonb;
 begin
  select state->'users' into original from public.app_state where user_id=owner_id for update;
  for item in select value from jsonb_array_elements($manifest$${JSON.stringify(manifest)}$manifest$::jsonb) loop
   select payload into lesson from vocab_private.paused_lessons where user_id=owner_id and profile=item->>'profile' and lesson_id=item->>'lesson' and status='paused' for update;
   if not found then continue;end if;
   select g,(ord-1)::integer into job,idx from jsonb_array_elements(coalesce(lesson->'gradingQueue','[]')) with ordinality t(g,ord) where g->>'id'=item->>'id';
   if job is null or job->>'status'='applied' or coalesce(job->>'submittedAt','')!~'^\\d+$' or (job->>'submittedAt')::numeric>extract(epoch from now()-interval '24 hours')*1000 then continue;end if;
   select * into cache from vocab_private.grading_cache where user_id=owner_id and request_hash=item->>'hash' for update;
   if not found or cache.result is not null or cache.provider_response_id is not null or cache.provider_response is not null or job?'gradeReceipt' or job?'providerReceipt' then continue;end if;
   repaired:=job||jsonb_build_object('status','needs_review','manualReviewRequired',true,'recoveryState','legacy_unavailable','recoveryHash',item->>'hash','recoveryOriginalStatus',coalesce(job->>'recoveryOriginalStatus',job->>'status'),'recoveryCheckedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint,'recoveryReason',case when cache.provider_started then 'provider_result_missing' else 'request_never_started' end);
   if repaired->'answer' is distinct from job->'answer' or repaired->'payload' is distinct from job->'payload' then raise exception 'Original answer changed';end if;
   select jsonb_agg(case when r->>'gradingJobId'=item->>'id' and r->>'gradingPending'='true' and coalesce(r->'credit','null'::jsonb)='null'::jsonb then r||jsonb_build_object('legacyOriginalResult',coalesce(r->'legacyOriginalResult',r),'gradingPending',false,'gradingReviewRequired',true,'excludedFromVocabulary',true,'credit',null,'result','확인 필요') else r end order by ord) into result_rows from jsonb_array_elements(coalesce(lesson->'results','[]')) with ordinality x(r,ord);
   lesson:=jsonb_set(lesson,'{results}',coalesce(result_rows,'[]'));
   update vocab_private.paused_lessons set payload=jsonb_set(lesson,array['gradingQueue',idx::text],repaired) where user_id=owner_id and profile=item->>'profile' and lesson_id=item->>'lesson';
   count_fixed:=count_fixed+1;
  end loop;
  for profile_name in select distinct value->>'profile' from jsonb_array_elements($manifest$${JSON.stringify(manifest)}$manifest$::jsonb) loop
   select coalesce(jsonb_agg(jsonb_build_object('id',p.lesson_id,'day',p.study_day,'answered',jsonb_array_length(coalesce(p.payload->'results','[]')),'target',p.payload->'target','activeMs',p.payload->'activeMs','pendingGrades',vocab_private.pending_grade_count(p.payload->'gradingQueue'),'ungradedAnswers',vocab_private.unavailable_grade_count(p.payload->'gradingQueue')) order by p.paused_at desc),'[]') into archive_index from vocab_private.paused_lessons p where p.user_id=owner_id and p.profile=profile_name and p.status='paused';
   update public.app_state set state=jsonb_set(state,array['users',profile_name,'pausedLessonIndex'],archive_index),updated_at=now() where user_id=owner_id;
  end loop;
  if exists(select 1 from jsonb_each(original) p where (p.value-'pausedLessonIndex') is distinct from (select (state#>array['users',p.key])-'pausedLessonIndex' from public.app_state where user_id=owner_id)) then raise exception 'Learner evidence changed';end if;
  perform set_config('vocab.legacy_settlement',jsonb_build_object('preserved_ungraded',count_fixed,'learner_evidence_unchanged',true)::text,false);
 end $settle$;
 select current_setting('vocab.legacy_settlement') result;`;
}
if(process.argv[2])fs.writeFileSync(process.argv[3],legacySettlementSQL(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))),{mode:0o600});
