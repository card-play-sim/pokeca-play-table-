'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const rows=[
  {
    "id": "46702",
    "attack": {
      "name": "ユークレース",
      "cost": [
        "草",
        "水",
        "悪"
      ],
      "damage": "0",
      "text": "ダメカンが6個のっている相手のポケモンを1匹選び、きぜつさせる。",
      "effectId": "reference-46702-attack-1",
      "plan": {
        "mechanic": "ATTACK_DIRECT_KNOCKOUT",
        "commands": [
          "ADD_STATE"
        ],
        "mode": "chosenCounters",
        "count": 6,
        "sharedWording": true
      }
    }
  },
  {
    "id": "47127",
    "attack": {
      "name": "ユークレース",
      "cost": [
        "草",
        "水",
        "悪"
      ],
      "damage": "0",
      "text": "ダメカンが6個のっている相手のポケモンを1匹選び、きぜつさせる。",
      "effectId": "reference-47127-attack-1",
      "plan": {
        "mechanic": "ATTACK_DIRECT_KNOCKOUT",
        "commands": [
          "ADD_STATE"
        ],
        "mode": "chosenCounters",
        "count": 6,
        "sharedWording": true
      }
    }
  },
  {
    "id": "48878",
    "attack": {
      "name": "ユークレース",
      "cost": [
        "草",
        "水",
        "悪"
      ],
      "damage": "0",
      "text": "ダメカンが6個のっている相手のポケモンを1匹選び、きぜつさせる。",
      "effectId": "reference-48878-attack-1",
      "plan": {
        "mechanic": "ATTACK_DIRECT_KNOCKOUT",
        "commands": [
          "ADD_STATE"
        ],
        "mode": "chosenCounters",
        "count": 6,
        "sharedWording": true
      }
    }
  },
  {
    "id": "49685",
    "attack": {
      "name": "デスソウル",
      "cost": [
        "悪",
        "悪",
        "無色"
      ],
      "damage": "0",
      "text": "残りHPが「50」以下の相手のポケモン全員を、それぞれきぜつさせる。",
      "effectId": "reference-49685-attack-0",
      "plan": {
        "mechanic": "ATTACK_DIRECT_KNOCKOUT",
        "commands": [
          "ADD_STATE"
        ],
        "mode": "remainingHpAll",
        "threshold": 50,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50065",
    "attack": {
      "name": "デスソウル",
      "cost": [
        "悪",
        "悪",
        "無色"
      ],
      "damage": "0",
      "text": "残りHPが「50」以下の相手のポケモン全員を、それぞれきぜつさせる。",
      "effectId": "reference-50065-attack-0",
      "plan": {
        "mechanic": "ATTACK_DIRECT_KNOCKOUT",
        "commands": [
          "ADD_STATE"
        ],
        "mode": "remainingHpAll",
        "threshold": 50,
        "sharedWording": true
      }
    }
  }
];
for(const {id,attack} of rows){const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);const row={...parse(proof.html),officialCardId:id};const rec=compile({records:[row]}).records[0];assert(rec.attacks.every(a=>a.plan)&&rec.abilities.every(a=>a.plan));assert.deepEqual(rec.attacks.find(a=>a.name===attack.name),attack);assert.equal(compile({records:[{...row,attacks:[{...attack,text:attack.text+'自分の山札を1枚引く。'}]}]}).records[0].attacks[0].plan,null);}
console.log('5 exact direct knockout prints');
