import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildPublic,publicFiles} from './build-public.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=fs.mkdtempSync(path.join(os.tmpdir(),'vocab-public-'));
try{
 buildPublic(root,output);
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 assert.equal(config.outputDirectory,'public');assert.equal(config.buildCommand,'node scripts/build-public.mjs');
 for(const file of publicFiles){
  assert.ok(fs.existsSync(path.join(output,file)));assert.equal(fs.readFileSync(path.join(output,file),'utf8'),fs.readFileSync(path.join(root,file),'utf8'));
  if(file.endsWith('.js'))for(const match of fs.readFileSync(path.join(output,file),'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g))assert.ok(fs.existsSync(path.resolve(output,path.dirname(file),match[1])),'Missing public import '+match[1]);
 }
 for(const folder of ['api','database','scripts','node_modules'])assert.ok(!fs.existsSync(path.join(output,folder)),'Server source leaked into public output');
 assert.ok(!publicFiles.some(f=>/authored-bank/.test(f)));
 console.log('Static boundary verified: frontend files/imports preserved; API, archive, database and build sources excluded from public output.');
}finally{fs.rmSync(output,{recursive:true,force:true})}
