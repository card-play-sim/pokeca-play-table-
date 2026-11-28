'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const rows=[
  {
    "id": "50273",
    "attack": {
      "name": "シャドーウィップ",
      "cost": [
        "悪",
        "悪",
        "悪"
      ],
      "damage": "100+",
      "text": "自分のベンチポケモンに「シャドー[悪]エネルギー」がついているなら、70ダメージ追加。",
      "effectId": "reference-50273-attack-1",
      "plan": {
        "mechanic": "MASS_BOARD_BONUS",
        "commands": [
          "DAMAGE"
        ],
        "predicate": "ownBenchNamedEnergy",
        "base": 100,
        "bonus": 70,
        "name": "シャドー[悪]エネルギー",
        "sharedWording": true
      }
    }
  },
  {
    "id": "50310",
    "attack": {
      "name": "シャドーウィップ",
      "cost": [
        "悪",
        "悪",
        "悪"
      ],
      "damage": "100+",
      "text": "自分のベンチポケモンに「シャドー[悪]エネルギー」がついているなら、70ダメージ追加。",
      "effectId": "reference-50310-attack-1",
      "plan": {
        "mechanic": "MASS_BOARD_BONUS",
        "commands": [
          "DAMAGE"
        ],
        "predicate": "ownBenchNamedEnergy",
        "base": 100,
        "bonus": 70,
        "name": "シャドー[悪]エネルギー",
        "sharedWording": true
      }
    }
  },
  {
    "id": "50088",
    "attack": {
      "name": "まるかじり",
      "cost": [
        "無色",
        "無色",
        "無色"
      ],
      "damage": "80+",
      "text": "相手のバトルポケモンのにげるためのエネルギーがないなら、80ダメージ追加。",
      "effectId": "reference-50088-attack-0",
      "plan": {
        "mechanic": "MASS_BOARD_BONUS",
        "commands": [
          "DAMAGE"
        ],
        "predicate": "opponentRetreatZero",
        "base": 80,
        "bonus": 80,
        "sharedWording": true
      }
    }
  },
  {
    "id": "46024",
    "attack": {
      "name": "エアロチェイス",
      "cost": [
        "無色",
        "無色"
      ],
      "damage": "110+",
      "text": "相手のバトルポケモンのにげるためのエネルギーが2個以上なら、110ダメージ追加。",
      "effectId": "reference-46024-attack-0",
      "plan": {
        "mechanic": "MASS_BOARD_BONUS",
        "commands": [
          "DAMAGE"
        ],
        "predicate": "opponentRetreatAtLeast",
        "base": 110,
        "bonus": 110,
        "threshold": 2,
        "sharedWording": true
      }
    }
  },
  {
    "id": "46186",
    "attack": {
      "name": "シャインブレイズ",
      "cost": [
        "炎",
        "炎",
        "無色"
      ],
      "damage": "100+",
      "text": "自分のベンチに「テラスタル」のポケモンがいるなら、100ダメージ追加。",
      "effectId": "reference-46186-attack-1",
      "plan": {
        "mechanic": "MASS_BOARD_BONUS",
        "commands": [
          "DAMAGE"
        ],
        "predicate": "ownBenchTera",
        "base": 100,
        "bonus": 100,
        "sharedWording": true
      }
    }
  }
];
for(const {id,attack} of rows){const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);const row={...parse(proof.html),officialCardId:id};const rec=compile({records:[row]}).records[0];assert(rec.attacks.every(a=>a.plan)&&rec.abilities.every(a=>a.plan));assert.deepEqual(rec.attacks.find(a=>a.name===attack.name),attack);assert.equal(compile({records:[{...row,attacks:[{...attack,text:attack.text+'自分の山札を1枚引く。'}]}]}).records[0].attacks[0].plan,null);}
console.log('5 exact official board bonus prints');
