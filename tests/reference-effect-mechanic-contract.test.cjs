'use strict';
// Regression contract for every reference print; never an official print approval.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{},console,performance,setTimeout,Math};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);
const engine=context.window.Pokeca;
const catalog=engine.getReferenceEffectCatalog();
assert.equal(catalog.records.length,89);
assert.equal(catalog.adoptedDeckPrints,0);
const byMechanic=new Map();
for(const record of catalog.records){
 assert(record.source?.recordSha256,'missing evidence for '+record.officialCardId);
 for(const effect of [...(record.attacks||[]),...(record.abilities||[])]){
  assert(effect.plan,'unconnected effect '+record.officialCardId+':'+effect.name);
  assert.equal(typeof effect.plan.mechanic,'string');
  assert(effect.plan.commands.length>0);
  const entry=byMechanic.get(effect.plan.mechanic)||{prints:new Set(),effects:0};
  entry.prints.add(record.officialCardId);entry.effects++;
  byMechanic.set(effect.plan.mechanic,entry);
 }
}
for(const [mechanic,minPrints] of Object.entries({
 SWITCH_SELF_ATTACK:2,ANY_DAMAGE:3,ACTIVE_AND_BENCH_DAMAGE:1,
 ATTACK_DAMAGE_MOVE_ENERGY:1,DECK_ENERGY_TO_GRASS_BENCH:1,
 BENCH_NON_RULE_PROTECTION:4
})){
 const entry=byMechanic.get(mechanic);
 assert(entry&&entry.prints.size>=minPrints,
  'shared mechanic coverage lost: '+mechanic);
}
const report={schemaVersion:1,kind:'reference-mechanic-contract',
 referencePrints:catalog.records.length,adoptedPrints:catalog.adoptedDeckPrints,
 mechanics:Object.fromEntries([...byMechanic].sort(([a],[b])=>a.localeCompare(b))
  .map(([name,x])=>[name,{prints:x.prints.size,effects:x.effects}]))};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/reference-mechanic-contract.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS all reference effect plans have commands and six shared mechanic families retain coverage');
