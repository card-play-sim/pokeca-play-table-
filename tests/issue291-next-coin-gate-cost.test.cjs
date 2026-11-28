'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const cases=[['45744','すなかけ',1],['45745','すなかけ',1],['47754','すなかけ',1],['50101','すみふんしゃ',2],['46262','テンタクルレイジ','闘'],['49129','テンタクルレイジ','闘'],['47770','やりかえしシザー','悪'],['45752','ガッツスイング','status']];
const source=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
const costFn=new Function('inPlay','stadium',source.slice(source.indexOf('function cost('),source.indexOf('// Optional deterministic match-owned random stream.'))+'return cost;')(()=>[],()=>null);
for(const [id,name,expected] of cases){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert(proof.html.includes('<meta property="og:url" content="'+proof.url+'"'));
 const parsed=parse(proof.html),attack=parsed.attacks.find(a=>a.name===name);
 const plan=text=>compile({records:[{...parsed,officialCardId:id,name:'REGRESSION',attacks:[{...attack,text}]}]}).records[0].attacks[0].plan;
 const q=plan(attack.text);
 assert.equal(plan(attack.text+'自分の山札を1枚選び、トラッシュする。'),null);
 if(typeof expected==='number'){assert.equal(q.mechanic,'ATTACK_NEXT_COIN_GATE');assert.equal(q.flips,expected);}
 else{
  assert.equal(q.mechanic,'VANILLA_DAMAGE');
  const a={cost:['無色','無色','無色'],plan:q};
  assert.deepEqual(costFn({}, {damage:0,statusCondition:null},a),a.cost);
  assert.deepEqual(costFn({},expected==='status'?{statusCondition:'CONFUSED'}:{damage:10},a),expected==='status'?[]:[expected]);
 }
}
console.log('ATTACK_NEXT_COIN_GATE_AND_COST: '+cases.length+' exact official slots');
