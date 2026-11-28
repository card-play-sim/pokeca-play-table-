'use strict';
const assert = require('node:assert/strict');
const deck = require('../data/deck-building/catalog.json');
const extension = require('../data/effect-extensions/compiled.json');
const checkpoint = require('../reports/official-effect-continuation/candidate.json');
const {verifiedBasicException} = require('../scripts/list-card-auto-connect-ids.cjs');
const printable = new Map(deck.records.map(r => [String(r.officialCardId),r]));
const connected = new Map(extension.records.map(r => [String(r.officialCardId),r]));
const ids = checkpoint.qualified.map(String);
assert(ids.length > 0, 'Candidate batch must contain verified scoped prints');
assert.equal(new Set(ids).size, ids.length, 'Duplicate candidate official print IDs');
const withheld = new Set(checkpoint.blockers.map(row => String(row.id)));
assert.equal(withheld.size, checkpoint.blockers.length, 'Duplicate withheld official print IDs');
const blockedReasons = new Set([
  'UNVERIFIED_HIJ_SCOPE', 'PRINT_IDENTITY_CONFLICT',
  'ENGINE_EXECUTION_FAILED', 'EXECUTION_EVIDENCE_INCOMPLETE',
  // Deferred exact-target prints remain withheld; all exclusion assertions below still apply.
  'DEFERRED_EXACT_TARGET_SCOPE'
]);
for (const row of checkpoint.blockers) {
  assert(blockedReasons.has(row.reason), 'Unknown blocker reason: '+row.reason);
  assert(!connected.has(String(row.id)), 'Withheld candidate must stay out of the release: '+row.id);
}
for (const id of checkpoint.qualified.map(String)) {
  assert(!withheld.has(id), 'Qualified print cannot also be withheld: '+id);
  const print = printable.get(id);
  assert(print, 'Not in official searchable catalog: '+id);
  // Current regulation prints and *officially catalogued basic Energy
  // reprints* are the only two release scopes. Any other historic printing
  // must remain blocked; matching a same-name print is never sufficient.
  const isHIJ = ['H','I','J'].includes(print.regulationMark) && print.legality === 'printed-hij';
  const isBasic = verifiedBasicException(print);
  assert(isHIJ || isBasic, 'Official regulation/exception not verified: '+id);
  const plan = connected.get(id);
  assert(plan, 'No verified engine plan for print: '+id);
  assert.equal(plan.name, print.source.identityName, 'Official identity mismatch: '+id);
  assert.equal(plan.imageSourceUrl, print.source.identityImageUrl,
    'Official print JPEG identity mismatch: '+id);
  assert.equal(plan.officialPageUrl,
    'https://www.pokemon-card.com/card-search/details.php/card/'+id,
    'Official page not the exact physical printing: '+id);
  assert(/^[a-f0-9]{64}$/.test(plan.source?.sha256 || ''),
    'No verified official page SHA: '+id);
  if (isBasic) {
    const type = print.source.identityName.match(/^基本([草炎水雷超闘悪鋼])エネルギー$/)?.[1];
    assert(type, 'Unrecognized basic Energy type: '+id);
    assert.equal(plan.category,'energy','Non-Energy must never inherit a basic Energy exemption: '+id);
    assert.equal(plan.mainPlan?.mechanic,'BASIC_ENERGY', 'Basic Energy effect not attached: '+id);
    assert.equal(plan.facts?.basicEnergyType,type,'Official basic Energy type mismatch: '+id);
    assert.equal(plan.text,'','A special Energy effect must not be silently treated as basic: '+id);
  }
}
console.log('PASS '+ids.length+' candidate H/I/J or official-basic-energy-exception printings have exact official ID/name/JPEG/SHA; '+withheld.size+' unverified withheld');
