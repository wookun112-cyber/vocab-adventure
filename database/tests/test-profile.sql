-- Rollback-only integration probe for the existing family owner.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"06c78577-b96e-4919-b979-58683ff5946e","role":"authenticated"}',true);
select public.save_learning_patch_v2('[{"path":["users","test"],"exists":false,"value":{"name":"테스트","difficulty":2,"words":{},"sessions":[]}}]'::jsonb);
select public.get_topup_learner('test')->>'difficulty' as test_difficulty;
rollback;
