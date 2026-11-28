'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const {compile}=require('../engine/reference-effect-plans.cjs');
const {parse}=require('../scripts/parse-official-pokemon-energy.cjs');
const text='相手のバトルポケモンにダメカンがのっているなら、このワザのダメージは「30」になる。';
const plan=(t,d)=>compile({records:[{officialCardId:'47779',name:'REGRESSION',category:'pokemon',facts:{basic:true},attacks:[{name:'ATTACK',text:t,damage:d,cost:['無色']}],abilities:[]}]}).records[0].attacks[0].plan;
for(const id of ['47779','48437']){
 const proof=JSON.parse(fs.readFileSync('data/effect-extensions/evidence/'+id+'.json','utf8'));
 assert.equal(proof.url,'https://www.pokemon-card.com/card-search/details.php/card/'+id);
 assert.equal(crypto.createHash('sha256').update(proof.html).digest('hex'),proof.htmlSha256);
 assert(proof.html.includes('<meta property="og:url" content="'+proof.url+'"'));
 const row=parse(proof.html),a=row.attacks.find(x=>x.name==='ビッグバイト');
 assert.equal(a.text,text);assert.equal(a.damage,'260');
 const p=plan(a.text,a.damage);
 assert.equal(p.mechanic,'CONDITIONAL_ATTACK_BONUS');assert.equal(p.predicate,'opponentDamaged');
 assert.equal(p.base,260);assert.equal(p.bonus,-230);assert.equal(p.base+p.bonus,30);
}
assert.equal(plan(text,'260+'),null);
assert.equal(plan(text,'30×'),null);
assert.equal(plan(text+'自分の山札を1枚引く。','260'),null);
assert.equal(plan(text.replace('相手のバトルポケモン','自分のポケモン'),'260'),null);
assert.equal(plan(text.replace('「30」','「70」'),'260').bonus,-190);
console.log('CONDITIONAL_DAMAGE_REPLACEMENT: exact official source, two prints, positive/negative grammar PASS');
