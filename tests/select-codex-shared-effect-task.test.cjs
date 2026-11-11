'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-shared-select-'));
const input=path.join(dir,'batch.json'),output=path.join(dir,'task.md'),script=path.resolve(__dirname,'../scripts/select-codex-shared-effect-task.cjs');
const batch={purpose:'OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH',status:'READY_FOR_CODEX_REVIEW',counts:{blocked:0},tasks:[{taskId:'OFFICIAL_SHARED_EFFECT_0001',status:'CODEX_REVIEW_REQUIRED',category:'pokemon',effectKind:'ability',officialText:'山札を2枚引く。',normalizedTextHash:crypto.createHash('sha256').update('山札を2枚引く。').digest('hex'),prints:['45152'],evidence:[{officialCardId:'45152',officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/45152'}],acceptance:['REGRESSION_PASS']}]};
const run=(id,code)=>{fs.writeFileSync(input,JSON.stringify(batch));const r=cp.spawnSync(process.execPath,[script,input,id,output],{encoding:'utf8'});assert.equal(r.status,code,r.stderr+' '+r.stdout);};
try{
 run('OFFICIAL_SHARED_EFFECT_0001',0);
 assert.match(fs.readFileSync(output,'utf8'),/OFFICIAL_EFFECT_TEXT:/);
 const before=fs.readFileSync(output,'utf8');
 run('MISSING_TASK',1);assert.equal(fs.readFileSync(output,'utf8'),before);
 batch.tasks[0].normalizedTextHash='0'.repeat(64);run('OFFICIAL_SHARED_EFFECT_0001',1);
 batch.tasks[0].normalizedTextHash=crypto.createHash('sha256').update('山札を2枚引く。').digest('hex');
 batch.status='PARTIAL_BLOCKED';run('OFFICIAL_SHARED_EFFECT_0001',1);
 assert.equal(fs.readFileSync(output,'utf8'),before);
 console.log('SELECT_CODEX_SHARED_EFFECT_TASK PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
