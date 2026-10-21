import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ROUND_POLICY,LEGACY_ROUND_POLICY} from '../lib/study-rounds.js';
const sql=fs.readFileSync(new URL('../database/round-policy-compatibility.sql',import.meta.url),'utf8');
const canonical=fs.readFileSync(new URL('../database/round-learning.sql',import.meta.url),'utf8');
assert.ok(sql.endsWith(canonical),'release SQL must use the reviewed canonical definitions');
const functions=sql.split('CREATE OR REPLACE FUNCTION ').slice(1);
assert.equal(functions.length,5);
for(const fn of functions){
 assert.ok(fn.includes(ROUND_POLICY)&&fn.includes(LEGACY_ROUND_POLICY),'every round gate must accept both policies');
 assert.ok(!fn.includes("roundPolicy'='"+LEGACY_ROUND_POLICY+"'"),'no legacy-only equality may invalidate current packets');
 assert.ok(!fn.includes("roundPolicy' is distinct from '"+LEGACY_ROUND_POLICY+"'"));
}
assert.ok(sql.includes("j.payload->>'snapshot' is distinct from p_snapshot"),'learner freshness guard stays enabled');
assert.ok(sql.includes('Preparation owner mismatch')&&sql.includes('Invalid saved bank or template question'));
const integration=fs.readFileSync(new URL('../database/tests/round-policy-compatibility.sql',import.meta.url),'utf8');
assert.ok(integration.includes('public.ensure_prepared_lesson')&&integration.includes('public.consume_prepared_lesson'));
assert.ok(integration.includes('save_reserve_preparation')&&integration.includes('promote_reserve'));
assert.ok(integration.trimEnd().endsWith('rollback;'));
console.log('Round compatibility PASS: current and legacy gates, snapshot/ownership/question safeguards, rollback integration probe.');
