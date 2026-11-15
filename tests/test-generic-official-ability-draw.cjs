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
assert.deepEqual(ability('自分の番に1回使える。このポケモンのHPを「30」回復する。'),{mechanic:'ABILITY_HEAL_SELF',commands:['HEAL'],amount:30});
assert.equal(ability('自分の番に1回使える。相手のポケモンのHPを「30」回復する。'),null);
assert.equal(ability('自分の番に2回使える。このポケモンのHPを「30」回復する。'),null);

function main(category,text){
 const catalog={records:[{officialCardId:'99999998',category,name:'fixture',text,attacks:[],abilities:[]}]};
 return compile(catalog).records[0].mainPlan;
}
function attack(text,damage){
 const catalog={records:[{officialCardId:'99999997',category:'pokemon',name:'fixture',text:'',attacks:[{name:'fixture',text,damage}],abilities:[]}]};
 return compile(catalog).records[0].attacks[0].plan;
}
assert.deepEqual(main('item','自分の山札を3枚引く。'),{mechanic:'DRAW_CARDS',commands:['DRAW'],amount:3});
assert.deepEqual(main('supporter','自分の山札を3枚引く。'),{mechanic:'DRAW_CARDS',commands:['DRAW'],amount:3});
assert.equal(main('stadium','自分の山札を3枚引く。'),null);
assert.equal(main('item','相手の山札を3枚引く。'),null);
assert.deepEqual(main('item','自分のポケモン1匹のHPを「30」回復する。'),{mechanic:'HEAL_DAMAGE',commands:['HEAL'],amount:30});
assert.equal(main('stadium','自分のポケモン1匹のHPを「30」回復する。'),null);
assert.deepEqual(main('tool','このカードをつけているたねポケモンの最大HPは「+100」される。'),{mechanic:'CONDITIONAL_MAX_HP',commands:['MODIFY_MAX_HP'],amount:100,basicOnly:true});
assert.equal(main('item','このカードをつけているたねポケモンの最大HPは「+100」される。'),null);
assert.deepEqual(attack('このポケモンにも30ダメージ。','100'),{mechanic:'RECOIL_DAMAGE',commands:['DAMAGE'],amount:30});
assert.equal(attack('このポケモンにも30ダメージ。','100+'),null);
assert.deepEqual(attack('このポケモンのHPを「30」回復する。','100'),{mechanic:'HEAL_SELF_ATTACK',commands:['DAMAGE','HEAL'],amount:30});
assert.equal(attack('このポケモンのHPを「30」回復する。','100+'),null);

console.log('generic official cross-category compiler contract PASS');
