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
    ['incorrect scope', d => { d.scope = 'ADOPTED'; }]
  ];
  for (const [label, mutate] of cases) {
    const value = structuredClone(source);
    mutate(value);
    const result = run(value);
    assert.notEqual(result.status, 0, label + ' must fail closed');
    assert.match(result.stderr, /REFERENCE_EFFECT_GATE/, label + ' must explain rejection');
  }
  console.log('PROVENANCE_NEGATIVE_TESTS PASS:', cases.length, 'fail-closed cases');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
