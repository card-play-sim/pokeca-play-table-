'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const W=require('../scripts/lib/shared-effect-engine-worker.cjs');
const compiled=JSON.parse(fs.readFileSync('data/effect-extensions/compiled.json','utf8'));
function check(id,name,mechanic){
 const row=compiled.records.find(r=>String(r.officialCardId)===id);
 assert(row,'official printing must be in regenerated compiled effect catalog: '+id);
 const index=row.attacks.findIndex(a=>a.name===name);
 assert(index>=0,'exact attack is missing: '+id+'/'+name);
 const effect={...row.attacks[index],effectIndex:index};
 assert.equal(effect.plan?.mechanic,mechanic,id+': exact mechanic');
 const fixture=W.prepare(row,effect,'attack');
 assert(!fixture.blocked,id+': '+fixture.blocked);
 const result=W.verifyCase(fixture,effect);
 assert.equal(result.status,'SUCCEEDED',id+': '+JSON.stringify(result));
 return {id,mechanic,result};
}
const rows=[
 ['45158','れっかばくしん','ATTACK_LOCK_UNTIL_SWITCH'],
 ['47494','たたりとばす','PHANTOM']
];
for(const row of rows)console.log(JSON.stringify(check(...row)));
console.log('ISSUE122_BATTLE_ENGINE_SMOKE_PASSED');
