'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compile}=require('../engine/reference-effect-plans.cjs');
const evidence=JSON.parse(fs.readFileSync('data/official-effect-intake/checkpoint.json','utf8')).records;
const compileOne=(name,text,damage)=>compile({records:[{officialCardId:'48260',category:'pokemon',name:'Official test Pokémon',facts:{basic:true},attacks:[{name,text,damage,cost:['闘']}],abilities:[]}]}).records[0].attacks[0].plan;
let slots=0;
const signatures=new Set();
for(const print of evidence){
 for(const attack of print.attacks||[]){
  const text=attack.text.replace(/\s+/g,'').normalize('NFKC');
  const match=text.match(/^次の自分の番、このポケモンは「([^」]+)」が使えない。$/);
  if(!match||!/^\d+$/.test(String(attack.damage))||attack.name!==match[1])continue;
  const plan=compileOne(attack.name,attack.text,attack.damage);
  assert(plan,'named effect must compile '+text);
  assert.equal(plan.mechanic,'ATTACK_NAMED_NEXT_TURN_LOCK');
  assert.equal(plan.attackName,match[1]);
  assert.deepEqual(plan.commands,['DAMAGE','ADD_STATE']);
  assert.equal(compileOne('違うワザ',attack.text,attack.damage),null,
    'never disable an attack if printed move name differs from the effect text');
  slots++;
  signatures.add(JSON.stringify([text,attack.damage,attack.cost]));
 }
}
assert(signatures.size>=15&&slots>=30,'must cover multiple official attack patterns and printings');
for(const [name,text,damage] of [
 ['かそくづき','次の自分の番、このポケモンは「かそくづき」が使えない。その後、山札を1枚引く。','30'],
 ['かそくづき','次の自分の番、このポケモンは「かそくづき」が使えない。','30+'],
 ['かそくづき','次の相手の番、このポケモンは「かそくづき」が使えない。','30']
])assert.equal(compileOne(name,text,damage),null,'unrecognized official effects must fail closed');
const runtime=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
assert.match(runtime,/NAMED_ATTACK_LOCKED_THIS_TURN/);
assert.match(runtime,/referenceNamedAttackLock=\{turn:g.turnNumber\+2/);
assert.match(runtime,/delete c\.referenceNamedAttackLock/);
const worker=fs.readFileSync('scripts/lib/shared-effect-engine-worker.cjs','utf8');
assert.match(worker,/e\.plan\.mechanic === "ATTACK_NAMED_NEXT_TURN_LOCK"/);
console.log(JSON.stringify({passed:true,sharedMechanic:'ATTACK_NAMED_NEXT_TURN_LOCK',sourceGroups:signatures.size,effectSlots:slots}));
