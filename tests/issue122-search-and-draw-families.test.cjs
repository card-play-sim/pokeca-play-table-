'use strict';
const assert=require('node:assert/strict');
const {compile}=require('../engine/reference-effect-plans.cjs');
function plan(text,damage){return compile({records:[{officialCardId:'test',category:'pokemon',name:'test',attacks:[{text,damage}],abilities:[]}]}).records[0].attacks[0].plan;}
for(const [text,damage,mechanic,key,value,limit] of [
 ['自分の山札からたねポケモンの「リーリエのポケモン」を好きなだけ選び、ベンチに出す。そして山札を切る。','0','SEARCH_BASIC_TO_BENCH_ATTACK','team','リーリエ',5],
 ['自分の山札から「ケロマツ」を2枚まで選び、ベンチに出す。そして山札を切る。','0','SEARCH_BASIC_TO_BENCH_ATTACK','nameExact','ケロマツ',2],
 ['自分の山札から「アゴジムシ」を2枚まで選び、ベンチに出す。そして山札を切る。','0','SEARCH_BASIC_TO_BENCH_ATTACK','nameExact','アゴジムシ',2],
]){const p=plan(text,damage);assert.equal(p?.mechanic,mechanic);assert.equal(p[key],value);assert.equal(p.limit,limit);assert.notEqual(plan(text+'未対応の効果。',damage)?.[key],value);}
assert.deepEqual(plan('のぞむなら、自分の山札を5枚引く。','180'),{mechanic:'MASS_HAND_ACQUISITION',commands:['DAMAGE','DRAW'],mode:'draw',amount:5,sharedWording:true});
console.log('SEARCH_AND_DRAW_FAMILIES_PASS');
