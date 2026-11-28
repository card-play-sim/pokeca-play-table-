'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const cases=[
  {
    "id": "50256",
    "name": "むねんのイカリ",
    "text": "自分のトラッシュに、特性「ばけがくれ」を持つポケモンが4枚以上あるなら、140ダメージ追加。",
    "damage": "30+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "discardAbilityThreshold",
      "base": 30,
      "bonus": 140,
      "threshold": 4,
      "name": "ばけがくれ",
      "sharedWording": true
    }
  },
  {
    "id": "50308",
    "name": "むねんのイカリ",
    "text": "自分のトラッシュに、特性「ばけがくれ」を持つポケモンが4枚以上あるなら、140ダメージ追加。",
    "damage": "30+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "discardAbilityThreshold",
      "base": 30,
      "bonus": 140,
      "threshold": 4,
      "name": "ばけがくれ",
      "sharedWording": true
    }
  },
  {
    "id": "45905",
    "name": "バッドフォール",
    "text": "自分の場に[悪]エネルギーが3個以上あるなら、50ダメージ追加。",
    "damage": "20+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownFieldTypedThreshold",
      "base": 20,
      "bonus": 50,
      "threshold": 3,
      "type": "悪",
      "sharedWording": true
    }
  },
  {
    "id": "49170",
    "name": "バッドフォール",
    "text": "自分の場に[悪]エネルギーが3個以上あるなら、50ダメージ追加。",
    "damage": "20+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownFieldTypedThreshold",
      "base": 20,
      "bonus": 50,
      "threshold": 3,
      "type": "悪",
      "sharedWording": true
    }
  },
  {
    "id": "47553",
    "name": "はじけるひばしら",
    "text": "自分のトラッシュに「基本[炎]エネルギー」が10枚以上あるなら、100ダメージ追加。",
    "damage": "50+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "discardBasicThreshold",
      "base": 50,
      "bonus": 100,
      "threshold": 10,
      "type": "炎",
      "sharedWording": true
    }
  },
  {
    "id": "47926",
    "name": "はじけるひばしら",
    "text": "自分のトラッシュに「基本[炎]エネルギー」が10枚以上あるなら、100ダメージ追加。",
    "damage": "50+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "discardBasicThreshold",
      "base": 50,
      "bonus": 100,
      "threshold": 10,
      "type": "炎",
      "sharedWording": true
    }
  },
  {
    "id": "47420",
    "name": "ひょうけつウッド",
    "text": "このポケモンに[草]エネルギーが2個以上ついているなら、120ダメージ追加。",
    "damage": "120+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownActiveTypedThreshold",
      "base": 120,
      "bonus": 120,
      "threshold": 2,
      "type": "草",
      "sharedWording": true
    }
  },
  {
    "id": "47826",
    "name": "エレキフォール",
    "text": "自分の場に[雷]エネルギーが4個以上あるなら、90ダメージ追加。",
    "damage": "30+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownFieldTypedThreshold",
      "base": 30,
      "bonus": 90,
      "threshold": 4,
      "type": "雷",
      "sharedWording": true
    }
  },
  {
    "id": "48542",
    "name": "フレアフォール",
    "text": "自分の場に[炎]エネルギーが4個以上あるなら、90ダメージ追加。",
    "damage": "30+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownFieldTypedThreshold",
      "base": 30,
      "bonus": 90,
      "threshold": 4,
      "type": "炎",
      "sharedWording": true
    }
  },
  {
    "id": "48366",
    "name": "クリスタルフォール",
    "text": "自分の場に[水]エネルギーが4個以上あるなら、90ダメージ追加。",
    "damage": "30+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "ownFieldTypedThreshold",
      "base": 30,
      "bonus": 90,
      "threshold": 4,
      "type": "水",
      "sharedWording": true
    }
  },
  {
    "id": "49639",
    "name": "ソーラーワインダー",
    "text": "自分のトラッシュに「メイのはげまし」があるなら、150ダメージ追加。",
    "damage": "100+",
    "plan": {
      "mechanic": "MASS_BOARD_BONUS",
      "commands": [
        "DAMAGE"
      ],
      "predicate": "discardNamed",
      "base": 100,
      "bonus": 150,
      "name": "メイのはげまし",
      "sharedWording": true
    }
  }
];
for(const row of cases){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+row.id+'.json','utf8'));
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 const parsed=parse(proof.html),attack=parsed.attacks.find(a=>a.name===row.name);
 assert.equal(attack.text,row.text);assert.equal(attack.damage,row.damage);
 const plan=text=>compile({records:[{...parsed,officialCardId:row.id,name:'REGRESSION',attacks:[{...attack,text}]}]}).records[0].attacks[0].plan;
 assert.deepEqual(plan(row.text),row.plan);
 assert.equal(plan(row.text+'自分の山札を1枚選び、トラッシュする。'),null);
}
console.log('MASS_BOARD_BONUS thresholds: '+cases.length+' exact official slots');

