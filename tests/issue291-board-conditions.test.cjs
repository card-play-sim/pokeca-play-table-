'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const cases=[
  {
    "id": "45988",
    "name": "ほねリベンジ",
    "text": "自分のベンチの「カラカラ」にダメカンがのっているなら、120ダメージ追加。",
    "damage": "60+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownBenchNamedDamaged",
      "base": 60,
      "bonus": 120,
      "name": "カラカラ",
      "sharedWording": true
    }
  },
  {
    "id": "48635",
    "name": "おやぶんパンチ",
    "text": "自分のベンチの「ヤンチャム」にダメカンがのっているなら、120ダメージ追加。",
    "damage": "80+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownBenchNamedDamaged",
      "base": 80,
      "bonus": 120,
      "name": "ヤンチャム",
      "sharedWording": true
    }
  },
  {
    "id": "49642",
    "name": "ふきぬける",
    "text": "場にスタジアムが出ているなら、60ダメージ追加。",
    "damage": "60+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "stadiumPresent",
      "base": 60,
      "bonus": 60,
      "sharedWording": true
    }
  },
  {
    "id": "47445",
    "name": "マウンテンフォール",
    "text": "場にスタジアムが出ているなら、70ダメージ追加。",
    "damage": "70+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "stadiumPresent",
      "base": 70,
      "bonus": 70,
      "sharedWording": true
    }
  },
  {
    "id": "45243",
    "name": "ろうでんナックル",
    "text": "相手の場に[水]ポケモンがいるなら、120ダメージ追加。",
    "damage": "40+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "opponentFieldType",
      "base": 40,
      "bonus": 120,
      "type": "水",
      "sharedWording": true
    }
  },
  {
    "id": "48389",
    "name": "むくいのツメ",
    "text": "このポケモンの残りHPが「50」以下なら、170ダメージ追加。",
    "damage": "20+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownRemainingHp",
      "base": 20,
      "bonus": 170,
      "threshold": 50,
      "sharedWording": true
    }
  },
  {
    "id": "47447",
    "name": "あいきしょう",
    "text": "このポケモンと相手のバトルポケモンについているエネルギーの数が同じなら、120ダメージ追加。",
    "damage": "50+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "equalActiveEnergy",
      "base": 50,
      "bonus": 120,
      "sharedWording": true
    }
  },
  {
    "id": "45398",
    "name": "ジャストビーク",
    "text": "このポケモンと相手のバトルポケモンについているエネルギーの数が同じなら、100ダメージ追加。",
    "damage": "30+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "equalActiveEnergy",
      "base": 30,
      "bonus": 100,
      "sharedWording": true
    }
  },
  {
    "id": "46001",
    "name": "パックンマウス",
    "text": "このポケモンについているエネルギーの数が、相手のバトルポケモンについているエネルギーの数より多いなら、160ダメージ追加。",
    "damage": "10+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "moreActiveEnergy",
      "base": 10,
      "bonus": 160,
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
console.log('MASS_BOARD_BONUS: '+cases.length+' exact official slots');
