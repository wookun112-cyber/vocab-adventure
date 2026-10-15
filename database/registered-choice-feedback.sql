-- Read-only owner-scoped recovery, without approving new content.
create or replace function vocab_private.get_registered_choice_feedback_question(p_question jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stored jsonb; supplied_options jsonb; registered_options jsonb; b record;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if octet_length(p_question::text)>24000 or jsonb_typeof(p_question->'opts') is distinct from 'array' or jsonb_array_length(p_question->'opts')<>5 or coalesce(p_question->>'type','') not like 'mc_%' then return null;end if;
 select jsonb_agg(jsonb_build_object('t',o->>'t','ok',o->'ok') order by o->>'t') into supplied_options from jsonb_array_elements(p_question->'opts') o;
 for b in select question from vocab_private.question_bank where user_id=auth.uid() and policy='vocabulary-level-fit-12.13' and word=p_question#>>'{w,w}' and task_type=p_question->>'type' and question#>>'{w,d}'=p_question#>>'{w,d}' and question->>'q'=p_question->>'q' and coalesce(question->>'ctx','')=coalesce(p_question->>'ctx','') loop
  stored:=b.question;if jsonb_typeof(stored->'opts') is distinct from 'array' or jsonb_array_length(stored->'opts')<>5 then continue;end if;
  select jsonb_agg(jsonb_build_object('t',o->>'t','ok',o->'ok') order by o->>'t') into registered_options from jsonb_array_elements(stored->'opts') o;
  if supplied_options=registered_options then return stored;end if;
 end loop;return null;
end $$;
revoke all on function vocab_private.get_registered_choice_feedback_question(jsonb) from public,anon,authenticated;
grant execute on function vocab_private.get_registered_choice_feedback_question(jsonb) to authenticated;
create or replace function public.get_registered_choice_feedback_question(p_question jsonb)
returns jsonb language sql security invoker set search_path='' as $$select vocab_private.get_registered_choice_feedback_question(p_question)$$;
revoke all on function public.get_registered_choice_feedback_question(jsonb) from public,anon;
grant execute on function public.get_registered_choice_feedback_question(jsonb) to authenticated;
