'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'official-effect-batch-'));
const script=path.resolve(__dirname,'../scripts/build-official-effect-codex-batch.cjs');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const run=(rows,expectedCode)=>{
 const input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
 if(rows===null)fs.rmSync(input,{force:true});else fs.writeFileSync(input,JSON.stringify(rows));
 const p=cp.spawnSync(process.execPath,[script,input,output],{encoding:'utf8'});
 assert.equal(p.status,expectedCode,p.stderr+' '+p.stdout);
 return JSON.parse(fs.readFileSync(output,'utf8'));
};
try{
 let batch=run(null,2);assert.equal(batch.status,'PARTIAL_BLOCKED');assert.equal(batch.tasks.length,0);
 const text='自分の山札を2枚引く。',make=(id,kind='ability')=>({officialCardId:id,category:'pokemon',effectKind:kind,effectName:'テスト',effectText:text,officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/'+id,officialTextSha256:sha(text)});
 batch=run([make('45152'),make('45746')],0);
 assert.equal(batch.status,'READY_FOR_CODEX_REVIEW');assert.equal(batch.tasks.length,1);assert.equal(batch.tasks[0].prints.length,2);
 assert.equal(batch.tasks[0].scope,'ONE_SHARED_EFFECT_PATTERN_ALL_AFFECTED_PRINTS');
 batch=run([make('45152'),{...make('45746'),officialTextSha256:'0'.repeat(64)}],2);
 assert.equal(batch.tasks.length,1);assert.equal(batch.counts.blocked,1);
 batch=run([make('45152'),{...make('45152'),effectText:'違う効果',officialTextSha256:sha('違う効果')}],2);
 assert.ok(batch.blocked.some(x=>x.reasons?.includes('CONFLICTING_EFFECT_EVIDENCE')));
 batch=run([make('45152'),make('45152')],2);
 assert.ok(batch.blocked.some(x=>x.reasons?.includes('DUPLICATE_EFFECT_EVIDENCE')));
 batch=run([{...make('45152'),officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/45746/regu/XY'}],2);
 assert.ok(batch.blocked.some(x=>x.reasons?.includes('OFFICIAL_URL_CARD_ID_MISMATCH')));
 batch=run([make('45152'),{...make('45746'),category:'supporter',effectKind:'supporter'}],0);
 assert.equal(batch.tasks.length,2,'CROSS_CATEGORY_EFFECTS_MUST_NOT_BE_MERGED');
 batch=run([{...make('45152'),category:'supporter'}],2);
 assert.ok(batch.blocked.some(x=>x.reasons?.includes('EFFECT_KIND_CATEGORY_MISMATCH')));
 batch=run([{...make('45152'),effectIndex:-1}],2);
 assert.ok(batch.blocked.some(x=>x.reasons?.includes('INVALID_EFFECT_INDEX')));
 batch=run([{...make('45152'),officialPageUrl:'https://example.com/fake'}],2);
 assert.equal(batch.counts.verified,0);
 console.log('OFFICIAL_EFFECT_CODEX_BATCH PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
