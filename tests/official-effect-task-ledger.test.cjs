'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shared-effect-ledger-'));
const script=path.resolve(__dirname,'../scripts/official-effect-task-ledger.cjs');
const batch=path.join(dir,'batch.json'),ledger=path.join(dir,'ledger.json');
const id='OFFICIAL_SHARED_EFFECT_0123456789ABCDEF';
fs.writeFileSync(batch,JSON.stringify({purpose:'OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH',tasks:[{taskId:id,status:'CODEX_REVIEW_REQUIRED',prints:['48248','48249']}]}));
function run(command,task='',status='',expected=0){const p=cp.spawnSync(process.execPath,[script,batch,ledger,command,task,status],{encoding:'utf8'});assert.equal(p.status,expected,p.stderr+p.stdout);return p.stdout.trim();}
try{
 assert.match(run('sync'),/"added":1/);assert.match(run('sync'),/"added":0/);
 assert.equal(run('next'),id);run('set',id,'RUNNING');
 assert.equal(run('next','','',2),'NO_ELIGIBLE_TASK');
 run('set',id,'FAILED');run('set',id,'RETRY');assert.equal(run('next'),id);
 run('set',id,'RUNNING');run('set',id,'REVIEW');run('set',id,'VERIFIED');
 assert.equal(run('next','','',2),'NO_ELIGIBLE_TASK');
 const saved=JSON.parse(fs.readFileSync(ledger));assert.equal(saved.tasks[id].attempts,2);
 assert.equal(saved.tasks[id].history.length,6);
 assert.match(run('summary'),/"VERIFIED":1/);
 console.log('SHARED_EFFECT_TASK_LEDGER PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
