'use strict';
const assert=require('node:assert/strict');
const {compile}=require('../engine/reference-effect-plans.cjs');
const plan=text=>compile({records:[{officialCardId:'1',category:'pokemon',attacks:[],abilities:[{text}],facts:{}}]}).records[0].abilities[0].plan;
const cases=[
  {
    "mechanic": "PASSIVE_CONTEXT_COST_DISCOUNT",
    "text": "自分の場に「トルネロス」「ボルトロス」「ランドロス」「ラブトロス」がいるなら、このポケモンはワザを使うための[無色]エネルギーが、すべてなくなる。",
    "ids": [
      "50363",
      "50372",
      "50378",
      "50397",
      "50524"
    ]
  },
  {
    "mechanic": "PASSIVE_CONTEXT_COST_DISCOUNT",
    "text": "自分のトラッシュにある「ハイダイ」の枚数ぶん、このポケモンがワザを使うための[無色]エネルギーは少なくなる。",
    "ids": [
      "45966",
      "45963",
      "46155",
      "48925",
      "48935"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分のポケモンが使うワザの、相手のバトルポケモンへのダメージは「+20」される。",
    "ids": [
      "47539",
      "47983",
      "47991",
      "48758"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分の「シロナのポケモン」が使うワザの、相手のバトルポケモンへのダメージは「+30」される。",
    "ids": [
      "47300",
      "47366",
      "48532",
      "48749"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分の[闘]ポケモンが使うワザの、相手のバトルポケモンへのダメージは「+30」される。",
    "ids": [
      "47769",
      "48427",
      "49134"
    ]
  },
  {
    "mechanic": "PASSIVE_CONTEXT_COST_DISCOUNT",
    "text": "相手のベンチポケモンの数ぶん、このポケモンがワザを使うための[無色]エネルギーは少なくなる。",
    "ids": [
      "45239",
      "45557",
      "48848"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分の「ホップのポケモン」が使うワザの、相手のバトルポケモンへのダメージは「+30」される。この効果は、この特性を持つポケモンが何匹いても、重ならない。",
    "ids": [
      "47083",
      "48658",
      "49285"
    ]
  },
  {
    "mechanic": "PASSIVE_CONTEXT_COST_DISCOUNT",
    "text": "相手の手札が4枚なら、このポケモンはワザを使うための[無色]エネルギーが、すべてなくなる。",
    "ids": [
      "49645",
      "50060"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分の[炎]タイプの進化ポケモンが使うワザの、相手のバトルポケモンへのダメージは「+10」される。",
    "ids": [
      "46352"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分の[草]または[炎]ポケモンが使うワザの、相手のバトルポケモンへのダメージは「+20」される。",
    "ids": [
      "46462"
    ]
  },
  {
    "mechanic": "PASSIVE_TEAM_ATTACK_BOOST",
    "text": "このポケモンがいるかぎり、自分のポケモンが使うワザの、相手のバトル場の進化ポケモンへのダメージは「+30」される。",
    "ids": [
      "45962"
    ]
  }
];
for(const c of cases)assert.equal(plan(c.text)?.mechanic,c.mechanic,c.text);
assert.equal(plan('このポケモンがいるかぎり、自分の「ホップのポケモン」が使うワザの、相手のバトルポケモンへのダメージは「+30」される。この効果は、この特性を持つポケモンが何匹いても、重ならない。').nonStack,true);
assert.equal(plan('このポケモンがいるかぎり、自分のポケモンが使うワザの、相手のバトル場の進化ポケモンへのダメージは「+30」される。').evolvedTarget,true);
assert.deepEqual(plan('このポケモンがいるかぎり、自分の[草]または[炎]ポケモンが使うワザの、相手のバトルポケモンへのダメージは「+20」される。').types,['草','炎']);
assert.notEqual(plan(cases[0].text+'追加条件がある。')?.mechanic,cases[0].mechanic);
console.log('PASSIVE_CONTEXT_GRAMMAR_EXACT_TEXT_PASS',cases.length,new Set(cases.flatMap(c=>c.ids)).size);

const activeStatus=[
 ['やけど','BURNED'],
 ['ねむり','ASLEEP']
];
for(const [jp,status] of activeStatus){
 const text='このポケモンがバトル場にいるなら、自分の番に1回使える。相手のバトルポケモンを'+jp+'にする。';
 const result=plan(text);
 assert.equal(result.mechanic,'MASS_EFFECT_SEQUENCE');
 assert.equal(result.origin,'active');
 assert.deepEqual(result.steps,[{op:'status',side:'opponent',status}]);
 assert.notEqual(plan(text+'追加条件がある。')?.mechanic,'MASS_EFFECT_SEQUENCE');
}
for(const [printed,count] of [['150',3],['170',1],['80',1]]){
 const text='のぞむなら、自分の山札から好きなカードを'+(count===1?'1枚':count+'枚まで')+'選び、手札に加える。そして山札を切る。';
 const attackPlan=compile({records:[{officialCardId:'1',category:'pokemon',abilities:[],attacks:[{text,damage:printed,cost:['無色']}],facts:{}}]}).records[0].attacks[0].plan;
 assert.equal(attackPlan.mechanic,'SEARCH_REVEAL_TO_HAND_ATTACK');
 assert.equal(attackPlan.limit,count);
 assert.equal(attackPlan.optional,true);
 assert.equal(attackPlan.reveal,false);
}
console.log('ACTIVE_STATUS_AND_OPTIONAL_SEARCH_GRAMMAR_PASS');

for(const [type,count,damage] of [['炎',1,'200'],['草',1,'40'],['雷',2,'160'],['闘',2,'100']]){
 const text='このポケモンについている['+type+']エネルギーを'+count+'個選び、トラッシュする。';
 const p=compile({records:[{officialCardId:'1',category:'pokemon',abilities:[],attacks:[{text,damage,cost:[type]}],facts:{}}]}).records[0].attacks[0].plan;
 assert.equal(p.mechanic,'ATTACK_DISCARD_MULTIPLE_SELF_ENERGY');
 assert.equal(p.count,count);assert.equal(p.type,type);
}
const discardStatus=compile({records:[{officialCardId:'2',category:'pokemon',abilities:[],attacks:[{text:'このポケモンについているエネルギーをすべてトラッシュし、相手のバトルポケモンをマヒにする。',damage:'70',cost:['雷']}],facts:{}}]}).records[0].attacks[0].plan;
assert.deepEqual(discardStatus.steps,[{op:'discardAttached'},{op:'status',side:'opponent',status:'PARALYZED'}]);
console.log('TYPED_DISCARD_AND_STATUS_GRAMMAR_PASS');

for(const [cost,scope,count,amount,base] of [['すべて','相手のポケモン',1,120,0],['すべて','相手のベンチポケモン',1,90,90],['2個','相手のポケモン',2,120,0],['3個','相手のポケモン',1,280,0],['すべて','相手のポケモン',3,110,0]]){
 const text='このポケモンについているエネルギーを'+cost+'トラッシュし、'+scope+count+'匹'+(base?'にも':'に')+'、'+(count>1?'それぞれ':'')+amount+'ダメージ。［ベンチは弱点・抵抗力を計算しない。］';
 const row={officialCardId:'1',category:'pokemon',abilities:[],attacks:[{text,damage:String(base),cost:['無色','無色','無色']}],facts:{}};
 const p=compile({records:[row]}).records[0].attacks[0].plan;
 assert.equal(p.mechanic,'ATTACK_SPREAD_DAMAGE');
 assert.equal(p.scope,scope==='相手のポケモン'?'opponent':'opponentBench');
 assert.equal(p.amount,amount);assert.equal(p.count,count);assert.equal(p.discardAttached,cost==='すべて'?'all':Number.parseInt(cost,10));
 const malformed=compile({records:[{...row,attacks:[{...row.attacks[0],text:text+'追加条件。'}]}]}).records[0].attacks[0].plan;
 assert.notEqual(malformed?.mechanic,'ATTACK_SPREAD_DAMAGE');
}
console.log('COMPOUND_SPREAD_DISCARD_GRAMMAR_PASS');
