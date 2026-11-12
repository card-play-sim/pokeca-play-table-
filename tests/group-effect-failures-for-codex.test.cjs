'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'effect-codex-'));
try{
 const input=path.join(dir,'failures.json'),output=path.join(dir,'tasks.json');
 const failures=[
  {causeId:'SHARED_TARGET_SELECTION',command:'ATTACK',officialCardId:'12345',category:'attack',test:'tests/reference-effects.test.cjs',evidencePath:'data/reference-effects/plans.json'},
  {causeId:'SHARED_TARGET_SELECTION',command:'ATTACK',officialCardId:'12346',category:'attack',test:'tests/reference-effects.test.cjs',evidencePath:'data/reference-effects/plans.json'},
  {causeId:'MISSING_PROVENANCE',command:'ABILITY',officialCardId:'12347',category:'ability',test:'tests/reference-effects.test.cjs'}];
 fs.writeFileSync(input,JSON.stringify(failures));
 const run=()=>spawnSync(process.execPath,['scripts/group-effect-failures-for-codex.cjs',input,output],{encoding:'utf8'});
 assert.equal(run().status,0);const first=fs.readFileSync(output,'utf8');assert.equal(run().status,0);assert.equal(fs.readFileSync(output,'utf8'),first,'deterministic output');
 const batch=JSON.parse(first);assert.equal(batch.tasks.length,2);
 const ready=batch.tasks.find(t=>t.causeId==='SHARED_TARGET_SELECTION');
 assert.equal(ready.status,'CODEX_REVIEW_REQUIRED');assert.deepEqual(ready.prints,['12345','12346']);assert.equal(ready.occurrences,2);
 assert.equal(batch.tasks.find(t=>t.causeId==='MISSING_PROVENANCE').status,'BLOCKED');
 fs.writeFileSync(input,JSON.stringify([{causeId:'BAD',command:'ATTACK',officialCardId:'../bad'}]));
 assert.notEqual(run().status,0,'unsafe identity must fail closed');
 console.log('PASS shared-cause Codex grouping, evidence gate, deterministic batch and fail-closed validation');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
