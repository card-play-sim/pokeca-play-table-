'use strict';
// Read-only gate for reference effects. Never treats reference IDs as adopted prints.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
  if (!record.source || !record.source.path || !record.source.sha256 || !(record.source.recordSha256 || record.source.htmlSha256)) fail('missing provenance ' + id);
  if (!['formal1945-readonly', 'saved-official-html'].includes(record.source.kind)) fail('unsupported provenance kind ' + id);
  const digests = record.source.kind === 'saved-official-html'
    ? [record.source.sha256, record.source.htmlSha256]
    : [record.source.sha256, record.source.recordSha256];
  if (!digests.every(digest => typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest))) fail('invalid provenance digest ' + id);
  if (path.isAbsolute(record.source.path) || record.source.path.split(/[\\/]+/).includes('..')) fail('unsafe evidence path ' + id);
  if (record.source.kind === 'saved-official-html') {
    const evidencePath = path.resolve(__dirname, '..', record.source.path);
    const repoRoot = path.resolve(__dirname, '..') + path.sep;
    if (!evidencePath.startsWith(repoRoot)) fail('evidence path escapes repository ' + id);
    if (!fs.existsSync(evidencePath)) fail('missing saved official evidence ' + id);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (String(evidence.candidate?.officialCardId) !== id) fail('saved evidence ID mismatch ' + id);
    if (evidence.candidate?.name !== record.name) fail('saved evidence name mismatch ' + id);
    const canonicalOfficialUrl = url => typeof url === 'string' ? url.replace(/\/regu\/[A-Za-z0-9_-]+\/?$/, '') : '';
    if (canonicalOfficialUrl(evidence.candidate?.officialDetailsUrl) !== canonicalOfficialUrl(record.officialPageUrl)) fail('saved evidence official URL mismatch ' + id);
    if (record.imageSourceUrl && evidence.candidate?.imageSourceUrl !== record.imageSourceUrl) fail('saved evidence image URL mismatch ' + id);
    if (typeof evidence.html !== 'string' || !evidence.html) fail('missing saved official HTML ' + id);
    const hash = crypto.createHash('sha256').update(evidence.html, 'utf8').digest('hex');
    if (hash !== record.source.htmlSha256) fail('saved official HTML hash mismatch ' + id);
  }
  byId.set(id, record);
}
for (const [name, id] of Object.entries(data.defaultValidationReferences)) {
  const record = byId.get(String(id));
  if (!record) fail('unresolved reference ' + name + ':' + id);
  if (record.deckName !== name && record.name !== name) fail('name mismatch ' + name + ':' + id);
}
console.log('REFERENCE_EFFECT_GATE PASS:', byId.size, 'reference prints; adopted prints: 0');
