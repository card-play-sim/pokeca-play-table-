'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs'),{parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const expected={'47802':'MASS_HEAL_OWN','48450':'MASS_HEAL_OWN','48739':'MASS_HEAL_OWN','50557':'PASSIVE_DYNAMIC_MAX_HP','50614':'PASSIVE_DYNAMIC_MAX_HP'};
for(const [id,mechanic] of Object.entries(expected)){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 const row={...parse(proof.html),officialCardId:id,name:'official'};
 const result=compile({records:[row]}).records[0];assert.equal(result.abilities[0].plan.mechanic,mechanic);assert(result.attacks.every(a=>a.plan));
 const plan=result.abilities[0].plan;
 if(mechanic==='MASS_HEAL_OWN'){assert.equal(plan.requiresAttachedType,'草');assert.equal(plan.amount,30);}
 else {assert.equal(plan.type,'草');assert.equal(plan.threshold,6);assert.equal(plan.amount,250);}
 const malformed={...row,abilities:[{...row.abilities[0],text:row.abilities[0].text+'相手の山札を1枚トラッシュする。'}]};
 assert.equal(compile({records:[malformed]}).records[0].abilities[0].plan,null);
}
console.log('公式エネルギー条件付き特性 5印刷版 PASS（対戦合格ではない）');
