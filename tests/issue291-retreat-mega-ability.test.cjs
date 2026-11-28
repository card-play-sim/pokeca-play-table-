'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs'),{parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const expected={'50470':'opponentEx','50346':'opponentEx','46525':'benchAura','50583':'benchAura','48347':'megaHeal','48487':'megaHeal'};
for(const [id,mode] of Object.entries(expected)){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 const row={...parse(proof.html),officialCardId:id,name:'official'};
 const result=compile({records:[row]}).records[0],plan=result.abilities[0].plan;
 assert(result.attacks.every(a=>a.plan));
 if(mode==='megaHeal'){assert.equal(plan.mechanic,'MASS_HEAL_OWN');assert.equal(plan.requiresMegaType,'草');assert.equal(plan.amount,60);}
 else {assert.equal(plan.mechanic,'PASSIVE_CONDITIONAL_RETREAT');assert.equal(plan.mode,mode);if(mode==='benchAura')assert.equal(plan.amount,2);}
 const malformed={...row,abilities:[{...row.abilities[0],text:row.abilities[0].text+'相手の山札を1枚トラッシュする。'}]};
 assert.equal(compile({records:[malformed]}).records[0].abilities[0].plan,null);
}
console.log('公式条件付き特性6印刷版 PASS（対戦合格ではない）');
