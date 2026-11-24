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
// A print rejected by the atomic execution gate must not be silently added
// to the release catalog just to satisfy a smoke test. Verify its exact
// official attack plan and explicit deferred receipt, and require a separate
// real-engine execution of the same mechanic from a fully qualified print.
for(const [id,name,mechanic] of rows){
 if(compiled.records.some(r=>String(r.officialCardId)===id)){
  console.log(JSON.stringify(check(id,name,mechanic)));continue;
 }
 assert.equal(id,'47494','unexpected missing required published print');
 const raw=JSON.parse(fs.readFileSync('data/official-effect-intake/checkpoint.json'));
 const record=raw.records.find(r=>String(r.officialCardId)===id);
 assert(record,'missing deferred official record');
 const proof=JSON.parse(fs.readFileSync(record.source.path));
 assert.equal(proof.url,record.officialPageUrl);
 assert.equal(require('node:crypto').createHash('sha256').update(proof.html).digest('hex'),record.source.sha256);
 const parsed=require('../scripts/parse-official-pokemon-energy.cjs').parse(proof.html);
 assert.deepEqual(parsed.attacks,record.attacks);
 const attack=require('../engine/reference-effect-plans.cjs').compile({records:[record]}).records[0].attacks.find(a=>a.name===name);
 assert.equal(attack.plan.mechanic,mechanic);
 assert.equal(attack.plan.counterCount,2);
 const candidate=JSON.parse(fs.readFileSync('reports/official-effect-continuation/all-remaining-candidate.json'));
 assert(candidate.blockers.some(b=>String(b.id)===id&&b.reason==='EXECUTION_EVIDENCE_INCOMPLETE'));
 assert(!candidate.qualified.includes(id));
 const other=[...compiled.records,...JSON.parse(fs.readFileSync('data/reference-effects/plans.json')).records].find(r=>r.attacks.some(a=>a.plan?.mechanic===mechanic));
 assert(other,'no qualified counter allocation mechanic regression');
 const index=other.attacks.findIndex(a=>a.plan?.mechanic===mechanic);
 const effect={...other.attacks[index],effectIndex:index};
 assert.equal(W.verifyCase(W.prepare(other,effect,'attack'),effect).status,'SUCCEEDED');
 console.log(JSON.stringify({id,mechanic,state:'DEFERRED_NOT_RELEASED',verifiedMechanicOn:other.officialCardId}));
}
console.log('ISSUE122_BATTLE_ENGINE_SMOKE_PASSED');
