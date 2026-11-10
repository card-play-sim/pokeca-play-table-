'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../engine/reference-effect-plans.cjs');
const catalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/reference-effects/plans.json'), 'utf8'));
const compiled = compile(catalog);
const categories = {};
const unresolved = [];
const commands = {};
const unresolvedGroups = new Map();
let recognized = 0, total = 0;
// Text recognition is not proof of runtime execution or rule-engine integration.
const executionVerified = 0;
function scan(record, kind, index, effect, original) {
  total++;
  const category = record.category;
  const stats = categories[category] ||= { prints: 0, effects: 0, recognized: 0, blocked: 0 };
  stats.effects++;
  if (effect?.plan) {
    recognized++;
    stats.recognized++;
    for (const command of effect.plan.commands) commands[command] = (commands[command] || 0) + 1;
  } else {
    stats.blocked++;
    const text = original.text || '';
    const damage = original.damage || '';
    unresolved.push({ officialCardId: record.officialCardId, name: record.name, category, kind, index, text, damage });
    const signature = JSON.stringify([kind, String(text).replace(/\s+/g, ''), String(damage)]);
    const group = unresolvedGroups.get(signature) || { kind, text, damage, occurrences: 0, examples: [] };
    group.occurrences++;
    group.examples.push({ officialCardId: record.officialCardId, name: record.name, category });
    unresolvedGroups.set(signature, group);
  }
}
for (let i = 0; i < compiled.records.length; i++) {
  const record = compiled.records[i], original = catalog.records[i];
  (categories[record.category] ||= { prints: 0, effects: 0, recognized: 0, blocked: 0 }).prints++;
  record.attacks.forEach((effect, j) => scan(record, 'attack', j, effect, original.attacks[j]));
  record.abilities.forEach((effect, j) => scan(record, 'ability', j, effect, original.abilities[j]));
  if (record.category !== 'pokemon') scan(record, 'main', 0, { plan: record.mainPlan }, original);
}
const report = {
  schemaVersion: 1,
  scope: catalog.scope,
  adoptedDeckPrints: catalog.adoptedDeckPrints,
  referencePrints: catalog.records.length,
  totalEffects: total,
  recognized,
  executionVerified,
  executionUnverified: total - executionVerified,
  blocked: unresolved.length,
  categories,
  commands,
  integrationStatus: 'NOT_VERIFIED_BY_COVERAGE_INVENTORY',
  unresolvedPatterns: [...unresolvedGroups.values()].sort((a, b) => b.occurrences - a.occurrences || a.kind.localeCompare(b.kind)),
  unresolved
};
if (recognized + unresolved.length !== total) throw new Error('Effect coverage accounting mismatch');
if (executionVerified + report.executionUnverified !== total) throw new Error('Execution accounting mismatch');
const output = process.argv[2];
if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log('REFERENCE_EFFECT_COVERAGE:', JSON.stringify({ prints: report.referencePrints, total, recognized, blocked: report.blocked, categories }));
module.exports = { report };
