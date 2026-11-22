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
          /<div class="evolution ev_off">\s*<a\b[^>]*>([^<]+)<\/a>/g,
        ),
      ];
    assert.equal(chain.length, 2);
    assert.equal(p.facts.evolvesFrom, chain[0][1].trim());
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
for(const type of ['草','炎','水','雷','超','闘','悪','鋼']){
  const html='<h1>基本'+type+'エネルギー</h1><div class="RightBox-inner"><h2>基本エネルギー</h2></div>';
  const p=parse(html);assert.equal(p.category,'energy');assert.equal(p.facts.basicEnergyType,type);assert.deepEqual(p.attacks,[]);assert.deepEqual(p.abilities,[]);
}
assert.throws(()=>parse('<h1>基本妖エネルギー</h1><div class="RightBox-inner"><h2>基本エネルギー</h2></div>'),/UNVERIFIED_BASIC_ENERGY_TYPE/);
// Exercise the official-layout rule parser with a saved, hash-verified print.
const teraProof=JSON.parse(fs.readFileSync("data/effect-extensions/evidence/45944.json")).html;
const topRule='このポケモンは、ベンチにいるかぎり、ワザのダメージを受けない。';
const teraHtml=teraProof.replace('<h2 class="mt20">ワザ</h2>','<p>'+topRule+'</p><h2 class="mt20">ワザ</h2>');
assert.equal(parse(teraProof).facts.teraBenchProtection,false);
assert.equal(parse(teraHtml).facts.teraBenchProtection,false);
assert.equal(parse(teraHtml,{enableTeraRule:true}).facts.teraBenchProtection,true);
assert.throws(()=>parse(teraHtml.replace(topRule,'このポケモンは、すべてのダメージを受けない。')),/UNSUPPORTED_TOP_RULE/);
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
