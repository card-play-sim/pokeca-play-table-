import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import rules from '../ui/official-image-validation.js';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const decks=read('data/fixed-test-decks.json').decks;
const registry=read('data/official-image-registry.json').cards;
assert.equal(decks.length,2,'Expected exactly two fixed decks');
for(const deck of decks)assert.equal(deck.cards.reduce((s,c)=>s+c.count,0),60,deck.name+' must be 60 cards');
const names=new Set(decks.flatMap(d=>d.cards.map(c=>c.name)));
const ids=new Set(), byName=new Map();
for(const c of registry){
  rules.validate(c);
  const id=String(c.officialCardId);
  assert.match(id,/^\d+$/,'Invalid official card ID');
  assert(!ids.has(id),'Duplicate official ID '+id);
  ids.add(id);
  assert.equal(typeof c.name,'string');
  assert.match(c.imageSourceUrl,/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\//,'Invalid official image host/path');
  byName.set(c.name,(byName.get(c.name)||0)+1);
}
const uncovered=[...names].filter(n=>!byName.has(n));
const result={fixedDecks:decks.length,copies:120,uniqueNames:names.size,registeredPrints:registry.length,coveredNames:names.size-uncovered.length,uncoveredNames:uncovered};
console.log(JSON.stringify(result,null,2));
console.log('PASS: static image registry schema and fixed deck counts');
console.log('NOTE: HTTP reachability, actual browser image loading, and adopted print identities are NOT tested.');
