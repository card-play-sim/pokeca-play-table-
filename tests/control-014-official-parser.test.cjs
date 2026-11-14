"use strict";
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { parse, text } = require("../scripts/parse-official-pokemon-energy.cjs");
let stageTwo = 0,
  iconProofs = 0;
for (const r of JSON.parse(
  fs.readFileSync("data/official-effect-intake/checkpoint.json"),
).records) {
  const proof = JSON.parse(fs.readFileSync(r.source.path));
  if (r.category === "pokemon" && r.facts.stage === 2) {
    const p = parse(proof.html),
      chain = [
        ...proof.html.matchAll(
          /<div class="evolution ev_off"><a[^>]*>(.*?)<\/a>/g,
        ),
      ];
    assert.equal(chain.length, 2);
    assert.equal(p.facts.evolvesFrom, chain[0][1]);
    stageTwo++;
  }
  if (
    ["item", "supporter", "tool", "stadium"].includes(r.category) &&
    r.text.includes("[超]")
  ) {
    assert(proof.html.includes("icon-psychic"));
    assert(r.text.includes("[超]"));
    iconProofs++;
  }
}
assert(stageTwo >= 2);
assert(iconProofs >= 3);
for (const id of ["45944", "46371", "47589"]) {
  const p = parse(
    JSON.parse(
      fs.readFileSync("data/effect-extensions/evidence/" + id + ".json"),
    ).html,
  );
  assert(p.attacks.some((a) => /^\d+-$/.test(a.damage)));
}
assert.throws(
  () => text('<span class="icon-unknown icon"></span>ポケモン'),
  /UNSUPPORTED_INLINE_MARKUP/,
);
const { compile } = require("../engine/reference-effect-plans.cjs");
const records = JSON.parse(
  fs.readFileSync("data/effect-extensions/compiled.json"),
).records;
for (const r of records) {
  for (const a of r.attacks.filter((a) =>
    ["RECOIL_DAMAGE", "HEAL_SELF_ATTACK", "FIXED_COIN_HITS"].includes(
      a.plan?.mechanic,
    ),
  )) {
    assert.equal(
      compile({
        records: [
          { ...r, attacks: [{ ...a, text: a.text + "さらに山札を引く。" }] },
        ],
      }).records[0].attacks[0].plan,
      null,
    );
    if (a.plan.mechanic === "FIXED_COIN_HITS")
      assert.equal(
        compile({ records: [{ ...r, attacks: [{ ...a, damage: "999×" }] }] })
          .records[0].attacks[0].plan,
        null,
      );
  }
}
console.log("CONTROL_014_OFFICIAL_PARSER PASS", { stageTwo, iconProofs });
