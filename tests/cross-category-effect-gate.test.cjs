'use strict';
// Cross-category gate: fail on missing deck categories or untraceable validation references.
// This does NOT approve any official printing or assert that all effects are executable.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const decks = JSON.parse(fs.readFileSync('data/fixed-test-decks.json', 'utf8'));
assert.equal(decks.decks.length, 2, 'fixed test deck count changed');
const categories = ['pokemon', 'item', 'supporter', 'stadium', 'tool', 'energy'];
const totals = new Map(categories.map(category => [category, 0]));
const names = new Set();
for (const deck of decks.decks) {
  let total = 0;
  for (const card of deck.cards) {
    assert(categories.includes(card.category), 'unknown category: ' + card.category);
    assert(Number.isInteger(card.count) && card.count > 0, 'invalid count: ' + card.name);
    assert.equal(card.identityStatus, 'UNCONFIRMED', 'do not silently adopt printing: ' + card.name);
    assert.equal(card.officialCardId, null, 'unapproved printing: ' + card.name);
    total += card.count;
    totals.set(card.category, totals.get(card.category) + card.count);
    names.add(card.name);
  }
  assert.equal(total, 60, 'each fixed deck must have 60 physical cards');
  assert.equal(deck.total, total, 'declared deck total differs');
}
assert.equal([...totals.values()].reduce((a, b) => a + b, 0), 120);
assert.equal(names.size, 45, 'fixed 45-name coverage changed');
for (const [category, count] of totals) assert(count > 0, 'missing category: ' + category);

const context = {window: {}, console, performance, setTimeout, Math};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js', 'utf8'), context);
const catalog = context.window.Pokeca.getReferenceEffectCatalog();
assert.equal(catalog.adoptedDeckPrints, 0, 'validation references must not become official adopted prints');
const refs = catalog.defaultValidationReferences;
for (const name of names) {
  assert(Object.prototype.hasOwnProperty.call(refs, name), 'no default reference for ' + name);
  const id = refs[name];
  assert(catalog.records.some(r => r.deckName === name && String(r.officialCardId) === String(id)),
    'default reference is not traceable to print-specific record: ' + name);
}
console.log(JSON.stringify({
  status: 'PASS',
  scope: 'all fixed-deck categories and print-specific reference traceability',
  cards: 120,
  names: names.size,
  categories: Object.fromEntries(totals),
  officialPrintsAdopted: 0,
  note: 'This gate does not prove full effect execution or Android deployment'
}));
