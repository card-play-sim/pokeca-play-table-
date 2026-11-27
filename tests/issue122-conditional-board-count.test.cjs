'use strict';
const assert=require('node:assert/strict');
const {compile}=require('../engine/reference-effect-plans.cjs');
function plan(text,damage){return compile({records:[{officialCardId:'test',category:'pokemon',name:'test',attacks:[{text,damage}],abilities:[]}]}).records[0].attacks[0].plan;}
for(const [text,damage,metric,unit,base] of [
 ['名前に「古びた」とつく自分のベンチポケモンの数×30ダメージ追加。','10+','ownBenchNameContains',30,10],
 ['自分の場の、ダメカンがのっている名前に「ケンタロス」とつくポケモンの数×40ダメージ。','40×','ownDamagedNameContains',40,0],
 ['自分のベンチの「メガシンカex」の数×60ダメージ。','60×','ownBenchMegaCount',60,0],
]){const p=plan(text,damage);assert.equal(p?.mechanic,'SCALED_ATTACK_DAMAGE');assert.equal(p.metric,metric);assert.equal(p.unit,unit);assert.equal(p.base,base);assert.notEqual(plan(text+'未対応の効果。',damage)?.metric,metric);}
console.log('CONDITIONAL_BOARD_COUNT_GRAMMAR_PASS');
