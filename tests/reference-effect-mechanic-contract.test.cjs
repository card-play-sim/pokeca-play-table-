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
// Shared selection constraints are consumed by Rule Engine, AI legality and UI.
// Invalid dependent limits must fail closed rather than yield Infinity/NaN.
const selections=require('../engine/pokeca_selection_constraints.cjs');
const dependent=[{key:'source',candidates:[{id:'a',available:4}]},{key:'target',candidates:[{id:'b'}],min:0,max:6,dependencies:[{kind:'maxFromSelection',key:'source',field:'available',divisor:2}]}];
assert.equal(selections.resolve(dependent[1],dependent,{}).max,6,'empty source selection must preserve max');
assert.equal(selections.resolve(dependent[1],dependent,{source:['a']}).max,2,'dependent max must be bounded');
assert.throws(()=>selections.resolve({...dependent[1],dependencies:[{kind:'maxFromSelection',key:'source',field:'available',divisor:0}]},dependent,{source:['a']}),/INVALID_SELECTION_DIVISOR/);
assert.throws(()=>selections.resolve(dependent[1],[{key:'source',candidates:[{id:'a',available:-1}]},dependent[1]],{source:['a']}),/INVALID_SELECTION_LIMIT/);
assert.throws(()=>selections.resolve({key:'missing',dependencies:[]},dependent,{}),/UNKNOWN_SELECTION_REQUEST/);
assert.throws(()=>selections.resolve(dependent[1],dependent,{source:['unknown']}),/INVALID_DEPENDENT_SELECTION/);
assert.throws(()=>selections.resolve(dependent[1],dependent,{source:['a','a']}),/INVALID_DEPENDENT_SELECTION/);
assert.throws(()=>selections.resolve(dependent[1],dependent,{source:'a'}),/INVALID_DEPENDENT_SELECTION/);
assert.throws(()=>selections.resolve({...dependent[0],dependencies:[{kind:'subset',key:'target'}]},dependent,{}),/INVALID_SELECTION_DEPENDENCY/);
const report={schemaVersion:1,kind:'reference-mechanic-contract',
 referencePrints:catalog.records.length,adoptedPrints:catalog.adoptedDeckPrints,
 mechanics:Object.fromEntries([...byMechanic].sort(([a],[b])=>a.localeCompare(b))
  .map(([name,x])=>[name,{prints:x.prints.size,effects:x.effects}]))};
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync('test-results/reference-mechanic-contract.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS all reference effect plans have commands and six shared mechanic families retain coverage');
