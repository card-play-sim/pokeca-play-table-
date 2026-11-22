'use strict';
const assert = require('node:assert/strict');
const { compile } = require('../engine/reference-effect-plans.cjs');

const official = 'この番、自分のポケモンが使うワザの、相手のバトル場の「ポケモンex」へのダメージは「+40」される。';
function plan(text, category='supporter') {
  return compile({ records:[{
    officialCardId:'99999', name:'テスト用', category,
    text, attacks:[], abilities:[], facts:{prizeCount:1,rulePokemon:false}
  }] }).records[0].mainPlan;
}
assert.deepEqual(plan(official),{
  mechanic:'BOOST_EX_DAMAGE_THIS_TURN',
  commands:['MODIFY_DAMAGE'],
  amount:40
});
for (const text of [
  official.replace('バトル場', 'ベンチ'),
  official.replace('ポケモンex', 'ポケモンex・V'),
  official.replace('+40', '+30'),
  '次の相手の番、'+official,
]) assert.equal(plan(text), null, 'near-miss text must stay unsupported: '+text);
assert.equal(plan(official,'item'),null,'supporter effect cannot leak to items');
console.log('PASS official active-Pokemon-ex support damage boost: exact match, negative boundaries');
