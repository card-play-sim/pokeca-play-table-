'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'official-reference-compare-'));
const script=path.resolve(__dirname,'../scripts/compare-collected-reference-effects.cjs');
const ref=path.join(dir,'ref.json'),evidence=path.join(dir,'evidence.json'),report=path.join(dir,'report.json');
const text='山札を1枚引く。',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(ref,JSON.stringify({records:[{officialCardId:'48248',category:'pokemon',attacks:[{name:'ワザA',text}],abilities:[]}]}));
function run(rows,code){
 fs.writeFileSync(evidence,JSON.stringify(rows));
 const p=cp.spawnSync(process.execPath,[script,ref,evidence,report],{encoding:'utf8'});
 assert.equal(p.status,code,p.stderr+' '+p.stdout);
 return JSON.parse(fs.readFileSync(report,'utf8'));
}
const row={officialCardId:'48248',effectKind:'attack',effectName:'ワザA',effectIndex:0,effectText:text,officialTextSha256:sha(text)};
try{
 assert.equal(run([row],0).matched,1);
 assert.equal(run([{...row,effectText:'山札を2枚引く。',officialTextSha256:sha('山札を2枚引く。')}],2).blocked,1);
 assert.equal(run([{...row,officialTextSha256:'bad'}],2).blocked,1);
 assert.equal(run([],2).compared,0);
 console.log('OFFICIAL_REFERENCE_COMPARISON PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
