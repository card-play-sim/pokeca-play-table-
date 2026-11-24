"use strict";
const assert = require("node:assert/strict");
const records = require("../data/effect-extensions/compiled.json").records;
const worker = require("../scripts/lib/shared-effect-engine-worker.cjs");

for (const id of ["48330", "47432", "47518", "47529", "47534"]) {
  const record = records.find(card => card.officialCardId === id);
  assert(record, "Missing official print " + id);
  for (const [kind, effect, mechanic] of [
    ["attack", record.attacks[0], "ATTACK_DISCARD_BENCH_ENERGY_BONUS"],
    ["ability", record.abilities[0], "PASSIVE_ROCKET_TEAM_ATTACK_GATE"],
  ]) {
    assert.equal(effect.plan?.mechanic, mechanic);
    const slot = { ...effect, effectIndex: 0 };
    const result = worker.verifyCase(worker.prepare(record, slot, kind), slot);
    assert.equal(result.status, "SUCCEEDED", id + ": " + JSON.stringify(result));
  }
}
console.log("PASS: five official Rocket Mewtwo ex printings pass the four-Pokémon gate and 0/1/2 bench energy discards");
