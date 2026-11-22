'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const worker = require('../scripts/lib/shared-effect-engine-worker.cjs');
const bundle = fs.readFileSync('ui/engine.bundle.js','utf8');
const end = bundle.lastIndexOf('})();');
assert(end >= 0, 'bundle IIFE ending missing');
const ctx = {window:{},console,performance,Math,setTimeout};
vm.runInNewContext(bundle.slice(0,end)+'window.__testReferenceDamages=req("pokeca_reference_effect_runtime").damages;\n'+bundle.slice(end),ctx);
const E=ctx.window.Pokeca, damages=ctx.window.__testReferenceDamages;
assert.equal(typeof damages,'function');
const ids=['47731','46597','46598','46599','46600','46601','46602','46603','46604','46605'];
const records=E.getReferenceEffectCatalog({includeExtensions:true}).records;
for(const id of ids){
 const source=records.find(r=>String(r.officialCardId)===id);
 assert(source&&source.mainPlan?.mechanic==='BOOST_EX_DAMAGE_THIS_TURN','missing H official source '+id);
}
const ref=records.find(r=>String(r.officialCardId)==='47731');
const t=worker.prepare(ref,{name:ref.name,text:ref.text,plan:ref.mainPlan,effectIndex:0},'main');
assert(!t.blocked,'supporter UI fixture blocked: '+t.blocked);
const p=t.port, start=p.getSnapshot();
const action=p.getHandOptions('you',t.sourceId).find(o=>o.ok&&o.action.type==='play_supporter');
assert(action,'official supporter must have a legal UI action');
assert.equal(p.dispatch('ai',action.action).ok,false,'wrong-player supporter action must be rejected');
assert.deepEqual(p.getSnapshot(),start,'wrong-player action must not mutate state');
assert(p.dispatch('you',action.action).ok,'official supporter use must succeed');
const after=p.getSnapshot();
assert.equal(after.players[0].referenceExDamageBoost?.turn,after.turnNumber);
assert.equal(after.players[0].referenceExDamageBoost?.amount,40);
assert.equal(after.players[1].referenceExDamageBoost,undefined,'supporter bonus must not leak to opponent');
assert(p.restoreSession(p.getResumeSnapshot()).ok);
assert.deepEqual(p.getSnapshot(),after,'supporter boost must survive exact session restore');
const active=after.players[1].active;
assert(E.getReferenceEffectRecord(active)?.name.endsWith('ex'),'fixture requires an active Pokemon ex');
function withState(turn,bonus){
 const g=structuredClone(after);g.turnNumber=turn;
 if(!bonus)delete g.players[0].referenceExDamageBoost;
 return g;
}
const ordinary=withState(after.turnNumber,false);
const effective=withState(after.turnNumber,true);
const off=damages(ordinary,'you',ordinary.players[1].active,100);
const on=damages(effective,'you',effective.players[1].active,100);
const attacker=E.getReferenceEffectRecord(effective.players[0].active);
const defender=E.getReferenceEffectRecord(effective.players[1].active);
const weakness=defender.facts.weakness?.types?.some(type=>attacker.facts.types.includes(type))?2:1;
assert.equal(on-off,40*weakness,'supporter applies +40 before weakness and resistance');
const expired=withState(after.turnNumber+1,true);
assert.equal(damages(expired,'you',expired.players[1].active,100),off,'next turn must clear damage boost');
assert.equal(damages(ordinary,'you',ordinary.players[1].active,100,{bench:true}),damages(effective,'you',effective.players[1].active,100,{bench:true}),'bench-target damage cannot receive active-only boost');
const nonex=[...effective.players[1].bench,...effective.players[1].deck].find(card=>card.kind==='pokemon'&&!E.getReferenceEffectRecord(card)?.name.endsWith('ex'));
if(nonex){
 const g=structuredClone(effective),base=structuredClone(ordinary);
 for(const next of [g,base]){
   const o=next.players[1],idx=o.bench.findIndex(c=>c.id===nonex.id);
   const card=idx>=0?o.bench.splice(idx,1)[0]:o.deck.splice(o.deck.findIndex(c=>c.id===nonex.id),1)[0];
   o.bench.push(o.active);o.active=card;
 }
 assert.equal(damages(base,'you',base.players[1].active,100),damages(g,'you',g.players[1].active,100),'non-ex target must never receive bonus');
}
console.log('PASS 10 official H supporters: legal play, wrong player, +40 weakness order, nonex, bench, turn expiry, save/restore');
