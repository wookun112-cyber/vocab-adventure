import {spawnSync} from 'node:child_process';
const checks=['start-reliability','correct-cooldown','round-policy-compatibility','durable-grading','automatic-recovery','round-learning','breadth-learning','exact-word-grading','meaning-grading','preparation-failure','grade-polling','archived-grade-recovery','unfinished-usage','interaction-hardening','grade-access','bank-wide-feedback','storage-safety','device-store','grade-preservation','choice-feedback','bank-only','bank-preflight','daily-recovery','grading-reliability','audit-bank-recovery','grade-cache','storage-activity-assessment','long-term-retention','level-four-bank','level-five-six-bank','static-boundary','auth-recovery','study-history','idle-study-clock','realtime-level','promotion-policy','complete-mastery','vocabulary-coverage','level-one-retirement','essential-vocabulary','review-window','sentence-use','local-delivery','authored-bank','unlimited-usage','minimum-study','same-day-repeat','sino-korean-roots','credit-block','difficulty-audit','descriptive-targets','written-tasks','state-protection','session-levels','lesson-resume','server-preparation','question-loading','question-batches','exploration','learning-model','customization','passage-design','question-bank','level-fit'];
// Run every independent regression to report all incompatible assumptions
// from a wide policy migration in one CI pass rather than masking later bugs.
const failed=[];
for(const check of checks){
 const result=spawnSync(process.execPath,[new URL('verify-'+check+'.mjs',import.meta.url).pathname],{stdio:'inherit'});
 if(result.error||result.status!==0){failed.push(check);console.error('REGRESSION FAILED:',check,result.error?.message||result.status)}
}
if(failed.length){console.error('FAILED CHECKS:',failed.join(', '));process.exit(1)}
