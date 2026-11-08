'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};
for(const p of ['official-image-validation.js','card-image-resolver.js'])vm.runInNewContext(fs.readFileSync('ui/'+p,'utf8'),context);
const r=context.window.PokecaImageResolver,registry=JSON.parse(fs.readFileSync('data/official-image-registry.json'));
r.register(Object.fromEntries(registry.cards.map(c=>[c.officialCardId,c])));
const data=JSON.parse(fs.readFileSync('data/fixed-deck-preview-bindings.json'));
const deck=JSON.parse(fs.readFileSync('data/fixed-test-decks.json')),before=JSON.stringify(deck);
assert.equal(r.registerPreviews(data),45);
for(const c of deck.decks.flatMap(d=>d.cards)){
 const result=r.resolveDisplay(c);assert.equal(result.mode,'provisional-preview',c.name);assert(result.url);assert.equal(result.adopted,false);
 assert.equal(r.resolve(c),'');assert.equal(r.resolvePreview({...c,officialCardId:'99999999'}),'');
 assert.equal(r.resolvePreview({...c,set:'CONFLICT'}),'');assert.equal(r.resolvePreview({...c,cardNumber:'WRONG'}),'');
 assert.equal(r.resolvePreview({...c,imageSourceUrl:'https://invalid.test/x.jpg'}),'');
}
for(const b of data.bindings.filter(b=>!b.nameAlias&&!b.numberlessEnergy)){
 const print={...b.preview,identityStatus:'CONFIRMED'};
 assert.equal(r.resolveDisplay(print).mode,'verified-print');assert.equal(r.resolveDisplay(print).adopted,true);
 assert.equal(r.resolvePreview({...print,cardNumber:'WRONG'}),'');
 assert.equal(r.resolvePreview({...print,name:'別カード'}),'');
}
const fire=data.bindings.find(b=>b.deckName==='基本炎エネルギー');
assert.equal(fire.preview.cardNumber,null);assert(!registry.cards.some(c=>c.officialCardId===fire.preview.officialCardId));
assert.equal(r.resolve({...fire.preview,cardNumber:undefined}),'','numberless evidence must never be promoted into strict registry');
assert.equal(r.resolvePreview({name:'基本炎エネルギー',set:'OTHER'}),'');
assert.equal(r.resolvePreview({name:'基本炎エネルギー',evolutionCards:[{name:'別カード',officialCardId:'99999'}]}),'');
assert.equal(r.resolveDisplay({name:'たけしのスカウト'}).officialName,'タケシのスカウト');
assert.equal(r.resolveDisplay({name:'ロケット団のエネルギー'}).officialName,'ロケット団エネルギー');
assert.equal(JSON.stringify(deck),before,'no mutation of original deck identities');
const corrupt=structuredClone(data);corrupt.bindings[0].adoptedOfficialCardId='1';assert.throws(()=>r.registerPreviews(corrupt),/PREVIEW_IDENTITY/);
corrupt.bindings[0].adoptedOfficialCardId=null;corrupt.bindings[0].preview.name='別カード';assert.throws(()=>r.registerPreviews(corrupt),/PREVIEW_NAME/);
assert.equal(r.resolvePreview({name:data.bindings[0].deckName}),data.bindings[0].preview.imageSourceUrl,'failed import is atomic');
const wrongAlias=structuredClone(data);wrongAlias.bindings.find(b=>b.nameAlias).preview.imageSourceUrl=data.bindings[0].preview.imageSourceUrl;assert.throws(()=>r.registerPreviews(wrongAlias),/PREVIEW_IMAGE_ID/);
const duplicate=structuredClone(data);duplicate.bindings.push(duplicate.bindings[0]);assert.throws(()=>r.registerPreviews(duplicate),/PREVIEW_IDENTITY/);
console.log('PASS fixed preview: 120 copies, strict ID conflicts, aliases, numberless energy isolation, no adoption, atomic validation');
