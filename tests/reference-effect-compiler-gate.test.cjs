'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../engine/reference-effect-plans.cjs');
const catalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/reference-effects/plans.json'), 'utf8'));
const snapshot = JSON.stringify(catalog);
const output = compile(catalog);
assert.equal(JSON.stringify(catalog), snapshot, 'compiler must not mutate evidence');
assert.equal(output.records.length, catalog.records.length, 'all print records must be retained');
assert.equal(output.adoptedDeckPrints, 0, 'compiler must never adopt reference prints');
assert.equal(output.scope, catalog.scope, 'compiler must preserve reference-only scope');
const known = new Set(output.records.map(r => String(r.officialCardId)));
for (let i = 0; i < catalog.records.length; i++) {
  const input = catalog.records[i], result = output.records[i];
  assert.equal(result.officialCardId, input.officialCardId);
  assert.equal(result.deckPrintAdopted, false);
  assert.deepEqual(result.source, input.source, 'provenance must remain unchanged');
  assert.equal(result.attacks.length, input.attacks.length);
  assert.equal(result.abilities.length, input.abilities.length);
  for (const [kind, effects] of [['attack', result.attacks], ['ability', result.abilities]]) {
    effects.forEach((effect, index) => {
      assert.equal(effect.effectId, `reference-${input.officialCardId}-${kind}-${index}`);
      if (effect.plan !== null) {
        assert.ok(Array.isArray(effect.plan.commands) && effect.plan.commands.length, 'recognized effect needs commands');
        assert.ok(effect.plan.commands.every(c => typeof c === 'string' && c.length), 'invalid effect command');
      }
    });
  }
  if (result.mainPlan !== null) assert.ok(result.mainPlan.commands?.length, 'recognized main effect needs commands');
}
for (const id of Object.values(output.defaultValidationReferences)) assert.ok(known.has(String(id)), 'missing validation print ' + id);
const count = output.records.reduce((n, r) => n + r.attacks.filter(a => a.plan).length + r.abilities.filter(a => a.plan).length + Number(Boolean(r.mainPlan)), 0);
console.log('REFERENCE_EFFECT_COMPILER_GATE PASS:', output.records.length, 'prints;', count, 'recognized effect plans; unknown effects retained as null');
