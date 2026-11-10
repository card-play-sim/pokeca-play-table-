'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve('tests/codex-repair-handoff.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-effect-handoff-'));
try{
 fs.mkdirSync(path.join(dir,'test-results'));
 const triage={schemaVersion:1,kind:'effect-repair-triage',groups:[],status:'NO_FAILURES'};
 const coverage={schemaVersion:1,kind:'fixed-deck-effect-coverage',officialPrintsAdopted:0,
  sharedEffectGaps:[{effectName:'example unresolved mechanic',officialText:'verified text example',
   printIds:['123','456'],status:'BLOCKED_UNCONNECTED'}]};
 fs.writeFileSync(path.join(dir,'test-results/effect-repair-triage.json'),JSON.stringify(triage));
 const coveragePath=path.join(dir,'test-results/fixed-deck-effect-coverage.json');
 fs.writeFileSync(coveragePath,JSON.stringify(coverage));
 const run=()=>spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});
 const result=run();
 assert.equal(result.status,0,result.stderr);
 const handoff=fs.readFileSync(path.join(dir,'test-results/codex-repair-task.md'),'utf8');
 assert.match(handoff,/example unresolved mechanic/);
 assert.match(handoff,/123, 456/);
 assert.match(handoff,/BLOCKED/);
 assert.match(handoff,/no auto-merge or auto-deploy/);
 fs.writeFileSync(coveragePath,JSON.stringify({...coverage,officialPrintsAdopted:1}));
 assert.notEqual(run().status,0,'adopted reference must be rejected');
 fs.rmSync(coveragePath);
 assert.equal(run().status,0,'missing coverage must not fabricate effects');
 assert.match(fs.readFileSync(path.join(dir,'test-results/codex-repair-task.md'),'utf8'),/completeness UNKNOWN/);
 console.log('Shared unresolved effects survive a passing regression: PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
