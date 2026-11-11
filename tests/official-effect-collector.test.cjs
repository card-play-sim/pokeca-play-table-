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
 assert.equal(result.processed,1,'BLOCKED_PRINT_MUST_BE_CHECKPOINTED');
 assert.equal(fs.readFileSync(out,'utf8').trim().split('\n').length,1,'INVALID_PRINT_MUST_NOT_APPEND');
 fs.rmSync(out,{force:true});
 const multiple='<h2>特性</h2><h4>能力A</h4><p>山札を1枚引く。</p><h4>能力B</h4><p>山札を2枚引く。</p><h2>特別なルール</h2>';
 result=run(multiple,0);
 assert.equal(result.added,2,'MULTIPLE_ABILITIES_ON_ONE_PRINT_MUST_BE_PRESERVED');
 rows=fs.readFileSync(out,'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(rows.map(x=>x.effectIndex),[0,1]);
 assert.deepEqual(rows.map(x=>x.effectKind),['ability','ability']);
 const before=fs.readFileSync(out,'utf8');
 result=run(multiple.replace('山札を1枚引く。','山札を3枚引く。'),2);
 assert.equal(result.results[0].status,'BLOCKED','CONFLICTING_RESTART_MUST_FAIL');
 assert.equal(fs.readFileSync(out,'utf8'),before,'CONFLICT_MUST_NOT_APPEND_PARTIAL_PRINT');
 fs.rmSync(out,{force:true});
 result=run('<h2>ワザ</h2><h4>技A</h4><p>山札を1枚引く。</p><h2>弱点</h2><h4>炎</h4><p>2倍</p>',0);
 rows=fs.readFileSync(out,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(rows.length,1,'UNRELATED_SECTION_MUST_NOT_BE_EXTRACTED_AS_ATTACK');
 fs.rmSync(out,{force:true});
 result=run('<h2>特性</h2><h4>能力A</h4><p>山札を1枚引く。</p><table><tr><td>混入</td></tr></table>',2);
 assert.equal(result.results[0].status,'BLOCKED','UNSUPPORTED_NESTED_MARKUP_MUST_BLOCK');
 assert.equal(fs.existsSync(out),false,'AMBIGUOUS_HTML_MUST_NOT_CREATE_EVIDENCE');
 console.log('OFFICIAL_EFFECT_COLLECTOR PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
