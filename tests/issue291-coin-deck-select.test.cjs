'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const cases=[
  {
    "id": "49695",
    "name": "おおぐい",
    "text": "ウラが出るまでコインを投げ、オモテの数ぶんまで、自分の山札から基本エネルギーを選び、このポケモンにつける。そして山札を切る。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_COIN_DECK_SELECT",
      "commands": [
        "COIN_FLIP",
        "SEARCH_DECK",
        "ATTACH_ENERGY",
        "SHUFFLE_DECK"
      ],
      "mode": "energy",
      "type": null,
      "sharedWording": true
    }
  },
  {
    "id": "50648",
    "name": "じゅうでんダッシュ",
    "text": "ウラが出るまでコインを投げ、オモテの数ぶんまで、自分の山札から「基本[雷]エネルギー」を選び、このポケモンにつける。そして山札を切る。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_COIN_DECK_SELECT",
      "commands": [
        "COIN_FLIP",
        "SEARCH_DECK",
        "ATTACH_ENERGY",
        "SHUFFLE_DECK"
      ],
      "mode": "energy",
      "type": "雷",
      "sharedWording": true
    }
  },
  {
    "id": "47784",
    "name": "つかみほうだい",
    "text": "ウラが出るまでコインを投げ、オモテの数ぶんまで、自分の山札から好きなカードを選び、手札に加える。そして山札を切る。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_COIN_DECK_SELECT",
      "commands": [
        "COIN_FLIP",
        "SEARCH_DECK",
        "ADD_TO_HAND",
        "SHUFFLE_DECK"
      ],
      "mode": "hand",
      "type": null,
      "sharedWording": true
    }
  },
  {
    "id": "49251",
    "name": "つかみほうだい",
    "text": "ウラが出るまでコインを投げ、オモテの数ぶんまで、自分の山札から好きなカードを選び、手札に加える。そして山札を切る。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_COIN_DECK_SELECT",
      "commands": [
        "COIN_FLIP",
        "SEARCH_DECK",
        "ADD_TO_HAND",
        "SHUFFLE_DECK"
      ],
      "mode": "hand",
      "type": null,
      "sharedWording": true
    }
  }
];
for(const row of cases){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+row.id+'.json','utf8'));
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+row.id);
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 const parsed=parse(proof.html),attack=parsed.attacks.find(a=>a.name===row.name);
 assert.equal(attack.text,row.text);assert.equal(attack.damage,row.damage);
 const plan=text=>compile({records:[{...parsed,officialCardId:row.id,name:'REGRESSION',attacks:[{...attack,text}]}]}).records[0].attacks[0].plan;
 assert.deepEqual(plan(row.text),row.plan);
 assert.equal(plan(row.text+'自分の山札を1枚選び、トラッシュする。'),null);
}
console.log('ATTACK_COIN_DECK_SELECT: '+cases.length+' exact official slots');
