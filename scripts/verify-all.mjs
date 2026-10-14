import {spawnSync} from 'node:child_process';
const checks=['grading-reliability','audit-bank-recovery','grade-cache','storage-activity-assessment','long-term-retention','level-four-bank','level-five-six-bank','static-boundary','auth-recovery','study-history','idle-study-clock','realtime-level','vocabulary-coverage','level-one-retirement','essential-vocabulary','review-window','sentence-use','local-delivery','authored-bank','unlimited-usage','minimum-study','credit-block','difficulty-audit','descriptive-targets','written-tasks','state-protection','session-levels','lesson-resume','server-preparation','question-loading','question-batches','exploration','learning-model','customization','passage-design','question-bank','level-fit'];
for(const check of checks){
 const result=spawnSync(process.execPath,[new URL('verify-'+check+'.mjs',import.meta.url).pathname],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}


