'use strict';
// Read-only gate for reference effects. Never treats reference IDs as adopted prints.
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../data/reference-effects/plans.json');
const fail = message => { throw new Error('REFERENCE_EFFECT_GATE: ' + message); };
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (data.scope !== 'PRINT_SPECIFIC_EFFECT_REFERENCES_NOT_DECK_ADOPTION') fail('scope changed');
if (data.adoptedDeckPrints !== 0) fail('reference dataset must not declare adopted deck prints');
if (!data.defaultValidationReferences || typeof data.defaultValidationReferences !== 'object') fail('missing validation references');
if (!Array.isArray(data.records) || !data.records.length) fail('missing reference records');
const byId = new Map();
for (const [index, record] of data.records.entries()) {
  const id = String(record.officialCardId || '');
  if (!/^\d+$/.test(id)) fail('invalid officialCardId at ' + index);
  if (byId.has(id)) fail('duplicate officialCardId ' + id);
  if (record.deckPrintAdopted !== false) fail('reference marked as adopted ' + id);
  if (!record.officialPageUrl || !record.officialPageUrl.startsWith('https://www.pokemon-card.com/')) fail('missing official URL ' + id);
  if (!record.source || !record.source.path || !record.source.sha256 || !record.source.recordSha256) fail('missing provenance ' + id);
  byId.set(id, record);
}
for (const [name, id] of Object.entries(data.defaultValidationReferences)) {
  const record = byId.get(String(id));
  if (!record) fail('unresolved reference ' + name + ':' + id);
  if (record.deckName !== name && record.name !== name) fail('name mismatch ' + name + ':' + id);
}
console.log('REFERENCE_EFFECT_GATE PASS:', byId.size, 'reference prints; adopted prints: 0');
