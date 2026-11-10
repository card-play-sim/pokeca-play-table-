'use strict';
// Regression test for the *failure* path of diagnosis, triage and Codex handoff.
// No real card data or published assets are modified.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'effect-triage-'));
try{
 const source=path.join(dir,'diagnostic.json');
 fs.writeFileSync(source,JSON.stringify({schemaVersion:1,kind:'cross-category-effect-regression',success:false,results:[
   {id:'effect-execution',status:'FAIL',failureCategory:'UNCONNECTED_EFFECT',excerpt:'UNCONNECTED_EFFECT officialCardId=example'},
   {id:'reference-identity',status:'FAIL',failureCategory:'REFERENCE_IDENTITY',excerpt:'unverified print'}
 ]}));
 const scripts=['tests/effect-repair-triage.cjs','tests/codex-repair-handoff.cjs'];
 // Run in isolated cwd, with absolute script paths; outputs stay inside temp directory.
 for(const script of scripts){
  const r=spawnSync(process.execPath,[path.resolve(script),...(script===scripts[0]?[source]:[])],{cwd:dir,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr||r.stdout);
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
 console.log('Failure-path triage and Codex handoff: PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
