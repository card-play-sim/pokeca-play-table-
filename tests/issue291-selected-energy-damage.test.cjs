'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const rows=[
  {
    "id": "47686",
    "attack": {
      "name": "パワーウィップ",
      "cost": [
        "鋼"
      ],
      "damage": "0",
      "text": "相手のポケモン1匹に、このポケモンについているエネルギーの数×20ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-47686-attack-0",
      "plan": {
        "mechanic": "ATTACK_SELECTED_ENERGY_DAMAGE",
        "commands": [
          "DAMAGE"
        ],
        "type": null,
        "unit": 20,
        "sharedWording": true
      }
    }
  },
  {
    "id": "48057",
    "attack": {
      "name": "パワーウィップ",
      "cost": [
        "鋼"
      ],
      "damage": "0",
      "text": "相手のポケモン1匹に、このポケモンについているエネルギーの数×20ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-48057-attack-0",
      "plan": {
        "mechanic": "ATTACK_SELECTED_ENERGY_DAMAGE",
        "commands": [
          "DAMAGE"
        ],
        "type": null,
        "unit": 20,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50232",
    "attack": {
      "name": "ハイドロショット",
      "cost": [
        "無色",
        "無色",
        "無色"
      ],
      "damage": "0",
      "text": "相手のポケモン1匹に、このポケモンについている[水]エネルギーの数×30ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-50232-attack-0",
      "plan": {
        "mechanic": "ATTACK_SELECTED_ENERGY_DAMAGE",
        "commands": [
          "DAMAGE"
        ],
        "type": "水",
        "unit": 30,
        "sharedWording": true
      }
    }
  },
  {
    "id": "48348",
    "attack": {
      "name": "バグズキャノン",
      "cost": [
        "草"
      ],
      "damage": "0",
      "text": "相手のポケモン1匹に、このポケモンについている[草]エネルギーの数×20ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-48348-attack-0",
      "plan": {
        "mechanic": "ATTACK_SELECTED_ENERGY_DAMAGE",
        "commands": [
          "DAMAGE"
        ],
        "type": "草",
        "unit": 20,
        "sharedWording": true
      }
    }
  },
  {
    "id": "47657",
    "attack": {
      "name": "テレキネシス",
      "cost": [
        "超",
        "無色",
        "無色"
      ],
      "damage": "0",
      "text": "相手のポケモン1匹に、70ダメージ。このワザのダメージは弱点・抵抗力を計算しない。",
      "effectId": "reference-47657-attack-1",
      "plan": {
        "mechanic": "ATTACK_SELECTED_ENERGY_DAMAGE",
        "commands": [
          "DAMAGE"
        ],
        "amount": 70,
        "skipWeakness": true,
        "skipResistance": true,
        "sharedWording": true
      }
    }
  },
  {
    "id": "48030",
    "attack": {
      "name": "テレキネシス",
      "cost": [
        "超",
        "無色",
        "無色"
      ],
      "damage": "0",
      "text": "相手のポケモン1匹に、70ダメージ。このワザのダメージは弱点・抵抗力を計算しない。",
      "effectId": "reference-48030-attack-1",
      "plan": {
        "mechanic": "ATTACK_SELECTED_ENERGY_DAMAGE",
        "commands": [
          "DAMAGE"
        ],
        "amount": 70,
        "skipWeakness": true,
        "skipResistance": true,
        "sharedWording": true
      }
    }
  }
];
for(const {id,attack} of rows){const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);const row={...parse(proof.html),officialCardId:id};const rec=compile({records:[row]}).records[0];assert(rec.attacks.every(a=>a.plan)&&rec.abilities.every(a=>a.plan));assert.deepEqual(rec.attacks.find(a=>a.name===attack.name),attack);assert.equal(compile({records:[{...row,attacks:[{...attack,text:attack.text+'自分の山札を1枚引く。'}]}]}).records[0].attacks[0].plan,null);}
console.log('6 exact selected attack prints');
