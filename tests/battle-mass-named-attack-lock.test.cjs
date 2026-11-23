'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compile}=require('../engine/reference-effect-plans.cjs');
const groups=JSON.parse(fs.readFileSync('reports/official-effect-continuation/atomic-battle-connection-shared-mechanic-worklist.json','utf8')).groups;
const compileOne=(name,text,damage)=>compile({records:[{officialCardId:'48260',category:'pokemon',name:'Official test Pokémon',facts:{basic:true},attacks:[{name,text,damage,cost:['闘']}],abilities:[]}]}).records[0].attacks[0].plan;
let slots=0,matched=0;
for(const group of groups){
 if(group.effectKind!=='attack')continue;
 const text=group.exampleOfficialText.replace(/\s+/g,'').normalize('NFKC');
 const match=text.match(/^次の自分の番、このポケモンは「([^」]+)」が使えない。$/);
 if(!match||!/^\d+$/.test(String(group.printedDamage)))continue;
 const plan=compileOne(match[1],group.exampleOfficialText,group.printedDamage);
 assert(plan,'named effect must compile '+text);
 assert.equal(plan.mechanic,'ATTACK_NAMED_NEXT_TURN_LOCK');
 assert.equal(plan.attackName,match[1]);
 assert.deepEqual(plan.commands,['DAMAGE','ADD_STATE']);
 assert.equal(compileOne('違うワザ',group.exampleOfficialText,group.printedDamage),null,
   'never disable an attack if printed move name differs from the effect text');
 slots+=group.effectSlots;matched++;
}
assert(matched>=15&&slots>=30,'must cover actual missing official attack families');
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
console.log(JSON.stringify({passed:true,sharedMechanic:'ATTACK_NAMED_NEXT_TURN_LOCK',sourceGroups:matched,effectSlots:slots}));
