'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {parse} = require('../scripts/parse-official-pokemon-energy.cjs');
// Saved, hash-checked official HTML: this test never contacts the network.
for (const id of ['44369', '44391']) {
  const proof = JSON.parse(fs.readFileSync(`data/effect-extensions/evidence/${id}.json`, 'utf8'));
  const card = parse(proof.html);
  assert.equal(card.category, 'pokemon', id);
  assert.equal(card.facts.rulePokemon, true, id);
  assert.equal(card.facts.prizeCount, 2, id);
  assert.equal(card.facts.stage, 1, id);
  assert.equal(card.facts.basic, false, id);
  const altered = proof.html.replace('ポケモンexがきぜつしたとき、相手はサイドを2枚とる。', '未対応の特別なルール');
  assert.throws(() => parse(altered), /UNSUPPORTED_POKEMON_RULE_SECTION/, id);
}
// Fullwidth plus is printed in official damage headers; normalize its syntax only.
for (const id of ['44365', '44379', '44381', '44387']) {
  const proof = JSON.parse(fs.readFileSync(`data/effect-extensions/evidence/${id}.json`, 'utf8'));
  const card = parse(proof.html);
  assert.equal(card.category, 'pokemon', id);
  assert.ok(card.attacks.some(attack => /^\d+\+$/.test(attack.damage)), id);
}
// Official evolution chains may mix ev_on/ev_off and whitespace after the div tag.
// Only the direct chain is accepted; alternative evolution branches remain excluded.
for (const [id, evolvesFrom, stage] of [['44392','ガバイト',2], ['44401','ガバイト',2], ['49715','ラルトス',1], ['50557','タマタマ',1]]) {
  const proof = JSON.parse(fs.readFileSync(`data/effect-extensions/evidence/${id}.json`, 'utf8'));
  const card = parse(proof.html);
  assert.equal(card.facts.stage, stage, id);
  assert.equal(card.facts.evolvesFrom, evolvesFrom, id);
}
console.log('official ex prize rule and evolution chains: PASS');
