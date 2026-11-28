'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const rows=[
  {
    "id": "50064",
    "attack": {
      "name": "ムニキスゼロ",
      "cost": [
        "闘",
        "闘",
        "闘",
        "闘",
        "闘"
      ],
      "damage": "0",
      "text": "相手のポケモン全員に対して、それぞれ1回ずつコインを投げ、オモテが出たポケモン全員に、それぞれ150ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-50064-attack-1",
      "plan": {
        "mechanic": "ATTACK_COIN_PER_TARGET",
        "commands": [
          "COIN_FLIP",
          "DAMAGE"
        ],
        "amount": 150,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50080",
    "attack": {
      "name": "ムニキスゼロ",
      "cost": [
        "闘",
        "闘",
        "闘",
        "闘",
        "闘"
      ],
      "damage": "0",
      "text": "相手のポケモン全員に対して、それぞれ1回ずつコインを投げ、オモテが出たポケモン全員に、それぞれ150ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-50080-attack-1",
      "plan": {
        "mechanic": "ATTACK_COIN_PER_TARGET",
        "commands": [
          "COIN_FLIP",
          "DAMAGE"
        ],
        "amount": 150,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50084",
    "attack": {
      "name": "ムニキスゼロ",
      "cost": [
        "闘",
        "闘",
        "闘",
        "闘",
        "闘"
      ],
      "damage": "0",
      "text": "相手のポケモン全員に対して、それぞれ1回ずつコインを投げ、オモテが出たポケモン全員に、それぞれ150ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-50084-attack-1",
      "plan": {
        "mechanic": "ATTACK_COIN_PER_TARGET",
        "commands": [
          "COIN_FLIP",
          "DAMAGE"
        ],
        "amount": 150,
        "sharedWording": true
      }
    }
  },
  {
    "id": "49679",
    "attack": {
      "name": "ムニキスゼロ",
      "cost": [
        "闘",
        "闘",
        "闘",
        "闘",
        "闘"
      ],
      "damage": "0",
      "text": "相手のポケモン全員に対して、それぞれ1回ずつコインを投げ、オモテが出たポケモン全員に、それぞれ150ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-49679-attack-1",
      "plan": {
        "mechanic": "ATTACK_COIN_PER_TARGET",
        "commands": [
          "COIN_FLIP",
          "DAMAGE"
        ],
        "amount": 150,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50356",
    "attack": {
      "name": "あらぶるうず",
      "cost": [
        "水",
        "水",
        "無色"
      ],
      "damage": "100",
      "text": "名前に「伝説」とつくスタジアムが場に出ているなら、相手のベンチポケモン全員にも、それぞれ50ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-50356-attack-1",
      "plan": {
        "mechanic": "ATTACK_NAMED_STADIUM_SPREAD",
        "commands": [
          "DAMAGE"
        ],
        "name": "伝説",
        "amount": 50,
        "sharedWording": true
      }
    }
  },
  {
    "id": "50521",
    "attack": {
      "name": "あらぶるうず",
      "cost": [
        "水",
        "水",
        "無色"
      ],
      "damage": "100",
      "text": "名前に「伝説」とつくスタジアムが場に出ているなら、相手のベンチポケモン全員にも、それぞれ50ダメージ。［ベンチは弱点・抵抗力を計算しない。］",
      "effectId": "reference-50521-attack-1",
      "plan": {
        "mechanic": "ATTACK_NAMED_STADIUM_SPREAD",
        "commands": [
          "DAMAGE"
        ],
        "name": "伝説",
        "amount": 50,
        "sharedWording": true
      }
    }
  }
];
for(const {id,attack} of rows){const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);const row={...parse(proof.html),officialCardId:id};const rec=compile({records:[row]}).records[0];assert(rec.attacks.every(a=>a.plan)&&rec.abilities.every(a=>a.plan));assert.deepEqual(rec.attacks.find(a=>a.name===attack.name),attack);assert.equal(compile({records:[{...row,attacks:[{...attack,text:attack.text+'自分の山札を1枚引く。'}]}]}).records[0].attacks[0].plan,null);}
console.log('6 exact scoped spread prints');
