'use strict';
const assert = require('node:assert/strict');
const {compile} = require('../engine/reference-effect-plans.cjs');

function attack(text, damage='20', cost=['炎']) {
  const input={records:[{officialCardId:'99999',category:'pokemon',name:'検証用ポケモン',
    attacks:[{name:'検証用ワザ',text,damage,cost}],abilities:[],facts:{}}]};
  return compile(input).records[0].attacks[0].plan;
}

for(const text of [
  'コインを1回投げオモテなら、相手のバトルポケモンをマヒにする。',
  'コインを1回投げ、オモテなら、相手のバトルポケモンをマヒにする。']) {
  assert.deepEqual(attack(text),{mechanic:'COIN_PARALYZE_ATTACK',commands:['DAMAGE','COIN_FLIP','STATUS_CONDITION']});
}
assert.deepEqual(attack('このポケモンについているエネルギーをすべてトラッシュする。'),
  {mechanic:'DISCARD_ALL_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']});
assert.deepEqual(attack('このポケモンについているエネルギーをすべてトラッシュする。','0'),
  {mechanic:'DISCARD_ALL_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']});
assert.deepEqual(attack('このポケモンについているエネルギーを、すべてトラッシュする。'),
  {mechanic:'DISCARD_ALL_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']});
assert.deepEqual(attack('このポケモンについているエネルギーを1個選び、トラッシュする。'),
  {mechanic:'DISCARD_ONE_SELF_ENERGY_ATTACK',commands:['DAMAGE','DISCARD']});
assert.equal(attack('このポケモンについているエネルギーを1個選び、トラッシュする。','20',[]),null);
assert.deepEqual(attack('このポケモンについているエネルギーを2個選び、トラッシュする。'),{mechanic:'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY',commands:['DAMAGE','DISCARD'],count:2});
assert.equal(attack('このポケモンについているエネルギーを2個選び、トラッシュする。その後、山札を引く。'),null);
// The exact typed-discard wording is now implemented and independently
// battle-qualified. Retain strict rejection of unsupported variants.
assert.deepEqual(attack('このポケモンについている[炎]エネルギーを1個選び、トラッシュする。'),
  {mechanic:'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY',commands:['DAMAGE','DISCARD'],type:'炎',count:1,sharedWording:true});
assert.deepEqual(attack('このポケモンについている[水]エネルギーを2個選び、トラッシュする。','20',['水']),
  {mechanic:'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY',commands:['DAMAGE','DISCARD'],type:'水',count:2,sharedWording:true});
assert.equal(attack('このポケモンについている[炎]エネルギーを1個選び、トラッシュする。その後、山札を引く。'),null);
assert.equal(attack('このポケモンについている[炎]エネルギーを1個選び、トラッシュする。','20＋'),null);
assert.equal(attack('このポケモンについているエネルギーを2個トラッシュする。'),null);
assert.equal(attack('相手のバトルポケモンをマヒにする。'),null);
assert.equal(attack('このポケモンについている基本エネルギーを1個トラッシュする。'),null);
assert.equal(attack('コインを1回投げオモテなら、相手のベンチポケモンをマヒにする。'),null);
const selfBonus = 'このポケモンにのっているダメカンの数×10ダメージ追加。';
const selfMultiply = 'このポケモンにのっているダメカンの数×20ダメージ。';
assert.deepEqual(attack(selfBonus,'80＋'),{mechanic:'SELF_COUNTER_DAMAGE',commands:['DAMAGE'],base:80,perCounter:10});
assert.deepEqual(attack(selfMultiply,'20×'),{mechanic:'SELF_COUNTER_DAMAGE',commands:['DAMAGE'],base:0,perCounter:20});
assert.equal(attack(selfBonus,'80'),null);
assert.equal(attack(selfMultiply,'10×'),null);
const opponentMultiply = selfMultiply.replace('このポケモン','相手のバトルポケモン');
assert.deepEqual(attack(opponentMultiply,'20×'),
  {mechanic:'SCALED_ATTACK_DAMAGE',commands:['DAMAGE'],metric:'opponentCounters',type:null,unit:20,base:0});
assert.equal(attack(opponentMultiply,'30×'),null);
const repeatCoin = 'ウラが出るまでコインを投げ、オモテの数×20ダメージ';
assert.deepEqual(attack(repeatCoin+'。','20×'),{mechanic:'COIN_UNTIL_TAILS_DAMAGE',commands:['COIN_FLIP','DAMAGE'],base:0,unit:20});
assert.deepEqual(attack(repeatCoin+'追加。','100＋'),{mechanic:'COIN_UNTIL_TAILS_DAMAGE',commands:['COIN_FLIP','DAMAGE'],base:100,unit:20});
assert.equal(attack(repeatCoin+'。','30×'),null);
assert.equal(attack(repeatCoin+'追加。','100'),null);
console.log('PASS exact official attack matcher rejects near misses');
