'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs'),{parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const ids=["46019","46792","48661","49973","47772","48428","49171","46013","46169","49249","47014","47221"];
for(const [i,id] of ids.entries()){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 const row={...parse(proof.html),officialCardId:id,name:'official'},result=compile({records:[row]}).records[0],plan=result.abilities[0].plan;
 assert.equal(plan.mechanic,i<4?'MASS_ZONE_TRANSFER':'PASSIVE_ACTIVE_HIT_RETALIATION');
 const bad={...row,abilities:[{...row.abilities[0],text:row.abilities[0].text+'相手の山札を1枚トラッシュする。'}]};assert.equal(compile({records:[bad]}).records[0].abilities[0].plan,null);
}
console.log('公式反撃・初回検索特性12印刷版（全対戦証跡ではない）');
