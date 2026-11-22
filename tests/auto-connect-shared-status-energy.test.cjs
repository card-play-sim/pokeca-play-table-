'use strict';
const assert = require('node:assert/strict');
const {compile} = require('../engine/reference-effect-plans.cjs');

function attack(text, damage='20') {
  const input={records:[{officialCardId:'99999',category:'pokemon',name:'検証用ポケモン',
    attacks:[{name:'検証用ワザ',text,damage}],abilities:[],facts:{}}]};
  return compile(input).records[0].attacks[0].plan;
}

for(const text of [
  'コインを1回投げオモテなら、相手のバトルポケモンをマヒにする。',
  'コインを1回投げ、オモテなら、相手のバトルポケモンをマヒにする。']) {
  assert.deepEqual(attack(text),{mechanic:'COIN_PARALYZE_ATTACK',commands:['DAMAGE','COIN_FLIP','STATUS_CONDITION']});
}
assert.deepEqual(attack('このポケモンについているエネルギーをすべてトラッシュする。'),
  {mechanic:'DISCARD_ALL_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']});
assert.equal(attack('相手のバトルポケモンをマヒにする。'),null);
assert.equal(attack('このポケモンについている基本エネルギーを1個トラッシュする。'),null);
assert.equal(attack('コインを1回投げオモテなら、相手のベンチポケモンをマヒにする。'),null);
console.log('PASS exact official attack matcher rejects near misses');
