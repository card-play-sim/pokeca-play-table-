'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'effect-tap-'));
try{
 const log=path.join(dir,'tap.log'),parsed=path.join(dir,'parsed.json'),list=path.join(dir,'list.json'),batch=path.join(dir,'batch.json');
 fs.writeFileSync(log,'TAP version 13\nnot ok 1 - wrong target selection\n  ---\n  error: failed\n  ...\nok 2 - other\nnot ok 3 - wrong target selection\n');
 const call=(script,args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
 assert.equal(call('scripts/parse-effect-regression-log.cjs',[log,parsed]).status,0);
 const p=JSON.parse(fs.readFileSync(parsed));assert.equal(p.failures.length,2);assert.equal(p.requiresOfficialEvidence,true);
 fs.writeFileSync(list,JSON.stringify(p.failures));
 assert.equal(call('scripts/group-effect-failures-for-codex.cjs',[list,batch]).status,0);
 const b=JSON.parse(fs.readFileSync(batch));assert.equal(b.tasks.length,1);assert.equal(b.tasks[0].occurrences,2);assert.equal(b.tasks[0].status,'BLOCKED');
 console.log('PASS TAP-to-Codex triage, shared-cause grouping and official-evidence fail-closed gate');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
