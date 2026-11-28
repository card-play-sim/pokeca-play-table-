'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const rows=[
  {
    "id": "45974",
    "attack": {
      "name": "ボルトチェンジ",
      "cost": [
        "雷"
      ],
      "damage": "90",
      "text": "このポケモンをベンチの[雷]ポケモンと入れ替える。",
      "effectId": "reference-45974-attack-0",
      "plan": {
        "mechanic": "SWITCH_SELF_ATTACK",
        "commands": [
          "DAMAGE",
          "SWITCH"
        ],
        "type": "雷",
        "sharedWording": true
      }
    }
  },
  {
    "id": "48979",
    "attack": {
      "name": "ボルトチェンジ",
      "cost": [
        "雷"
      ],
      "damage": "90",
      "text": "このポケモンをベンチの[雷]ポケモンと入れ替える。",
      "effectId": "reference-48979-attack-0",
      "plan": {
        "mechanic": "SWITCH_SELF_ATTACK",
        "commands": [
          "DAMAGE",
          "SWITCH"
        ],
        "type": "雷",
        "sharedWording": true
      }
    }
  },
  {
    "id": "50015",
    "attack": {
      "name": "ボルトチェンジ",
      "cost": [
        "雷"
      ],
      "damage": "90",
      "text": "このポケモンをベンチの[雷]ポケモンと入れ替える。",
      "effectId": "reference-50015-attack-0",
      "plan": {
        "mechanic": "SWITCH_SELF_ATTACK",
        "commands": [
          "DAMAGE",
          "SWITCH"
        ],
        "type": "雷",
        "sharedWording": true
      }
    }
  },
  {
    "id": "46267",
    "attack": {
      "name": "サーフリターン",
      "cost": [
        "無色",
        "無色",
        "無色"
      ],
      "damage": "100",
      "text": "のぞむなら、このポケモンと、ついているすべてのカードを、自分の山札にもどして切る。",
      "effectId": "reference-46267-attack-1",
      "plan": {
        "mechanic": "ATTACK_RETURN_SELF_DECK",
        "commands": [
          "DAMAGE",
          "RETURN_TO_DECK",
          "SHUFFLE_DECK"
        ],
        "optional": true,
        "sharedWording": true
      }
    }
  },
  {
    "id": "49250",
    "attack": {
      "name": "サーフリターン",
      "cost": [
        "無色",
        "無色",
        "無色"
      ],
      "damage": "100",
      "text": "のぞむなら、このポケモンと、ついているすべてのカードを、自分の山札にもどして切る。",
      "effectId": "reference-49250-attack-1",
      "plan": {
        "mechanic": "ATTACK_RETURN_SELF_DECK",
        "commands": [
          "DAMAGE",
          "RETURN_TO_DECK",
          "SHUFFLE_DECK"
        ],
        "optional": true,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50238",
    "attack": {
      "name": "アクアリターン",
      "cost": [
        "水",
        "無色"
      ],
      "damage": "120",
      "text": "このポケモンと、ついているすべてのカードを、山札にもどして切る。",
      "effectId": "reference-50238-attack-0",
      "plan": {
        "mechanic": "ATTACK_RETURN_SELF_DECK",
        "commands": [
          "DAMAGE",
          "RETURN_TO_DECK",
          "SHUFFLE_DECK"
        ],
        "optional": false,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50305",
    "attack": {
      "name": "アクアリターン",
      "cost": [
        "水",
        "無色"
      ],
      "damage": "120",
      "text": "このポケモンと、ついているすべてのカードを、山札にもどして切る。",
      "effectId": "reference-50305-attack-0",
      "plan": {
        "mechanic": "ATTACK_RETURN_SELF_DECK",
        "commands": [
          "DAMAGE",
          "RETURN_TO_DECK",
          "SHUFFLE_DECK"
        ],
        "optional": false,
        "sharedWording": true
      }
    }
  }
];
for(const {id,attack} of rows){const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);const row={...parse(proof.html),officialCardId:id};const rec=compile({records:[row]}).records[0];assert(rec.attacks.every(a=>a.plan)&&rec.abilities.every(a=>a.plan));assert.deepEqual(rec.attacks.find(a=>a.name===attack.name),attack);assert.equal(compile({records:[{...row,attacks:[{...attack,text:attack.text+'自分の山札を1枚引く。'}]}]}).records[0].attacks[0].plan,null);}
console.log('7 exact official switch/return prints');
