'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const cases=[
  {
    "id": "45258",
    "name": "リパルサーアックス",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを8個のせる。",
    "damage": "60",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 8,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "45559",
    "name": "リパルサーアックス",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを8個のせる。",
    "damage": "60",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 8,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "45567",
    "name": "リパルサーアックス",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを8個のせる。",
    "damage": "60",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 8,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "45572",
    "name": "リパルサーアックス",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを8個のせる。",
    "damage": "60",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 8,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "49145",
    "name": "リパルサーアックス",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを8個のせる。",
    "damage": "60",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 8,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "46427",
    "name": "まちうけホーン",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを6個のせる。",
    "damage": "40",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 6,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "50036",
    "name": "シェルネードスピン",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、ワザを使ったポケモンにダメカンを12個のせる。",
    "damage": "180",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": 12,
      "reflect": false,
      "sharedWording": true
    }
  },
  {
    "id": "47468",
    "name": "ストロングバッシュ",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、受けたダメージぶんのダメカンを、ワザを使ったポケモンにのせる。",
    "damage": "70",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": null,
      "reflect": true,
      "sharedWording": true
    }
  },
  {
    "id": "47511",
    "name": "ストロングバッシュ",
    "text": "次の相手の番、このポケモンがワザのダメージを受けたとき、受けたダメージぶんのダメカンを、ワザを使ったポケモンにのせる。",
    "damage": "70",
    "plan": {
      "mechanic": "ATTACK_NEXT_HIT_RETALIATION",
      "commands": [
        "DAMAGE",
        "ADD_STATE"
      ],
      "counterCount": null,
      "reflect": true,
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
console.log('ATTACK_NEXT_HIT_RETALIATION: '+cases.length+' exact official slots');
