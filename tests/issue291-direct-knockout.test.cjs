'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const cases=[
  {
    "id": "50265",
    "name": "アビスアイ",
    "text": "相手のバトルポケモンが特殊状態なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "status",
      "sharedWording": true
    }
  },
  {
    "id": "50319",
    "name": "アビスアイ",
    "text": "相手のバトルポケモンが特殊状態なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "status",
      "sharedWording": true
    }
  },
  {
    "id": "50334",
    "name": "アビスアイ",
    "text": "相手のバトルポケモンが特殊状態なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "status",
      "sharedWording": true
    }
  },
  {
    "id": "50338",
    "name": "アビスアイ",
    "text": "相手のバトルポケモンが特殊状態なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "status",
      "sharedWording": true
    }
  },
  {
    "id": "47771",
    "name": "デスピリオド",
    "text": "相手のバトルポケモンにのっているダメカンが6個なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "counters",
      "count": 6,
      "sharedWording": true
    }
  },
  {
    "id": "48436",
    "name": "デスピリオド",
    "text": "相手のバトルポケモンにのっているダメカンが6個なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "counters",
      "count": 6,
      "sharedWording": true
    }
  },
  {
    "id": "48446",
    "name": "デスピリオド",
    "text": "相手のバトルポケモンにのっているダメカンが6個なら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "counters",
      "count": 6,
      "sharedWording": true
    }
  },
  {
    "id": "47608",
    "name": "アックスボンバー",
    "text": "相手のバトルポケモンがたねポケモンなら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "basic",
      "sharedWording": true
    }
  },
  {
    "id": "47976",
    "name": "アックスボンバー",
    "text": "相手のバトルポケモンがたねポケモンなら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "basic",
      "sharedWording": true
    }
  },
  {
    "id": "45921",
    "name": "アックスダウン",
    "text": "相手のバトルポケモンに特殊エネルギーがついているなら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "specialEnergy",
      "sharedWording": true
    }
  },
  {
    "id": "49259",
    "name": "アックスダウン",
    "text": "相手のバトルポケモンに特殊エネルギーがついているなら、そのポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "specialEnergy",
      "sharedWording": true
    }
  },
  {
    "id": "46402",
    "name": "みちづれファイト",
    "text": "おたがいのバトルポケモンをきぜつさせる。",
    "damage": "0",
    "plan": {
      "mechanic": "ATTACK_DIRECT_KNOCKOUT",
      "commands": [
        "ADD_STATE"
      ],
      "mode": "both",
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
 const plan=(text,damage)=>compile({records:[{...parsed,officialCardId:row.id,name:'REGRESSION',attacks:[{...attack,text,damage}]}]}).records[0].attacks[0].plan;
 assert.deepEqual(plan(row.text,row.damage),row.plan);
 assert.equal(plan(row.text+'自分の山札を1枚選び、トラッシュする。',row.damage),null);
 assert.equal(plan(row.text,'100'),null);
}
console.log('ATTACK_DIRECT_KNOCKOUT: '+cases.length+' exact official slots');
