-- Add one isolated learner key without changing ownership checks or grants.
-- Existing children, guest records and question/grade receipts are untouched.
begin;
alter table vocab_private.preparations drop constraint preparations_profile_check;
alter table vocab_private.preparations add constraint preparations_profile_check check(profile in ('ayoung','inseong','guest','test'));
alter table vocab_private.lesson_reserves drop constraint lesson_reserves_profile_check;
alter table vocab_private.lesson_reserves add constraint lesson_reserves_profile_check check(profile in ('ayoung','inseong','guest','test'));
alter table vocab_private.paused_lessons drop constraint paused_lessons_profile_check;
alter table vocab_private.paused_lessons add constraint paused_lessons_profile_check check(profile in ('ayoung','inseong','guest','test'));
do $profile$
declare f record; original text; changed text; patched integer:=0;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('get_grade_assignment','get_topup_learner','save_learning_patch_v2'))
 or (n.nspname='vocab_private' and p.proname in ('commit_paused_grade_recovery','ensure_prepared_lesson','get_prepared_lesson','get_vocab_grade_assignment','learning_saved','protect_day_switch','protect_study_rounds','read_paused_grade_recovery','switch_learning_day')) loop
  original:=pg_get_functiondef(f.oid);
  changed:=replace(original,'''ayoung'',''inseong'',''guest''','''ayoung'',''inseong'',''guest'',''test''');
  changed:=replace(changed,'''ayoung''::text, ''inseong''::text, ''guest''::text','''ayoung''::text, ''inseong''::text, ''guest''::text, ''test''::text');
  changed:=replace(changed,'''ayoung'', ''inseong'', ''guest''','''ayoung'', ''inseong'', ''guest'', ''test''');
  if original=changed then raise exception 'Expected profile guard absent: %',f.oid::regprocedure;end if;
  execute changed;patched:=patched+1;
 end loop;
 if patched<>12 then raise exception 'Expected twelve existing profile integrations, got %',patched;end if;
end $profile$;
commit;
