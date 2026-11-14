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
  const altered = proof.html.replace('ポケモンexがきぜつしたとき、相手はサイドを2枚とる。', '未対応の特別なルール');
  assert.throws(() => parse(altered), /UNSUPPORTED_POKEMON_RULE_SECTION/, id);
}
console.log('official ex prize rule: PASS');
