'use strict';
// Test both failing diagnostics and malformed diagnostics; never touch real app data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'effect-triage-'));
const triageScript=path.resolve('tests/effect-repair-triage.cjs');
const handoffScript=path.resolve('tests/codex-repair-handoff.cjs');
const source=path.join(dir,'diagnostic.json');
const run=(script,args=[])=>spawnSync(process.execPath,[script,...args],{cwd:dir,encoding:'utf8'});
try{
 const report={schemaVersion:1,kind:'cross-category-effect-regression',success:false,results:[
  {id:'effect-execution',status:'FAIL',failureCategory:'UNCONNECTED_EFFECT',excerpt:'UNCONNECTED_EFFECT officialCardId=example'},
  {id:'reference-identity',status:'FAIL',failureCategory:'REFERENCE_IDENTITY',excerpt:'unverified print'}
 ]};
 fs.writeFileSync(source,JSON.stringify(report));
 for(const [script,args] of [[triageScript,[source]],[handoffScript,[]]]){
  const r=run(script,args);assert.equal(r.status,0,r.stderr||r.stdout);
 }
 const triage=JSON.parse(fs.readFileSync(path.join(dir,'test-results/effect-repair-triage.json'),'utf8'));
 assert.equal(triage.status,'REVIEW_REQUIRED');
 assert.equal(triage.safeToAutoMerge,false);
 assert.equal(triage.officialCardDataEditable,false);
 assert.deepEqual(triage.groups.map(g=>g.category),['UNCONNECTED_EFFECT','REFERENCE_IDENTITY']);
 const handoff=fs.readFileSync(path.join(dir,'test-results/codex-repair-task.md'),'utf8');
 assert.match(handoff,/UNCONNECTED_EFFECT/);
 assert.match(handoff,/REFERENCE_IDENTITY/);
 assert.match(handoff,/no auto-merge or auto-deploy/);
 // A contradictory report must never become NO_FAILURES.
 for(const invalid of [
  {...report,success:false,results:[{id:'effect-execution',status:'PASS'}]},
  {...report,success:true},
  {...report,success:true,results:[{id:'effect-execution',status:'SKIPPED'}]},
  {...report,results:[]}
 ]){
  fs.writeFileSync(source,JSON.stringify(invalid));
  const r=run(triageScript,[source]);
  assert.notEqual(r.status,0,'Malformed diagnostics were accepted');
 }
 console.log('Failure-path and malformed-diagnostic rejection: PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
