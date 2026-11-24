"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { compile } = require("../engine/reference-effect-plans.cjs");
const W = require("../scripts/lib/shared-effect-engine-worker.cjs");
const intake = JSON.parse(fs.readFileSync("data/effect-extensions/intake.json"));
const compiled = JSON.parse(fs.readFileSync("data/effect-extensions/compiled.json"));
const mechanic = "ATTACK_DISCARD_MULTIPLE_SELF_ENERGY";
const exact = /^このポケモンについているエネルギーを([2-9])個選び、トラッシュする。$/;
const candidates = new Set();
for (const print of intake.records) {
  if (print.category !== "pokemon") continue;
  for (const [index, raw] of print.attacks.entries()) {
    const match = String(raw.text || "").replace(/\s+/g, "").match(exact);
    if (!match) continue;
    const planned = compile({records:[print]}).records[0].attacks[index];
    assert.equal(planned.plan?.mechanic, mechanic, "unconnected official attack: "+print.officialCardId);
    assert.equal(planned.plan.count, Number(match[1]), "incorrect printed discard count");
    assert(planned.plan.commands.includes("DISCARD"), "discard must be executed");
    candidates.add(String(print.officialCardId));
  }
}
assert(candidates.size >= 30, "official evidence set unexpectedly small");
const verified = [];
const skipped = [];
const fullyCompiled = compiled.records.filter(r => candidates.has(String(r.officialCardId)));
for (const r of fullyCompiled) {
  for (const [index, attack] of r.attacks.entries()) {
    if (attack.plan?.mechanic !== mechanic) continue;
    if (verified.length >= 12) break;
    const e={...attack,effectIndex:index};
    const t=W.prepare(r,e,"attack");
    if (t.blocked) {skipped.push({id:r.officialCardId,reason:t.blocked});continue;}
    const option=W.effectOption(t,e);
    if (!(option && (option.enabled ?? option.ok))) {
      skipped.push({id:r.officialCardId,reason:"NO_LEGAL_ATTACK_FIXTURE"});continue;
    }
    const before=t.port.getSnapshot();
    const chosen=option.action.selections?.energy || [];
    const attached=before.players[0].active.energyCards || [];
    assert.equal(chosen.length,Math.min(attack.plan.count,attached.length));
    assert(chosen.every(id => attached.some(c => c.id === id)));
    if (chosen.length >= 2) {
      const invalid={...option.action,selections:{...option.action.selections,energy:[chosen[0],chosen[0],...chosen.slice(2)]}};
      const unchanged=JSON.stringify(before);
      assert.equal(t.port.dispatch("you", invalid).ok,false,"duplicate physical Energy selection must fail");
      assert.equal(JSON.stringify(t.port.getSnapshot()),unchanged,"invalid action mutated the game");
    }
    const outcome=W.verifyCase(t,e);
    assert.equal(outcome.status,"SUCCEEDED",JSON.stringify({id:r.officialCardId,outcome}));
    const after=t.port.getSnapshot();
    for(const id of chosen)assert(after.players[0].discard.some(c=>c.id===id),
      "physical Energy must go to own discard: "+id);
    assert(after.history.slice(before.history.length).some(x=>x.details?.command==="DAMAGE" &&
      x.details.targetInstanceId===before.players[1].active.id),
      "official base damage must resolve before optional state changes");
    const saved=t.port.getResumeSnapshot();
    assert(t.port.restoreSession(saved).ok);
    assert.deepEqual(t.port.getSnapshot(),after,"save/restore must retain all discarded physical cards");
    verified.push({id:String(r.officialCardId),count:attack.plan.count,discarded:chosen.length});
  }
  if (verified.length >= 12) break;
}
assert(fullyCompiled.length>0,"none of the official candidates were connected to battle runtime");
assert(verified.length>=2,"multi-print real-gameplay verification must cover at least two official prints");
fs.mkdirSync("test-results",{recursive:true});
fs.writeFileSync("test-results/battle-multi-self-energy-official.json",
  JSON.stringify({status:"PASS",officialMatchingPrints:candidates.size,compiledPrints:fullyCompiled.length,
    verifiedInRealGame:verified.length,verified,skipped,publicBattleVerified:false},null,2)+"\n");
console.log("BATTLE_MULTI_SELF_ENERGY_OFFICIAL PASS",JSON.stringify({
  officialMatchingPrints:candidates.size,compiledPrints:fullyCompiled.length,
  verifiedInRealGame:verified.length,skipped:skipped.length}));
