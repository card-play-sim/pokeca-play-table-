'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const ids=['50421','50441','50460'];
const raw=JSON.parse(fs.readFileSync('data/official-effect-intake/checkpoint.json'));
for(const id of ids){
 const row=raw.records.find(x=>String(x.officialCardId)===id);assert(row,id);
 const evidence=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));
 assert.equal(crypto.createHash('sha256').update(evidence.html).digest('hex'),evidence.htmlSha256);
 const a=row.abilities.find(x=>x.name==='エナジープレゼント');assert(a);
 assert(evidence.html.includes(a.text));
 const result=compile({records:[row]}).records[0];assert.equal(result.abilities.find(x=>x.name===a.name).plan.mechanic,'ACTIVE_TOP_ENERGY_SEARCH');
 const malformed={...row,abilities:[{...a,text:a.text+'相手の山札を1枚トラッシュする。'}]};
 assert.equal(compile({records:[malformed]}).records[0].abilities[0].plan,null);
}
console.log('担当02 公式特性パターン 3印刷版 PASS（対戦合格ではない）');
