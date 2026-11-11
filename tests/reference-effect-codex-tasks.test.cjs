'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../scripts/build-reference-effect-codex-tasks.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-codex-tasks-')),input=path.join(dir,'batch.json'),output=path.join(dir,'tasks.json');
const run=()=>spawnSync(process.execPath,[script,input,output],{encoding:'utf8'});
const base={purpose:'CODEX_CROSS_JOB_SHARED_CAUSE_BATCH',expectedJobs:7,gaps:[],issues:[]};
try{
 fs.writeFileSync(input,JSON.stringify(base));
 assert.equal(run().status,0);
 let report=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.equal(report.taskCount,0);assert.equal(report.automatedFixAuthorized,false);
 const issue={causeId:'INVALID_TARGET',command:'MOVE_DAMAGE_COUNTERS',occurrences:2,affectedJobs:['smoke','multi-turn'],affectedTests:['tests/a.test.cjs'],affectedPrints:['48248','48249']};
 fs.writeFileSync(input,JSON.stringify({...base,issues:[issue]}));
 assert.equal(run().status,0);
 const first=fs.readFileSync(output,'utf8');
 assert.equal(run().status,0);assert.equal(fs.readFileSync(output,'utf8'),first);
 report=JSON.parse(first);
 assert.equal(report.taskCount,1);
 assert.equal(report.tasks[0].scope,'SHARED_MECHANIC_NOT_SINGLE_CARD');
 assert.deepEqual(report.tasks[0].affectedPrints,['48248','48249']);
 assert.ok(report.tasks[0].forbiddenMutations.includes('data/reference-effects/plans.json'));
 fs.writeFileSync(input,JSON.stringify({...base,gaps:[{job:'provenance',reason:'MISSING_JOB_CAUSE_ARTIFACT'}],issues:[issue]}));
 assert.equal(run().status,2);
 assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).blockedByMissingOrInvalidEvidence,true);
 console.log('CODEX_SHARED_EFFECT_TASK_GATE PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
