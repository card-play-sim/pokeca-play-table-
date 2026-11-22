'use strict';
const assert = require('node:assert/strict');
const deck = require('../data/deck-building/catalog.json');
const extension = require('../data/effect-extensions/compiled.json');
const checkpoint = require('../reports/official-effect-continuation/candidate.json');
const printable = new Map(deck.records.map(r => [String(r.officialCardId),r]));
const connected = new Map(extension.records.map(r => [String(r.officialCardId),r]));
const ids = checkpoint.qualified.map(String);
assert(ids.length > 0, 'Candidate batch must contain verified scoped prints');
assert.equal(new Set(ids).size, ids.length, 'Duplicate candidate official print IDs');
const withheld = new Set(checkpoint.blockers.map(row => String(row.id)));
assert.equal(withheld.size, checkpoint.blockers.length, 'Duplicate withheld official print IDs');
for (const row of checkpoint.blockers) assert.equal(row.reason, 'UNVERIFIED_HIJ_SCOPE', 'Unreviewed blocker reason must remain explicit');
for (const id of checkpoint.qualified.map(String)) {
  assert(!withheld.has(id), 'Qualified print cannot also be withheld: '+id);
  const print = printable.get(id);
  assert(print, 'Not in official searchable catalog: '+id);
  assert(['H','I','J'].includes(print.regulationMark), 'Regulation not verified: '+id);
  assert.equal(print.legality,'printed-hij');
  const plan = connected.get(id);
  assert(plan, 'No verified engine plan for print: '+id);
  assert.equal(plan.name, print.source.identityName, 'Official identity mismatch: '+id);
  assert(plan.source?.sha256, 'No verified official source: '+id);
}
console.log('PASS '+ids.length+' candidate official prints are H/I/J scoped and identity-exact; '+withheld.size+' unverified remain withheld');
