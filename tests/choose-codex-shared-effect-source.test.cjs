'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-source-')),script=path.resolve(__dirname,'../scripts/choose-codex-shared-effect-source.cjs');
const a=path.join(dir,'work.json'),b=path.join(dir,'reference.json'),out=path.join(dir,'selected.json');
const make=(id,hash)=>({purpose:'OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH',status:'READY_FOR_CODEX_REVIEW',counts:{blocked:0},tasks:[{taskId:id,normalizedTextHash:hash,category:'pokemon',effectKind:'ability'}]});
const run=(id,status)=>{const r=cp.spawnSync(process.execPath,[script,id,out,a,b],{encoding:'utf8'});assert.equal(r.status,status,r.stderr+' '+r.stdout);};
try{
 fs.writeFileSync(a,JSON.stringify(make('WORK_A','a')));
 fs.writeFileSync(b,JSON.stringify(make('REFERENCE_B','b')));
 run('REFERENCE_B',0);assert.equal(JSON.parse(fs.readFileSync(out)).tasks[0].taskId,'REFERENCE_B');
 run('WORK_A',0);assert.equal(JSON.parse(fs.readFileSync(out)).tasks[0].taskId,'WORK_A');
 run('AUTO',0);assert.equal(JSON.parse(fs.readFileSync(out)).tasks[0].taskId,'WORK_A');
 const before=fs.readFileSync(out,'utf8');
 run('UNKNOWN',1);assert.equal(fs.readFileSync(out,'utf8'),before);
 fs.writeFileSync(a,JSON.stringify(make('REFERENCE_B','different')));
 run('REFERENCE_B',1);assert.equal(fs.readFileSync(out,'utf8'),before);
 console.log('CHOOSE_CODEX_SHARED_EFFECT_SOURCE PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
