'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/reference-effects/plans.json'), 'utf8'));
const gate = fs.readFileSync(path.join(root, 'scripts/validate-reference-effect-provenance.cjs'), 'utf8');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeca-provenance-'));
try {
  fs.mkdirSync(path.join(temp, 'scripts'));
  fs.mkdirSync(path.join(temp, 'data/reference-effects'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'scripts/validate-reference-effect-provenance.cjs'), gate);
  for (const record of source.records) {
    if (record.source?.kind !== 'saved-official-html') continue;
    const from = path.resolve(root, record.source.path);
    const to = path.resolve(temp, record.source.path);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  const run = (value) => {
    fs.writeFileSync(path.join(temp, 'data/reference-effects/plans.json'), JSON.stringify(value));
    return spawnSync(process.execPath, [path.join(temp, 'scripts/validate-reference-effect-provenance.cjs')], { encoding: 'utf8' });
  };
  assert.equal(run(source).status, 0, 'unaltered reference data must pass');
  const cases = [
    ['adoption count', d => { d.adoptedDeckPrints = 1; }],
    ['adopted print flag', d => { d.records[0].deckPrintAdopted = true; }],
    ['duplicate official ID', d => { d.records[1].officialCardId = d.records[0].officialCardId; }],
    ['invalid official URL', d => { d.records[0].officialPageUrl = 'https://example.com'; }],
    ['missing provenance', d => { delete d.records[0].source.sha256; }],
    ['missing reference', d => { d.defaultValidationReferences['メガガルーラex'] = '999999999'; }],
    ['incorrect scope', d => { d.scope = 'ADOPTED'; }],
    ['unknown evidence type', d => { d.records[0].source.kind = 'untrusted'; }],
    ['malformed provenance digest', d => { d.records[0].source.sha256 = 'not-a-sha256'; }],
    ['unsafe evidence path', d => { d.records[0].source.path = '../outside.json'; }],
    ['incorrect reference name', d => { d.defaultValidationReferences['メガガルーラex'] = d.defaultValidationReferences['ファイアローex']; }],
    ['invalid saved HTML digest', d => { const r = d.records.find(x => x.source.kind === 'saved-official-html'); r.source.htmlSha256 = '0'.repeat(64); }],
    ['missing saved HTML digest', d => { const r = d.records.find(x => x.source.kind === 'saved-official-html'); delete r.source.htmlSha256; }]
  ];
  for (const [label, mutate] of cases) {
    const value = structuredClone(source);
    mutate(value);
    const result = run(value);
    assert.notEqual(result.status, 0, label + ' must fail closed');
    assert.match(result.stderr, /REFERENCE_EFFECT_GATE/, label + ' must explain rejection');
  }
  const htmlRecord = source.records.find(r => r.source?.kind === 'saved-official-html');
  assert.ok(htmlRecord, 'saved official HTML fixture required');
  const evidenceFile = path.resolve(temp, htmlRecord.source.path);
  const originalEvidence = fs.readFileSync(evidenceFile, 'utf8');
  try {
    const corrupted = JSON.parse(originalEvidence);
    corrupted.html += 'tampered';
    fs.writeFileSync(evidenceFile, JSON.stringify(corrupted));
    const result = run(source);
    assert.notEqual(result.status, 0, 'tampered HTML must fail closed');
    assert.match(result.stderr, /saved official HTML hash mismatch/);
  } finally {
    fs.writeFileSync(evidenceFile, originalEvidence);
  }
  try {
    const mismatched = JSON.parse(originalEvidence);
    mismatched.candidate.officialCardId = '999999';
    fs.writeFileSync(evidenceFile, JSON.stringify(mismatched));
    const result = run(source);
    assert.notEqual(result.status, 0, 'mismatched evidence ID must fail closed');
    assert.match(result.stderr, /saved evidence ID mismatch/);
  } finally {
    fs.writeFileSync(evidenceFile, originalEvidence);
  }
  try {
    const mismatched = JSON.parse(originalEvidence);
    mismatched.candidate.officialDetailsUrl = 'https://www.pokemon-card.com/card-search/details.php/card/999999';
    fs.writeFileSync(evidenceFile, JSON.stringify(mismatched));
    const result = run(source);
    assert.notEqual(result.status, 0, 'mismatched official details URL must fail closed');
    assert.match(result.stderr, /saved evidence official URL mismatch/);
  } finally {
    fs.writeFileSync(evidenceFile, originalEvidence);
  }
  const suffixVariant = structuredClone(source);
  const target = suffixVariant.records.find(r => r.officialCardId === '46662');
  if (target) {
    const original = target.officialPageUrl;
    target.officialPageUrl = original.endsWith('/regu/XY') ? original.replace(/\/regu\/XY$/, '') : original + '/regu/XY';
    assert.equal(run(suffixVariant).status, 0, 'official regulation URL suffix must not change identity');
  }
  fs.rmSync(evidenceFile);
  const missing = run(source);
  assert.notEqual(missing.status, 0, 'missing saved evidence must fail closed');
  assert.match(missing.stderr, /missing saved official evidence/);
  fs.writeFileSync(evidenceFile, originalEvidence);
  console.log('PROVENANCE_NEGATIVE_TESTS PASS:', cases.length + 4, 'fail-closed cases');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
