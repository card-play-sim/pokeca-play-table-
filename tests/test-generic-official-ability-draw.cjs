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


const blockedAbilityTexts=[
 '自分の番に1回使える。自分の山札を3枚引く。その後、手札を1枚トラッシュする。',
 '自分の番に1回使える。自分の山札を3枚引く。相手も3枚引く。',
 '自分の番に1回使える。このポケモンのHPを「30」回復する。その後、このポケモンをベンチにもどす。',
 '自分の番に1回使える。このポケモンのHPを「1001」回復する。',
 '自分の番に1回使える。自分の山札を0枚引く。',
];
for(const text of blockedAbilityTexts)assert.equal(ability(text),null,'Unexpected generic ability adoption: '+text);
for(const category of ['item','supporter']){
 assert.equal(main(category,'自分の山札を3枚引く。その後、手札を1枚トラッシュする。'),null);
 assert.equal(main(category,'自分のポケモン1匹のHPを「30」回復する。その後、エネルギーを1枚トラッシュする。'),null);
}
assert.equal(main('tool','このカードをつけているたねポケモンの最大HPは「+100」される。相手の番の終わりにトラッシュする。'),null);
assert.equal(attack('このポケモンにも30ダメージ。その後、エネルギーを1枚トラッシュする。','100'),null);
assert.equal(attack('このポケモンのHPを「30」回復する。その後、ベンチと入れ替える。','100'),null);


const fs=require('node:fs');
const catalog=JSON.parse(fs.readFileSync('data/reference-effects/catalog.json','utf8'));
const ids=catalog.records.map(r=>String(r.officialCardId));
assert.equal(new Set(ids).size,ids.length,'DUPLICATE_OFFICIAL_PRINT_ID');
assert.equal(catalog.adoptedDeckPrints,0,'UNREVIEWED_FIXED_DECK_ADOPTION');
for(const [name,print] of Object.entries(catalog.defaultValidationReferences)){
 assert(catalog.records.some(r=>String(r.officialCardId)===String(print)&&r.deckName===name),'UNRESOLVED_REFERENCE:'+name);
}

console.log('generic official cross-category and identity ledger guards PASS');
