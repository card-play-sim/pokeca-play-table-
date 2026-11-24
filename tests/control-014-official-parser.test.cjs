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
    assert.equal(p.facts.evolvesFrom, r.facts.evolvesFrom);
    if (chain.length === 2) assert.equal(p.facts.evolvesFrom, chain[0][1].trim());
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
// Verify boxed evolution chains against independently saved official pages.
const crypto = require("node:crypto");
for (const [id, expectedPredecessor, prizes] of [
  ["49191", "バルチャイ", 2],
  ["50062", "ヒトデマン", 3],
  ["50099", "シシコ", 3],
  ["50106", "ゲコガシラ", 3],
  ["50174", "テールナー", 3],
]) {
  const evidence = JSON.parse(fs.readFileSync("data/effect-extensions/evidence/" + id + ".json"));
  assert.equal(crypto.createHash("sha256").update(evidence.html).digest("hex"), evidence.htmlSha256);
  assert(evidence.url.endsWith("/card/" + id));
  const facts = parse(evidence.html).facts;
  assert.equal(facts.prizeCount, prizes);
  assert.equal(facts.rulePokemon, true);
  assert.equal(facts.evolvesFrom, expectedPredecessor);
  if (prizes === 3) {
    const changed = evidence.html.replace("相手はサイドを3枚とる。", "相手はサイドを4枚とる。");
    assert.throws(() => parse(changed), /UNSUPPORTED_POKEMON_RULE_SECTION/);
  }
}
// A highlighted stage-1 row can have a BREAK row plus multiple boxed
// alternate final evolutions ABOVE it. The official arrow immediately below
// the current stage identifies its actual predecessor; never guess by count.
for (const [id, predecessor] of [
  ["50096", "フォッコ"],
  ["50399", "ヤヤコマ"],
  ["50585", "モノズ"],
  ["48055", "モノズ"],
  ["45470", "ケロマツ"],
  ["45600", "ケロマツ"],
  ["46411", "モノズ"],
]) {
  const evidence=JSON.parse(fs.readFileSync("data/effect-extensions/evidence/"+id+".json"));
  assert.equal(crypto.createHash("sha256").update(evidence.html).digest("hex"),evidence.htmlSha256);
  const parsed=parse(evidence.html);
  assert.equal(parsed.facts.stage,1,id+":stage");
  assert.equal(parsed.facts.evolvesFrom,predecessor,id+":official_arrow");
  // If the mandatory predecessor arrow is missing, reject the printing.
  const malformed=evidence.html.replace(
    new RegExp('(<div class="evolution ev_on">[^]*?<div class="arrow_on"><\\/div><\\/div>[^]*?<div class="evolution ev_off">[^]*?)<div class="arrow_off"><\\/div>'),
    '$1');
  assert.notEqual(malformed,evidence.html,id+":tamper_must_apply");
  assert.throws(()=>parse(malformed),/UNSUPPORTED_EVOLUTION_CHAIN/,id+":fail_closed");
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
