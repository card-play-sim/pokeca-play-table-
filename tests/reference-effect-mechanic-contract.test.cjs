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
const canonicalPlans=JSON.parse(fs.readFileSync('data/reference-effects/plans.json','utf8'));
assert.equal(canonicalPlans.records.length,catalog.records.length,'canonical plans and bundle print count differ');
const canonicalById=new Map(canonicalPlans.records.map(r=>[String(r.officialCardId),r]));
const byMechanic=new Map();
for(const record of catalog.records){
 assert(/^[a-f0-9]{64}$/.test(record.source?.sha256||''),'missing catalog evidence for '+record.officialCardId);
 assert(record.source?.path,'missing source path for '+record.officialCardId);
 const canonical=canonicalById.get(String(record.officialCardId));
 assert(canonical,'missing canonical plan for '+record.officialCardId);
 assert.deepEqual(JSON.stringify(canonical.attacks.map(a=>a.plan)),JSON.stringify(record.attacks.map(a=>a.plan)),
  'canonical attack plan mismatch: '+record.officialCardId);
 assert.deepEqual(JSON.stringify(canonical.abilities.map(a=>a.plan)),JSON.stringify(record.abilities.map(a=>a.plan)),
  'canonical ability plan mismatch: '+record.officialCardId);
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
