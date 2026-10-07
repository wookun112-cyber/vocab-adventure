import {spawnSync} from 'node:child_process';
const checks=['state-protection','session-levels','lesson-resume','server-preparation','question-loading','question-batches','exploration','learning-model','customization','passage-design','question-bank','level-fit'];
for(const check of checks){
 const result=spawnSync(process.execPath,[new URL('verify-'+check+'.mjs',import.meta.url).pathname],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
