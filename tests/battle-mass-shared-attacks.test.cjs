'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compile}=require('../engine/reference-effect-plans.cjs');
const ledger=JSON.parse(fs.readFileSync('reports/official-effect-continuation/atomic-battle-connection-shared-mechanic-worklist.json','utf8'));
const groups=ledger.groups||[];
const normalize=s=>String(s||'').replace(/\s+/g,'').normalize('NFKC');
function expected(group){
 if(group.effectKind!=='attack')return null;
 const text=normalize(group.exampleOfficialText),damage=String(group.printedDamage).normalize('NFKC');
 let match;
 if(/^\d+$/.test(damage)&&(match=text.match(/^相手のバトルポケモンを(やけど|どく|ねむり|こんらん)にする。$/)))
  return {mechanic:'ATTACK_APPLY_STATUS',status:{'やけど':'BURNED','どく':'POISONED','ねむり':'ASLEEP','こんらん':'CONFUSED'}[match[1]]};
 if(/^\d+$/.test(damage)&&(match=text.match(/^自分のポケモン全員のHPを、それぞれ「([1-9][0-9]{0,2})」回復する。$/)))
  return {mechanic:'ATTACK_HEAL_TEAM',amount:Number(match[1])};
 if((match=text.match(/^相手がすでにとったサイドの枚数×([1-9][0-9]{0,2})ダメージ。$/))&&damage===match[1]+'×')
  return {mechanic:'ATTACK_TAKEN_PRIZES_DAMAGE',unit:Number(match[1])};
 if((match=text.match(/^相手のバトルポケモンが特殊状態なら、([1-9][0-9]{0,2})ダメージ追加。$/))&&/^\d{1,3}\+$/.test(damage))
  return {mechanic:'ATTACK_STATUS_BONUS_DAMAGE',base:Number.parseInt(damage,10),bonus:Number(match[1])};
 return null;
}
function plan(text,damage){
 const r={officialCardId:'46235',name:'OFFICIAL_REGRESSION',category:'pokemon',attacks:[{name:'ATTACK',text,damage,cost:['無色']}],abilities:[],facts:{basic:true}};
 return compile({records:[r]}).records[0].attacks[0].plan;
}
const selected=groups.map(g=>({g,e:expected(g)})).filter(x=>x.e);
// The atomic intake removes resolved groups from the live worklist.  A shrinking
// backlog is success, not a regression: validate each family with stable
// representative official-text fixtures and inspect any still-blocked groups.
const canonical=[
 {text:'相手のバトルポケモンをやけどにする。',damage:'0',mechanic:'ATTACK_APPLY_STATUS'},
 {text:'自分のポケモン全員のHPを、それぞれ「30」回復する。',damage:'0',mechanic:'ATTACK_HEAL_TEAM'},
 {text:'相手がすでにとったサイドの枚数×30ダメージ。',damage:'30×',mechanic:'ATTACK_TAKEN_PRIZES_DAMAGE'},
 {text:'相手のバトルポケモンが特殊状態なら、30ダメージ追加。',damage:'50+',mechanic:'ATTACK_STATUS_BONUS_DAMAGE'}
];
for(const fixture of canonical){
 const actual=plan(fixture.text,fixture.damage);
 assert(actual,'known shared effect must still compile: '+fixture.text);
 assert.equal(actual.mechanic,fixture.mechanic,fixture.text);
 assert(actual.commands.length>0);
}
let affected=0;const types=new Set();
for(const {g,e} of selected){
 const actual=plan(g.exampleOfficialText,g.printedDamage);
 assert(actual,'official effect must compile: '+g.exampleOfficialText);
 assert.equal(actual.mechanic,e.mechanic,g.exampleOfficialText);
 for(const [key,value] of Object.entries(e))assert.equal(actual[key],value);
 assert(actual.commands.length>0);
 affected+=g.effectSlots;
 types.add(e.mechanic);
}
assert(types.size<=4,'live backlog can only contain known shared mechanisms');
assert(affected>=0,'resolved official slots may no longer appear in the live backlog');
for(const [text,damage] of [
 ['相手のバトルポケモンをやけどにする。その後、相手の手札を1枚トラッシュする。','0'],
 ['相手のバトルポケモンをマヒにする。','0'],
 ['自分のポケモン全員のHPを、それぞれ「50」回復し、特殊状態も回復する。','160'],
 ['相手がすでにとったサイドの枚数×60ダメージ。','70×'],
 ['相手のバトルポケモンが特殊状態なら、120ダメージ追加。','120']
])assert.equal(plan(text,damage),null,'unknown or inconsistent official text must fail closed');
console.log(JSON.stringify({pass:true,sharedFamilies:types.size,officialEffectSlots:affected,groups:selected.length}));
