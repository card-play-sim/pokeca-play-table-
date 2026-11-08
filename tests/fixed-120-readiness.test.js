'use strict';
// Run with: node tests/fixed-120-readiness.test.js
// Safety gate: never treat image coverage or name-matched prints as verified gameplay data.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
assert.equal(manifest.decks.length,2);
for(const deck of manifest.decks){
  assert.equal(deck.total,60);
  assert.equal(deck.cards.reduce((n,c)=>n+c.count,0),60);
  assert.ok(deck.cards.every(c=>Number.isInteger(c.count)&&c.count>0));
}
const unique=new Set(manifest.decks.flatMap(d=>d.cards.map(c=>c.name)));
assert.equal(unique.size,45);
const sandbox={};sandbox.window=sandbox;
vm.runInNewContext(fs.readFileSync('ui/fixed-120-match-adapter.js','utf8'),sandbox);
const adapter=sandbox.PokecaFixed120;
assert.equal(typeof adapter.createMatch,'function');
let called=false;
const engine={createMatchFromVerifiedDecks(){called=true;throw Error('must not run');}};
assert.throws(()=>adapter.createMatch(manifest,{},engine),/公式カード未接続/);
assert.equal(called,false);
const unconfirmed=manifest.decks.flatMap(d=>d.cards).filter(c=>c.officialCardId==null||c.identityStatus!=='CONFIRMED');
console.log(JSON.stringify({physicalCards:120,uniqueNames:45,unconfirmedEntries:unconfirmed.length,engineLaunch:'BLOCKED_BY_VERIFICATION',adapterGuard:'PASS'},null,2));

 // Synthetic fixture verifies 120 physical instances cross the adapter boundary.
 // Fixture identifiers are NOT real official IDs and must never be published as card data.
const fakeRecords={};
let serial=0;
for(const card of manifest.decks.flatMap(d=>d.cards)){
  if(fakeRecords[card.name])continue;
  const isPokemon=card.category==='pokemon';
  const kind=isPokemon?'pokemon':card.category==='energy'?'energy':card.category==='tool'?'tool':card.category==='stadium'?'stadium':'trainer';
  fakeRecords[card.name]={
    name:card.name,kind,verified:true,officialCardId:'SYNTHETIC_TEST_'+(++serial),
    sourceEvidence:'TEST_ONLY_NOT_OFFICIAL',effectStatus:'verified',engineReadable:true,
    ...(isPokemon?{hp:100,basic:true,attacks:[]}:{}),
  };
}
let received;
const capture={createMatchFromVerifiedDecks(payload){received=payload;return {ok:true,fixtureOnly:true};}};
const fixtureResult=adapter.createMatch(manifest,fakeRecords,capture);
assert.equal(fixtureResult.fixtureOnly,true);
assert.equal(received.you.length,60);
assert.equal(received.ai.length,60);
assert.equal(new Set([...received.you,...received.ai].map(c=>c.id)).size,120);
assert.equal(received.maxOpeningAttempts,100);
assert.equal(received.autoBenchBasics,true);
console.log('Synthetic adapter expansion: PASS (not an official-card or playable-match validation)');

const browser={};browser.window=browser;
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),browser);
assert.equal(typeof browser.Pokeca.createMatchFromVerifiedDecks,'function');
let seed=123456789;
const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const match=adapter.createMatch(manifest,fakeRecords,browser.Pokeca,{rng});
assert.equal(match.ok,true);
assert.equal(match.game.players.length,2);
for(const player of match.game.players){
  assert.ok(player.active&&player.active.kind==='pokemon');
  assert.ok(Array.isArray(player.prizeCards)&&player.prizeCards.length===6);
  assert.ok(Array.isArray(player.hand));
  assert.equal(player.deck.length+player.hand.length+player.prizeCards.length+player.bench.length+1,60);
}
console.log('Real bundled engine initial match: PASS (synthetic cards only; gameplay effects not certified)');
