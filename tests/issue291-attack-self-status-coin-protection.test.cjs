'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const rows=[
  {
    "id": "45181",
    "name": "てっぺき",
    "damage": "0",
    "text": "コインを1回投げオモテなら、次の相手の番、このポケモンはワザのダメージを受けない。",
    "plan": {
      "mechanic": "MASS_COIN_OUTCOME",
      "commands": [
        "COIN_FLIP",
        "DAMAGE",
        "ADD_STATE"
      ],
      "flips": 1,
      "base": 0,
      "protect": "damageOnly",
      "when": "all",
      "sharedWording": true
    }
  },
  {
    "id": "45182",
    "name": "てっぺき",
    "damage": "0",
    "text": "コインを1回投げオモテなら、次の相手の番、このポケモンはワザのダメージを受けない。",
    "plan": {
      "mechanic": "MASS_COIN_OUTCOME",
      "commands": [
        "COIN_FLIP",
        "DAMAGE",
        "ADD_STATE"
      ],
      "flips": 1,
      "base": 0,
      "protect": "damageOnly",
      "when": "all",
      "sharedWording": true
    }
  },
  {
    "id": "48399",
    "name": "てっぺき",
    "damage": "0",
    "text": "コインを1回投げオモテなら、次の相手の番、このポケモンはワザのダメージを受けない。",
    "plan": {
      "mechanic": "MASS_COIN_OUTCOME",
      "commands": [
        "COIN_FLIP",
        "DAMAGE",
        "ADD_STATE"
      ],
      "flips": 1,
      "base": 0,
      "protect": "damageOnly",
      "when": "all",
      "sharedWording": true
    }
  },
  {
    "id": "46270",
    "name": "コットンウイング",
    "damage": "100",
    "text": "コインを1回投げオモテなら、次の相手の番、このポケモンはワザのダメージを受けない。",
    "plan": {
      "mechanic": "MASS_COIN_OUTCOME",
      "commands": [
        "COIN_FLIP",
        "DAMAGE",
        "ADD_STATE"
      ],
      "flips": 1,
      "base": 100,
      "protect": "damageOnly",
      "when": "all",
      "sharedWording": true
    }
  },
  {
    "id": "47016",
    "name": "シェルヒット",
    "damage": "20",
    "text": "コインを1回投げオモテなら、次の相手の番、このポケモンはワザのダメージを受けない。",
    "plan": {
      "mechanic": "MASS_COIN_OUTCOME",
      "commands": [
        "COIN_FLIP",
        "DAMAGE",
        "ADD_STATE"
      ],
      "flips": 1,
      "base": 20,
      "protect": "damageOnly",
      "when": "all",
      "sharedWording": true
    }
  },
  {
    "id": "50234",
    "name": "フォーリングダウン",
    "damage": "270",
    "text": "このポケモンをねむりにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "ASLEEP"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  },
  {
    "id": "50315",
    "name": "フォーリングダウン",
    "damage": "270",
    "text": "このポケモンをねむりにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "ASLEEP"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  },
  {
    "id": "50101",
    "name": "あばれまわる",
    "damage": "120",
    "text": "このポケモンをこんらんにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "CONFUSED"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  },
  {
    "id": "49695",
    "name": "たおれこむ",
    "damage": "160",
    "text": "このポケモンをねむりにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "ASLEEP"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  },
  {
    "id": "46402",
    "name": "あばれまわる",
    "damage": "130",
    "text": "このポケモンをこんらんにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "CONFUSED"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  },
  {
    "id": "46002",
    "name": "あばれまわる",
    "damage": "160",
    "text": "このポケモンをこんらんにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "CONFUSED"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  },
  {
    "id": "45752",
    "name": "あばれまわる",
    "damage": "80",
    "text": "このポケモンをこんらんにする。",
    "plan": {
      "mechanic": "MASS_EFFECT_SEQUENCE",
      "commands": [
        "DAMAGE",
        "STATUS_CONDITION"
      ],
      "steps": [
        {
          "op": "status",
          "side": "own",
          "status": "CONFUSED"
        }
      ],
      "origin": null,
      "activeOnly": false,
      "sharedWording": true
    }
  }
];
const plan=(t,d)=>compile({records:[{officialCardId:'45181',name:'REGRESSION',category:'pokemon',facts:{basic:true},attacks:[{name:'ATTACK',text:t,damage:d,cost:['無色']}],abilities:[]}]}).records[0].attacks[0].plan;
for(const row of rows){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+row.id+'.json','utf8'));
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+row.id);
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert(proof.html.includes('<meta property="og:url" content="'+proof.url+'"'));
 const attack=parse(proof.html).attacks.find(a=>a.name===row.name);
 assert.equal(attack.text,row.text);assert.equal(attack.damage,row.damage);
 assert.deepEqual(plan(row.text,row.damage),row.plan);
 assert.equal(plan(row.text+'自分の山札を1枚選び、トラッシュする。',row.damage),null);
}
const protection=rows[0].text;
assert.equal(plan(protection,'100+'),null);
assert.equal(plan(protection,'10×'),null);
assert.notEqual(plan(protection.replace('ダメージを','ダメージや効果を'),'0')?.protect,'damageOnly');
console.log('ATTACK_SELF_STATUS_AND_COIN_DAMAGE_ONLY: '+rows.length+' official slots');
