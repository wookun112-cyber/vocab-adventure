import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const publicFiles=['index.html','app.js','app.css','service-worker.js','manifest.webmanifest','version.json','icon.svg','lib/learning-model.js','lib/daily-practice.js','lib/authored-policy.js','lib/sentence-use-template.js','lib/local-delivery.js','lib/study-history.js'];
export function buildPublic(source=root,output=path.join(source,'public')){
 fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
 for(const file of publicFiles){const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,file),target)}
 return output;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const checks=spawnSync(process.execPath,[path.join(root,'scripts/verify-all.mjs')],{stdio:'inherit'});
 if(checks.error)throw checks.error;if(checks.status!==0)process.exit(checks.status||1);
 buildPublic();console.log('Public build contains only frontend assets; server source and bank archive stay outside static output.');
}
