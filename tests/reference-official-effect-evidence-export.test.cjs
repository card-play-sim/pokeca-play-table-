'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reference-evidence-export-'));
try{
 const source=path.resolve(__dirname,'../data/reference-effects/plans.json');
 const output=path.join(dir,'evidence.json');
 const run=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/export-reference-official-effect-evidence.cjs'),source,output],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr+' '+run.stdout);
 const original=JSON.parse(fs.readFileSync(source,'utf8')),rows=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.equal(original.records.length,89);
 assert.ok(rows.length>=100,'INSUFFICIENT_VERIFIED_REFERENCE_EFFECT_TEXT');
 assert.ok(rows.some(x=>x.effectKind==='attack')&&rows.some(x=>x.effectKind==='ability'));
 for(const category of ['item','supporter','stadium','tool','energy'])assert.ok(rows.some(x=>x.category===category),'MISSING_EFFECT_CATEGORY:'+category);
 for(const row of rows){
  assert.equal(row.provenance.referenceOnly,true);
  assert.ok(original.records.some(x=>String(x.officialCardId)===row.officialCardId));
  assert.equal(crypto.createHash('sha256').update(row.effectText).digest('hex'),row.officialTextSha256);
  assert.match(row.officialPageUrl,/^https:\/\/www\.pokemon-card\.com\//);
 }
 const ndjson=path.join(dir,'intake.ndjson'),registry=path.join(dir,'intake-registry.json');
 fs.writeFileSync(ndjson,rows.map(x=>JSON.stringify(x)).join('\\n')+'\\n');
 const imported=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/import-official-effect-evidence.cjs'),ndjson,registry],{encoding:'utf8'});
 assert.equal(imported.status,0,imported.stderr+' '+imported.stdout);
 assert.equal(JSON.parse(fs.readFileSync(registry,'utf8')).length,rows.length);
 const repeat=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/import-official-effect-evidence.cjs'),ndjson,registry],{encoding:'utf8'});
 assert.equal(repeat.status,0,repeat.stderr+' '+repeat.stdout);
 assert.equal(JSON.parse(fs.readFileSync(registry,'utf8')).length,rows.length);
 const batch=path.join(dir,'batch.json');
 const p=cp.spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/build-official-effect-codex-batch.cjs'),output,batch],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr+' '+p.stdout);
 const data=JSON.parse(fs.readFileSync(batch,'utf8'));
 assert.equal(data.counts.verified,rows.length);
 assert.equal(data.counts.blocked,0);
 assert.ok(data.tasks.length>0);
 console.log('REFERENCE_OFFICIAL_EFFECT_EVIDENCE_EXPORT PASS',JSON.stringify({referencePrints:original.records.length,effectTexts:rows.length,sharedPatterns:data.tasks.length}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
