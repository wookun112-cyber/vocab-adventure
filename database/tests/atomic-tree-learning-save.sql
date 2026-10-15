-- Run after database/atomic-tree-learning-save.sql. Synthetic data only.
-- No learner tables are written by these pure-function assertions.
begin;
set local statement_timeout='8000ms';
do $test$
declare a jsonb;b jsonb;ops jsonb;failed boolean; i integer;
begin
 a:='{"users":{"ayoung":{"answers":[{"text":"keep","score":1},{"text":"old","score":0}],"draft":"original","nullable":null},"inseong":{"untouched":true}}}'::jsonb;
 ops:='[{"path":["users","ayoung","answers","1","text"],"exists":true,"before":"old","value":"new"},{"path":["users","ayoung","answers","2"],"exists":false,"value":{"text":"append","score":0.5}},{"path":["users","ayoung","nullable"],"exists":true,"before":null,"value":"non-null"},{"path":["users","ayoung","draft"],"exists":true,"before":"original","remove":true}]';
 b:=vocab_private.apply_learning_patch_tree(a,ops);
 if b#>>'{users,ayoung,answers,1,text}'<>'new' or jsonb_array_length(b#>'{users,ayoung,answers}')<>3 or b#>'{users,ayoung,answers,0}'<>a#>'{users,ayoung,answers,0}' or b#>'{users,inseong}'<>a#>'{users,inseong}' or b#>'{users,ayoung,draft}' is not null then raise exception 'Mixed tree patch failed';end if;
 if vocab_private.apply_learning_patch_tree(b,ops)<>b then raise exception 'Idempotency failed';end if;
 failed:=false;
 begin perform vocab_private.apply_learning_patch_tree(a,'[{"path":["users","ayoung","draft"],"exists":true,"before":"wrong","value":"bad"}]');exception when no_data_found then failed:=true;end;
 if not failed then raise exception 'Expected-value conflict not rejected';end if;
 failed:=false;
 begin perform vocab_private.apply_learning_patch_tree(a,'[{"path":["users","ayoung"],"exists":false,"value":{}},{"path":["users","ayoung","draft"],"exists":true,"before":"original","value":"bad"}]');exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'Overlapping parent/child paths not rejected';end if;
 for i in 0..49 loop
  a:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',0,'text','retained'),jsonb_build_object('id',1,'text','before','score',0)),'unrelated',i);
  ops:=jsonb_build_array(jsonb_build_object('path',jsonb_build_array('items','1','text'),'exists',true,'before','before','value','after'||i),jsonb_build_object('path',jsonb_build_array('items','1','score'),'exists',true,'before',0,'value',i),jsonb_build_object('path',jsonb_build_array('items','2'),'exists',false,'value',jsonb_build_object('id',2,'text','new')));
  b:=vocab_private.apply_learning_patch_tree(a,ops);
  if b is distinct from jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',0,'text','retained'),jsonb_build_object('id',1,'text','after'||i,'score',i),jsonb_build_object('id',2,'text','new')),'unrelated',i) then raise exception 'Array patch mismatch';end if;
 end loop;
end $test$;
select 'PASS: pure tree merge regression assertions' as result;
rollback;
