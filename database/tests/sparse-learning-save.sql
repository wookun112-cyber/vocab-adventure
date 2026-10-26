-- Test only the dedicated test profile; every write is rolled back in a subtransaction.
do $test$
declare owner_id uuid:='06c78577-b96e-4919-b979-58683ff5946e'; before_state jsonb; answer jsonb; entry record; duplicate_number text; failed boolean;
begin
 select state into before_state from public.app_state where user_id=owner_id;
 if before_state#>>'{users,test,name}' is distinct from '테스트' then raise exception 'Dedicated QA profile required';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
  answer:=public.save_learning_patch_v2('[{"path":["users","test","qaAuditProbe"],"exists":false,"value":0}]');
  if answer->>'saved'<>'true' then raise exception 'Test save failed';end if;
  if (select state#>'{users,ayoung}' from public.app_state where user_id=owner_id) is distinct from before_state#>'{users,ayoung}'
   or (select state#>'{users,inseong}' from public.app_state where user_id=owner_id) is distinct from before_state#>'{users,inseong}' then raise exception 'Sibling profile changed';end if;
  answer:=public.save_learning_patch_v2('[{"path":["users","test","qaAuditProbe"],"exists":true,"before":999,"value":1}]');
  if answer->>'conflict'<>'true' then raise exception 'CAS conflict not preserved';end if;
  failed:=false;
  begin perform public.save_learning_patch_v2(jsonb_build_array(jsonb_build_object('path',jsonb_build_array('users','test','learningDays'),'exists',true,'before',before_state#>'{users,test,learningDays}','value',-1)));
  exception when raise_exception then if sqlerrm like 'LEARNING_STATE_REGRESSION:%' then failed:=true;else raise;end if;end;
  if not failed then raise exception 'Learning regression guard lost';end if;
  select key,value into entry from jsonb_each(before_state#>'{users,test,studyRounds,entries}') limit 1;
  if entry.key is not null then
   failed:=false;
   begin perform public.save_learning_patch_v2(jsonb_build_array(jsonb_build_object('path',jsonb_build_array('users','test','studyRounds','entries',entry.key,'number'),'exists',true,'before',entry.value->'number','value',9999)));
   exception when raise_exception then if sqlerrm like 'LEARNING_STATE_REGRESSION:%' then failed:=true;else raise;end if;end;
   if not failed then raise exception 'Round renumbering guard lost';end if;
  end if;
  raise exception using errcode='PZ001',message='rollback successful QA writes';
 exception when sqlstate 'PZ001' then null;
 end;
 if before_state is distinct from (select state from public.app_state where user_id=owner_id) then raise exception 'QA writes escaped rollback';end if;
end $test$;
