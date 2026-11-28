'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs'),{parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const expected={"46394":"ABILITY_HAND_COST_EFFECT","47031":"PASSIVE_TEAM_MAX_HP","47555":"ABILITY_HAND_COST_EFFECT","47664":"PASSIVE_ACTIVE_TRAINER_LOCK","47928":"ABILITY_HAND_COST_EFFECT","48074":"PASSIVE_ACTIVE_TRAINER_LOCK","48082":"PASSIVE_ACTIVE_TRAINER_LOCK","48840":"ABILITY_HAND_COST_EFFECT","48893":"PASSIVE_TEAM_MAX_HP","49048":"ABILITY_HAND_COST_EFFECT"};
for(const [id,mechanic] of Object.entries(expected)){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 const row={...parse(proof.html),officialCardId:id,name:'official'};
 const result=compile({records:[row]}).records[0];assert.equal(result.abilities[0].plan.mechanic,mechanic);assert(result.attacks.every(a=>a.plan));
 const bad={...row,abilities:[{...row.abilities[0],text:row.abilities[0].text+'相手の山札を1枚トラッシュする。'}]};assert.equal(compile({records:[bad]}).records[0].abilities[0].plan,null);
}
console.log('公式条件特性10印刷版（全対戦証跡ではない）');
