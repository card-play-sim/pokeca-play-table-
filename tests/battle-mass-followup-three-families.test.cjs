'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compile,norm}=require('../engine/reference-effect-plans.cjs');

// These are verbatim complete official effect bodies, not a partial-word parser.
const bodies={
 tool:'このカードをつけているポケモンは、にげるためのエネルギーが2個ぶん少なくなる。',
 supporter:'このカードは、自分の手札を1枚トラッシュしなければ使えない。自分の手札が6枚になるように、山札を引く。',
 attack:'相手の手札を見る。'
};
function record(category,text,id,damage='0'){
 return {
  officialCardId:id,name:'検証カード',deckName:'検証カード',
  category,text,attacks:category==='pokemon'?[{name:'検証用',text,damage,cost:[]}]:[],
  abilities:[],facts:{},rulesText:[]
 };
}
const rows=[
 record('tool',bodies.tool,'910001'),
 record('supporter',bodies.supporter,'910002'),
 record('pokemon','', '910003')
];
rows[2].attacks[0]={name:'検証用',text:bodies.attack,damage:'0',cost:[]};
const compiled=compile({records:rows}).records;
assert.deepEqual(compiled[0].mainPlan,{mechanic:'TOOL_RETREAT_DISCOUNT_TWO',
 commands:['MODIFY_RETREAT_COST'],amount:2});
assert.deepEqual(compiled[1].mainPlan,{mechanic:'SUPPORTER_DISCARD_ONE_DRAW_TO_SIX',
 commands:['DISCARD','DRAW'],limit:6});
assert.deepEqual(compiled[2].attacks[0].plan,{mechanic:'ATTACK_REVEAL_OPPONENT_HAND',
 commands:['DAMAGE','REVEAL']});
// No nearest-text inference, no wrong category, no malformed printed damage.
const invalid=[
 record('tool',bodies.tool+'さらに山札を引く。','910004'),
 record('item',bodies.supporter,'910005'),
 record('supporter',bodies.supporter+'相手の手札を見る。','910006'),
 record('pokemon','', '910007')
];
invalid[3].attacks[0]={name:'検証用',text:bodies.attack,damage:'?',cost:[]};
const refused=compile({records:invalid}).records;
for(const row of refused){
 assert.equal(row.mainPlan,null);
 for(const attack of row.attacks)assert.equal(attack.plan,null);
}
// Successful intake removes resolved effects from the worklist. Test against
// the official source records, which retain coverage after promotion.
const evidence=JSON.parse(fs.readFileSync('data/official-effect-intake/checkpoint.json','utf8')).records;
for(const [category,kind,body,minimum] of [
 ['tool','tool',bodies.tool,10],
 ['supporter','supporter',bodies.supporter,9],
 ['pokemon','attack',bodies.attack,7]
]){
 let slots=0;
 for(const row of evidence.filter(row=>row.category===category)){
  const effects=kind==='attack'?row.attacks:[row];
  slots+=effects.filter(effect=>norm(effect.text)===norm(body)).length;
 }
 assert(slots>=minimum,'INSUFFICIENT_OFFICIAL_EVIDENCE_FOR_SHARED_FAMILY:'+category);
}
const runtime=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
for(const mechanic of ['TOOL_RETREAT_DISCOUNT_TWO','SUPPORTER_DISCARD_ONE_DRAW_TO_SIX','ATTACK_REVEAL_OPPONENT_HAND'])
 assert(runtime.includes(mechanic),'MISSING_ENGINE_CONNECTION:'+mechanic);
// The UI must reveal cards only in response to the exact private effect event.
const mobile=fs.readFileSync('ui/mobile.js','utf8');
assert(mobile.includes('showVerifiedOpponentHandReveal(playerId,previousHistoryLength)'));
assert(mobile.includes("entry.details.privateTo==='you'&&entry.details.fromZone==='hand'"));
assert(mobile.includes("openSheet('相手の手札を確認',html)"));
assert(mobile.includes("cards.map(card=>"));
console.log('PASS: three exact official families compile safely and are wired to battle execution');
