'use strict';
// Codex handoff: deterministic, evidence-preserving issue groups.
// Never mutate the formal DB, reference catalog or approved engine contracts.
const fs = require('node:fs');
const path = require('node:path');
const { report } = require('./report-reference-effect-coverage.cjs');
const out = process.argv[2] || 'reports/reference-effect-failure-causes.json';
const issues = [];
for (const group of report.unresolvedPatterns) {
  const examples = [...group.examples].sort((a, b) => String(a.officialCardId).localeCompare(String(b.officialCardId)));
  const key = JSON.stringify([group.kind, group.text, group.damage]);
  issues.push({
    causeId: 'UNRECOGNIZED_OFFICIAL_EFFECT_PATTERN',
    fingerprint: key,
    status: 'BLOCKED',
    occurrences: group.occurrences,
    affectedPrints: examples,
    officialText: group.text,
    damage: group.damage,
    requiredWork: ['VERIFY_OFFICIAL_EVIDENCE', 'CLASSIFY_COMMON_EFFECT_COMMANDS', 'IMPLEMENT_SHARED_MECHANIC', 'RUN_ALL_AFFECTED_PRINT_REGRESSIONS'],
    safety: 'NO_GUESSED_EFFECTS_NO_FORMAL_DB_MUTATION'
  });
}
issues.sort((a, b) => b.occurrences - a.occurrences || a.fingerprint.localeCompare(b.fingerprint));
const handoff = {
  schemaVersion: 1,
  purpose: 'CODEX_SHARED_EFFECT_CAUSE_HANDOFF',
  source: 'data/reference-effects/plans.json',
  scope: report.scope,
  adoptedDeckPrints: report.adoptedDeckPrints,
  referencePrints: report.referencePrints,
  totalEffects: report.totalEffects,
  recognizedEffects: report.recognized,
  executionVerifiedByInventory: report.executionVerified,
  unresolvedEffects: report.blocked,
  safetyStopRequired: issues.length > 0,
  issues,
  nextAction: issues.length ? 'FIX_SHARED_CAUSES_AND_RETEST_ALL_AFFECTED_PRINTS' : 'NO_TEXT_PATTERN_BLOCKERS_CHECK_RUNTIME_AND_COMMAND_COVERAGE',
  limits: ['RECOGNITION_IS_NOT_EXECUTION_VERIFICATION', 'DO_NOT_MODIFY_FORMAL_1945_DB', 'DO_NOT_CHANGE_APPROVED_AI_RULE_EFFECT_CONTRACTS']
};
if (issues.reduce((n, x) => n + x.occurrences, 0) !== report.blocked) throw Error('CAUSE_GROUP_ACCOUNTING_MISMATCH');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(handoff, null, 2) + '\n');
console.log('REFERENCE_EFFECT_CAUSE_HANDOFF:', JSON.stringify({issues:issues.length,blocked:report.blocked,output:out}));
module.exports = { handoff };
