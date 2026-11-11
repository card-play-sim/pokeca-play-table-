'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'official-collector-'));
const script=path.resolve(__dirname,'../scripts/collect-official-effect-pages.cjs');
const ids=path.join(dir,'ids.json'),out=path.join(dir,'evidence.ndjson'),report=path.join(dir,'report.json');
fs.writeFileSync(ids,JSON.stringify(['48248']));
function run(html,status){
 const bootstrap='global.fetch=async url=>({ok:true,status:200,url,text:async()=>'+JSON.stringify(html)+'});process.argv=[process.execPath,'+JSON.stringify(script)+','+JSON.stringify(ids)+','+JSON.stringify(out)+','+JSON.stringify(report)+'];require('+JSON.stringify(script)+');';
 const p=cp.spawnSync(process.execPath,['-e',bootstrap],{encoding:'utf8'});
 assert.equal(p.status,status,p.stderr+' '+p.stdout);
 return JSON.parse(fs.readFileSync(report,'utf8'));
}
try{
 const valid='<html><h2>ワザ</h2><h4>ハイドロターン</h4><p>このポケモンをベンチポケモンと入れ替える。</p><h2>特別なルール</h2></html>';
 let result=run(valid,0);
 assert.equal(result.added,1);
 let rows=fs.readFileSync(out,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(rows[0].effectKind,'attack');
 assert.equal(rows[0].effectText,'このポケモンをベンチポケモンと入れ替える。');
 result=run(valid,0);assert.equal(result.added,0,'RESTART_MUST_BE_IDEMPOTENT');
 result=run('<h2>ワザ</h2><h4>なみのり</h4><p></p><h2>特別なルール</h2>',2);
 assert.equal(result.results[0].status,'BLOCKED');
 assert.equal(fs.readFileSync(out,'utf8').trim().split('\n').length,1,'INVALID_PRINT_MUST_NOT_APPEND');
 console.log('OFFICIAL_EFFECT_COLLECTOR PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
