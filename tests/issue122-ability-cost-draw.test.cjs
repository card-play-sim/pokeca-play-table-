'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {verifiedFacts}=require('../scripts/refresh-uncompiled-official-facts.cjs');
const raw=JSON.parse(fs.readFileSync('data/official-effect-intake/checkpoint.json'));
const mechanics=new Set(['ABILITY_DISCARD_DRAW','ABILITY_ATTACH_SELF_DRAW']);
const found=new Map();
for(const row of raw.records){
 if(row.category!=='pokemon')continue;
 const compiled=compile({records:[row]}).records[0];
 for(const [i,a] of compiled.abilities.entries()){
  if(!mechanics.has(a.plan?.mechanic))continue;
  const proof=JSON.parse(fs.readFileSync(row.source.path));
  assert.deepEqual(verifiedFacts(row,proof),row.facts);
  const malformed={...row,abilities:row.abilities.map((x,j)=>j===i?{...x,text:x.text+'その後、相手の山札を1枚トラッシュする。'}:x)};
  assert.equal(compile({records:[malformed]}).records[0].abilities[i].plan,null);
  const ids=found.get(a.plan.mechanic)||new Set();ids.add(row.officialCardId);found.set(a.plan.mechanic,ids);
 }
}
for(const mechanic of mechanics)assert(found.get(mechanic)?.size>0,'NO_OFFICIAL_PATTERN:'+mechanic);
console.log(JSON.stringify({state:'OFFICIAL_PATTERN_GATE_ONLY',matched:[...found].map(([mechanic,ids])=>({mechanic,prints:ids.size,ids:[...ids]}))}));
