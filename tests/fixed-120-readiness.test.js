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
