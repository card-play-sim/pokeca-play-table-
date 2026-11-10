'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../scripts/report-reference-effect-coverage.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pokeca-coverage-'));
try {
  const destination = path.join(temp, 'report.json');
  const result = spawnSync(process.execPath, [script, destination], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(destination, 'utf8'));
  assert.equal(report.scope, 'PRINT_SPECIFIC_EFFECT_REFERENCES_NOT_DECK_ADOPTION');
  assert.equal(report.adoptedDeckPrints, 0);
  assert.equal(report.referencePrints, 89);
  assert.equal(report.totalEffects, report.recognized + report.blocked);
  assert.equal(report.blocked, report.unresolved.length);
  assert.equal(report.blocked, report.unresolvedPatterns.reduce((n, p) => n + p.occurrences, 0));
  assert.equal(report.totalEffects, Object.values(report.categories).reduce((n, c) => n + c.effects, 0));
  for (const group of report.unresolvedPatterns) {
    assert.equal(group.occurrences, group.examples.length);
    assert.ok(group.examples.every(x => x.officialCardId && x.name && x.category));
  }
  for (const category of ['pokemon', 'item', 'tool', 'supporter', 'stadium', 'energy']) {
    assert.ok(report.categories[category].prints > 0, 'missing category ' + category);
    const c = report.categories[category];
    assert.equal(c.effects, c.recognized + c.blocked);
  }
  console.log('REFERENCE_EFFECT_COVERAGE_GATE PASS:', report.referencePrints, 'prints;', report.totalEffects, 'effects;', report.unresolvedPatterns.length, 'unresolved patterns');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
