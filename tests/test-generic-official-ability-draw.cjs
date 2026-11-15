'use strict';
const assert=require('node:assert/strict');
const {compile}=require('../engine/reference-effect-plans.cjs');
function ability(text){
 const catalog={records:[{officialCardId:'99999999',category:'pokemon',name:'test',text:'',attacks:[],abilities:[{name:'draw',text}]}]};
 return compile(catalog).records[0].abilities[0].plan;
}
assert.deepEqual(ability('自分の番に1回使える。自分の山札を3枚引く。'),{mechanic:'ABILITY_DRAW_CARDS',commands:['DRAW'],amount:3});
assert.equal(ability('自分の番に2回使える。自分の山札を3枚引く。'),null);
assert.equal(ability('自分の番に1回使える。相手の山札を3枚引く。'),null);
assert.equal(ability('自分の番に1回使える。自分の山札を101枚引く。'),null);
console.log('generic official ability draw compiler PASS');
