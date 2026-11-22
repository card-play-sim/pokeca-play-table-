'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const raw=fs.readFileSync('data/official-image-registry.json');
const registry=JSON.parse(raw),formal=read('data/reference-effects/catalog.json'),classification=read('data/deck-building/catalog.json'),m7ImageExtension=read('data/deck-building/m7-official-image-extension.json');
assert.equal(registry.cards.length,23525);
assert.equal(classification.records.length,5073,'Original 4995 + 78 M7 official print cards');
const newlyImported=classification.records.slice(4995);
assert.equal(newlyImported.length,78);
assert(newlyImported.every(r=>r.pack==='M7'&&r.regulationMark==='J'&&r.markEvidence.mark==='J'));
const importedIds=new Set(newlyImported.map(r=>r.officialCardId));
assert.equal(importedIds.size,78);
assert.equal(m7ImageExtension.cards.length,78,'Expected all M7 images in immutable sidecar');
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'59f39c87e13eecf6d92ad92711a3bd3786b588bb07fd5421fde41f0c986ed9ab');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('ui/deck-code-import.js','utf8'),ctx);vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),ctx);
const api=ctx.window.PokecaDeckCodeImport,saved=ctx.window.PokecaSavedDecks;
const cards=api.catalogFrom(registry,formal,classification,m7ImageExtension);
assert.equal(cards.size,classification.records.length,'Every classified official print remains searchable');
const ids=new Set();const counts={};
for(const r of classification.records){
 assert(!ids.has(r.officialCardId));ids.add(r.officialCardId);
 assert(['pokemon','goods','support','tool','stadium','energy'].includes(r.category));
 assert(/^[a-f0-9]{64}$/.test(r.source.sha256));
 if(r.legality==='printed-hij'){
  assert(['H','I','J'].includes(r.regulationMark));
  counts[r.regulationMark]=(counts[r.regulationMark]||0)+1;
 }else{assert.equal(r.basicEnergy,true);assert.equal(r.source.heading,'基本エネルギー');}
}
assert.equal(counts.H+counts.I+counts.J+classification.blocked.filter(x=>!ids.has(x.officialCardId)).length,4435);
assert.equal(classification.blocked.length,0,'Resolve official heading/identity failures before release');
const proof=classification.records.find(r=>r.regulationMark==='H');
const reject=mutation=>assert(!api.catalogFrom(registry,formal,{records:[{...proof,...mutation}]}).has(proof.officialCardId));
reject({regulationMark:'G'});reject({source:{...proof.source,identityName:'別のカード'}});reject({source:{...proof.source,identityImageUrl:'https://example.test/a.jpg'}});reject({category:'trainer'});reject({markEvidence:{}});
assert.equal([...cards.values()].filter(x=>x.pack==='M7'&&x.regulationMark==='J').length,78,
 'M7 J images must all be searchable');
for(const r of newlyImported){
 const card=cards.get(r.officialCardId);
 assert(card,'M7 print not visible in deck editor: '+r.officialCardId);
 assert.equal(card.url,r.source.identityImageUrl);
 assert.equal(card.pokemonStage,r.pokemonStage);
}
assert.equal(api.catalogFrom(registry,formal).size,0,'Absent evidence must fail closed');
assert.equal(cards.archive.size,23525+m7ImageExtension.cards.length,'Existing 23525 images preserved and M7 sidecar visible');
const plans=saved.plansFrom(read('data/reference-effects/plans.json'),read('data/effect-extensions/compiled.json'));
assert(plans.size>=566);
assert([...cards.keys()].filter(id=>plans.has(id)).length>=535);
assert.equal(saved.matchEntries({cards:{'45796':4,'49465':56}},cards,plans).reduce((n,r)=>n+r.count,0),60);
const basic=[...cards.values()].find(c=>c.basicEnergy);assert(basic);
const m7Unconnected=[...cards.values()].find(c=>c.pack==='M7'&&!plans.has(c.id));
if(m7Unconnected)assert.throws(()=>saved.matchEntries({cards:{[m7Unconnected.id]:4,[basic.id]:56}},cards,plans),/BLOCKED.*\[ID [0-9]+\]/,'Unconnected M7 print must remain fail-closed for battle');
assert.equal(saved.compositionError({cards:{[basic.id]:60}},cards,plans),'');assert.match(saved.compositionError({cards:{[basic.id]:61}},cards,plans),/60枚/);
const ace=[...cards.values()].filter(c=>c.aceSpec);assert(ace.length>1);assert.match(saved.compositionError({cards:{[ace[0].id]:1,[ace[1].id]:1}},cards,plans),/ACE SPEC/);
const groups=new Map();for(const c of cards.values())if(!c.basicEnergy){const a=groups.get(c.name)||[];a.push(c);groups.set(c.name,a);}
const prints=[...groups.values()].find(a=>a.length>1&&!a[0].aceSpec);assert.match(saved.compositionError({cards:{[prints[0].id]:3,[prints[1].id]:2}},cards,plans),/同名4枚/);
const unsupported=[...cards.values()].find(c=>!plans.has(c.id)&&!c.basicEnergy);assert.throws(()=>saved.matchEntries({cards:{[unsupported.id]:4,[basic.id]:56}},cards,plans),/BLOCKED/);
// BLOCKED must identify whether a print lacks a plan or conflicts with verified identity.
const noPlan=[...cards.values()].find(c=>!plans.has(c.id)&&!c.basicEnergy);
assert(noPlan);
assert.throws(()=>saved.matchEntries({cards:{[noPlan.id]:4,'49465':56}},cards,plans),/公式効果計画なし.*\[ID [0-9]+\]/);
const mismatchCards=new Map(cards);
mismatchCards.set('45152',{...cards.get('45152'),url:'https://example.invalid/changed.jpg'});
assert.throws(()=>saved.matchEntries({cards:{'45152':4,'49463':56}},mismatchCards,plans),/印刷版の公式照合不一致.*\[ID 45152\]/);
const legal={cards:{'45152':4,'49463':56}};assert.equal(saved.matchEntries(legal,cards,plans).reduce((n,r)=>n+r.count,0),60);
console.log(JSON.stringify({result:'PASS',searchable:cards.size,marks:counts,aceSpecPrints:ace.length,battleSupported:[...cards.keys()].filter(id=>plans.has(id)).length}));
