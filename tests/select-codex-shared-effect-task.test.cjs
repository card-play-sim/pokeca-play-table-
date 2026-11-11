'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-shared-select-'));
const input=path.join(dir,'batch.json'),output=path.join(dir,'task.md'),script=path.resolve(__dirname,'../scripts/select-codex-shared-effect-task.cjs');
const taskHash=crypto.createHash('sha256').update('山札を2枚引く。').digest('hex');
const taskId='OFFICIAL_SHARED_EFFECT_'+crypto.createHash('sha256').update('pokemon:ability:'+taskHash).digest('hex').slice(0,16).toUpperCase();
const batch={purpose:'OFFICIAL_EFFECT_SHARED_MECHANIC_CODEX_BATCH',status:'READY_FOR_CODEX_REVIEW',counts:{blocked:0},tasks:[{taskId:taskId,status:'CODEX_REVIEW_REQUIRED',category:'pokemon',effectKind:'ability',officialText:'山札を2枚引く。',normalizedTextHash:crypto.createHash('sha256').update('山札を2枚引く。').digest('hex'),prints:['45152'],evidence:[{officialCardId:'45152',officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/45152',officialTextSha256:crypto.createHash('sha256').update('山札を2枚引く。').digest('hex'),effectText:'山札を2枚引く。',category:'pokemon',effectKind:'ability'}],acceptance:['REGRESSION_PASS']}]};
const run=(id,code)=>{fs.writeFileSync(input,JSON.stringify(batch));const r=cp.spawnSync(process.execPath,[script,input,id,output],{encoding:'utf8'});assert.equal(r.status,code,r.stderr+' '+r.stdout);};
try{
 run('AUTO',0);
 assert.match(fs.readFileSync(output,'utf8'),new RegExp('TASK_ID: '+taskId));
 run(taskId,0);
 assert.match(fs.readFileSync(output,'utf8'),/OFFICIAL_EFFECT_TEXT:/);
 const originalText=batch.tasks[0].officialText;
 batch.tasks[0].officialText='山札を  2枚引く。';
 batch.tasks[0].normalizedTextHash=crypto.createHash('sha256').update('山札を 2枚引く。').digest('hex');
 batch.tasks[0].evidence[0].effectText='山札を  2枚引く。';
 batch.tasks[0].evidence[0].officialTextSha256=crypto.createHash('sha256').update(batch.tasks[0].evidence[0].effectText).digest('hex');
 run(taskId,1); // Content changed without updating stable task ID: reject.
 batch.tasks[0].officialText=originalText;
 batch.tasks[0].normalizedTextHash=crypto.createHash('sha256').update(originalText).digest('hex');
 batch.tasks[0].evidence[0].effectText=originalText;
 batch.tasks[0].evidence[0].officialTextSha256=crypto.createHash('sha256').update(originalText).digest('hex');
 batch.tasks[0].prints=['invalid-id'];run(taskId,1);
 batch.tasks[0].prints=['45152'];
 batch.tasks[0].evidence[0].officialPageUrl='https://www.pokemon-card.com/card-search/details.php/card/451520';run(taskId,1);
 batch.tasks[0].evidence[0].officialPageUrl='https://www.pokemon-card.com/card-search/details.php/card/45152';
 run(taskId,0);
 const savedEvidence=batch.tasks[0].evidence[0].effectText;
 batch.tasks[0].evidence[0].effectText='偽の効果';
 run(taskId,1);
 batch.tasks[0].evidence[0].effectText=savedEvidence;
 batch.tasks[0].evidence.push({...batch.tasks[0].evidence[0]});
 run(taskId,1);
 batch.tasks[0].evidence.pop();
 batch.tasks[0].evidence.push({...batch.tasks[0].evidence[0],effectIndex:1});
 run(taskId,0); // A second distinct effect slot on the same print is valid.
 batch.tasks[0].evidence.pop();
 const before=fs.readFileSync(output,'utf8');
 run('MISSING_TASK',1);assert.equal(fs.readFileSync(output,'utf8'),before);
 batch.tasks[0].normalizedTextHash='0'.repeat(64);run(taskId,1);
 batch.tasks[0].normalizedTextHash=crypto.createHash('sha256').update('山札を2枚引く。').digest('hex');
 batch.status='PARTIAL_BLOCKED';run(taskId,1);
 assert.equal(fs.readFileSync(output,'utf8'),before);
 console.log('SELECT_CODEX_SHARED_EFFECT_TASK PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