// Official name/ex grammar uses NFKC parentheses and repeated coins can be three-digit.
for(const row of [
  {
    "id": "50087",
    "name": "ビーランブル",
    "text": "自分の場の「スピアー（『ポケモンex』をふくむ）」の数×110ダメージ。",
    "damage": "110×",
    "plan": {
      "mechanic": "SCALED_ATTACK_DAMAGE",
      "commands": [
        "DAMAGE"
      ],
      "metric": "ownNamedOrExCount",
      "name": "スピアー",
      "unit": 110,
      "base": 0,
      "sharedWording": true
    },
    "full": true
  },
  {
    "id": "50195",
    "name": "ビーランブル",
    "text": "自分の場の「スピアー（『ポケモンex』をふくむ）」の数×110ダメージ。",
    "damage": "110×",
    "plan": {
      "mechanic": "SCALED_ATTACK_DAMAGE",
      "commands": [
        "DAMAGE"
      ],
      "metric": "ownNamedOrExCount",
      "name": "スピアー",
      "unit": 110,
      "base": 0,
      "sharedWording": true
    },
    "full": true
  },
  {
    "id": "50640",
    "name": "ピカれんさ",
    "text": "自分の場の「ピカチュウ（『ポケモンex』をふくむ）」の数×40ダメージ。",
    "damage": "40×",
    "plan": {
      "mechanic": "SCALED_ATTACK_DAMAGE",
      "commands": [
        "DAMAGE"
      ],
      "metric": "ownNamedOrExCount",
      "name": "ピカチュウ",
      "unit": 40,
      "base": 0,
      "sharedWording": true
    },
    "full": true
  },
  {
    "id": "48949",
    "name": "ひゃくれつボール",
    "text": "ウラが出るまでコインを投げ、オモテの数×100ダメージ追加。",
    "damage": "100+",
    "plan": {
      "mechanic": "COIN_UNTIL_TAILS_DAMAGE",
      "commands": [
        "COIN_FLIP",
        "DAMAGE"
      ],
      "base": 100,
      "unit": 100
    },
    "full": true
  },
  {
    "id": "45769",
    "name": "つっぱしる",
    "text": "ウラが出るまでコインを投げ、オモテの数×100ダメージ。",
    "damage": "100×",
    "plan": {
      "mechanic": "COIN_UNTIL_TAILS_DAMAGE",
      "commands": [
        "COIN_FLIP",
        "DAMAGE"
      ],
      "base": 0,
      "unit": 100
    },
    "full": false
  }
]){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+row.id+'.json','utf8'));
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 const parsed=parse(proof.html),record=compile({records:[{...parsed,officialCardId:row.id}]}).records[0];
 const attack=record.attacks.find(a=>a.name===row.name);
 assert.equal(attack.text,row.text);assert.equal(attack.damage,row.damage);assert.deepEqual(attack.plan,row.plan);
 if(row.full)assert(record.attacks.every(a=>a.plan)&&record.abilities.every(a=>a.plan));
 assert.equal(compile({records:[{...parsed,officialCardId:row.id,attacks:[{...attack,text:attack.text+'自分の山札を1枚引く。'}]}]}).records[0].attacks[0].plan,null);
}
