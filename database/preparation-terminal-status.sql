-- packet_complete(NULL) is NULL, not false. Exhausted work without a first
-- checkpoint must be reported as failed instead of polling "pending" forever.
do $migration$
declare signature text; definition text; before text:='j.attempts>=8 and not vocab_private.packet_complete(j.payload)';
begin
 foreach signature in array array['vocab_private.get_prepared_lesson(text,uuid)','vocab_private.ensure_prepared_lesson(text,text,boolean)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if strpos(definition,before)=0 then raise exception 'Terminal status anchor changed: %',signature;end if;
  execute replace(definition,before,'j.attempts>=8 and not coalesce(vocab_private.packet_complete(j.payload),false)');
 end loop;
end $migration$;
