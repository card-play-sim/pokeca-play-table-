'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs'),{parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const ids=["45264","46768","49213","47841","49022","45606","48986","47789","48432"];
for(const [i,id] of ids.entries()){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 const row={...parse(proof.html),officialCardId:id,name:'official'},result=compile({records:[row]}).records[0],plan=result.abilities[0].plan;
 assert.equal(plan.mechanic,i<5?'MASS_ENERGY_ROUTE':'ABILITY_TOP_CARD_OPERATION');assert(result.attacks.every(a=>a.plan));
 if(i<5){assert.equal(plan.topWindow,4);assert.equal(plan.remainder,i<3?'shuffleBottom':'shuffle');}
 const bad={...row,abilities:[{...row.abilities[0],text:row.abilities[0].text+'相手の山札を1枚トラッシュする。'}]};assert.equal(compile({records:[bad]}).records[0].abilities[0].plan,null);
}
console.log('公式山札操作特性9印刷版（全対戦証跡ではない）');
