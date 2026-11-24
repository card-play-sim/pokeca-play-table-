"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {compile}=require("../engine/reference-effect-plans.cjs");
const W=require("../scripts/lib/shared-effect-engine-worker.cjs");
const intake=JSON.parse(fs.readFileSync("data/effect-extensions/intake.json"));
const compiled=JSON.parse(fs.readFileSync("data/effect-extensions/compiled.json"));
const mechanic="ATTACK_COIN_DISCARD_DEFENDER_ENERGY";
const printed=/^コインを1回投げオモテなら、相手のバトルポケモンについている(特殊)?エネルギーを1個選び、トラッシュする。$/;
const prints=new Set();
for(const row of intake.records){
 if(row.category!=="pokemon")continue;
 for(const [i,a] of row.attacks.entries()){
  if(!printed.test(String(a.text||"").replace(/\s+/g,"")))continue;
  const attack=compile({records:[row]}).records[0].attacks[i];
  assert.equal(attack.plan?.mechanic,mechanic,"official coin discard not compiled: "+row.officialCardId);
  assert(attack.plan.commands.includes("COIN_FLIP")&&attack.plan.commands.includes("DISCARD"));
  prints.add(String(row.officialCardId));
 }
}
assert(prints.size>=20,"expected official coin-discard family was not staged");
const candidates=compiled.records.filter(row=>prints.has(String(row.officialCardId)));
assert(candidates.length>=2,"official coin discard is not connected to runtime");
const seedFor=heads=>{
 for(let seed=0;seed<10000;seed++){
  const value=((Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
  if((value<0.5)===heads)return seed;
 }
 throw Error("DETERMINISTIC_COIN_SEED_NOT_FOUND");
};
const results=[],skipped=[];
for(const row of candidates){
 for(const [index,attack] of row.attacks.entries()){
  if(attack.plan?.mechanic!==mechanic||results.length>=10)continue;
  const e={...attack,effectIndex:index},t=W.prepare(row,e,"attack");
  if(t.blocked){skipped.push({id:row.officialCardId,reason:t.blocked});continue;}
  const option=W.effectOption(t,e);
  if(!(option&&(option.enabled??option.ok))){
   skipped.push({id:row.officialCardId,reason:"NO_LEGAL_FIXTURE"});continue;
  }
  const before=t.port.getSnapshot();
  const chosen=option.action.selections?.energy||[];
  assert.equal(chosen.length,Math.min(1,before.players[1].active.energyCards.length));
  assert.equal(W.verifyCase(t,e).status,"SUCCEEDED","real-engine verification failed");
  // Reuse the exact legal game, mutating only the persisted match-owned RNG seed.
  for(const head of [true,false]){
   const initial=JSON.parse(JSON.stringify(before));
   initial.referenceRngState=seedFor(head);
   assert(t.port.loadGame(initial).ok);
   const action=W.effectOption(t,e).action;
   assert(t.port.dispatch("you",action).ok);
   const after=t.port.getSnapshot();
   const events=after.history.slice(initial.history.length);
   const flips=events.filter(x=>x.details?.command==="COIN_FLIP"&&typeof x.details.heads==="boolean"&&!x.details.reference);
   assert.equal(flips.length,1,"printed attack must toss exactly one coin");
   assert.equal(flips[0].details.heads,head,"match-owned RNG coin outcome mismatched");
   const attackDiscards=events.filter(x=>x.details?.command==="DISCARD"&&x.details?.fromZone==="attached");
   if(head&&chosen.length){
    assert(attackDiscards.some(x=>x.details.cardIds?.includes(chosen[0])),
      "heads must physically discard the selected defender Energy");
   }else if(!head){
    assert(!attackDiscards.some(x=>x.details.cardIds?.includes(chosen[0])),
      "tails must not discard defender Energy as an attack effect");
   }
   const saved=t.port.getResumeSnapshot();
   assert(t.port.restoreSession(saved).ok);
   assert.deepEqual(t.port.getSnapshot(),after);
  }
  results.push({id:String(row.officialCardId),effectId:e.effectId});
 }
 if(results.length>=10)break;
}
assert(results.length>=2,"verify heads/tails with at least two official printings");
fs.mkdirSync("test-results",{recursive:true});
fs.writeFileSync("test-results/battle-coin-energy-official.json",
 JSON.stringify({status:"PASS",stagedPrints:prints.size,compiledPrints:candidates.length,
  verifiedInRealGame:results.length,results,skipped,publicBattleVerified:false},null,2)+"\n");
console.log("BATTLE_COIN_ENERGY_OFFICIAL PASS",JSON.stringify({staged:prints.size,compiled:candidates.length,executed:results.length}));
