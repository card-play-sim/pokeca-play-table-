'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const W=require('../scripts/lib/shared-effect-engine-worker.cjs');
const context={window:{},console,performance,Math,setTimeout};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),context);
const E=context.window.Pokeca;
const refs=new Map(E.getReferenceEffectCatalog({includeExtensions:true}).records.map(x=>[String(x.officialCardId),x]));
const ids=['48330','47432','47518','47529','47534'];
for(const ident of ids){
 const record=refs.get(ident);
 assert(record,'verified official print missing '+ident);
 const effect={...record.attacks[0],effectIndex:0};
 assert.equal(effect.plan?.mechanic,'ATTACK_DISCARD_BENCH_ENERGY_BONUS');
 assert.equal(record.abilities[0].plan?.mechanic,'PASSIVE_ROCKET_TEAM_ATTACK_GATE');
 const fixture=W.prepare(record,effect,'attack');
 assert(!fixture.blocked,ident+': '+fixture.blocked);
 const snapshot=fixture.port.getSnapshot();
 const options=fixture.port.getPokemonActions('you',fixture.sourceId);
 const option=options.find(o=>o.kind==='attack'&&o.action.attackIndex===0);
 const count=[snapshot.players[0].active,...snapshot.players[0].bench]
  .filter(mon=>mon.name.startsWith('ロケット団の')).length;
 console.log('EXACT_PRINT_FIXTURE '+JSON.stringify({
  id:ident,count,bench:snapshot.players[0].bench.map(x=>x.name),
  energy:snapshot.players[0].active.energyCards.map(x=>x.energyType),
  legal:option?.ok??option?.enabled,errors:option?.errors||option?.disabledReasons}));
 assert(option&&(option.ok??option.enabled),ident+': attack must be legally selectable in 60-card official-print fixture');
 const action=W.effectOption(fixture,effect)?.action||option.action;
 assert(action,ident+': missing legal action');
 const before=fixture.port.getSnapshot();
 assert(fixture.port.dispatch('you',action).ok,ident+': dispatch failed');
 const after=fixture.port.getSnapshot();
 const attack=after.history.find(h=>h.type==='attack'&&h.details?.referenceOfficialCardId===ident);
 assert(attack,ident+': physical card attack event absent');
 const damage=after.players[1].active.damage-(before.players[1].active.damage||0);
 assert(damage>=160,ident+': full printed attack base damage not applied');
}
console.log('PASS: all five saved official Rocket Team Mewtwo ex printings execute a legal attack in the canonical battle UI');
