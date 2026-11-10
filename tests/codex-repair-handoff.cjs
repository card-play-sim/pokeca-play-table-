'use strict';
// Convert machine-readable triage into a bounded Codex task description.
// This is a handoff artifact, not an agent invocation or automatic code edit.
const fs=require('node:fs');
const input=process.argv[2]||'test-results/effect-repair-triage.json';
const out='test-results/codex-repair-task.md';
const t=JSON.parse(fs.readFileSync(input,'utf8'));
if(t.schemaVersion!==1||t.kind!=='effect-repair-triage'||!Array.isArray(t.groups))
  throw Error('Invalid triage report');
const lines=[
'# Codex repair task: shared card effect system','',
'## Safety contract',
'- Diagnose common code paths first; do not patch one card as a substitute for fixing shared logic.',
'- Do not modify the approved 1945-card formal DB or invent missing official evidence.',
'- Keep unverified print identities and effects blocked (fail closed).',
'- Preserve existing saved matches and the existing published app; do not create a replacement app.',
'- Any changes require a reviewed PR and passing regression tests; no auto-merge or auto-deploy.',
'','## Diagnosis',
];
if(!t.groups.length)lines.push('No failing regression suites. Do not propose speculative fixes.');
for(const g of t.groups){
  lines.push('', '### '+g.category,'Owner: '+g.owner,'Affected suites: '+g.suiteIds.join(', '),
    'Next action: '+g.next,'Scope: '+g.scope.join(', '));
  for(const excerpt of g.excerpts||[])lines.push('','```text',excerpt.replace(/```/g,'[fence removed]'),'```');
}
const coverageFile='test-results/fixed-deck-effect-coverage.json';
if(fs.existsSync(coverageFile)){
 const coverage=JSON.parse(fs.readFileSync(coverageFile,'utf8'));
 if(coverage.schemaVersion!==1||coverage.kind!=='fixed-deck-effect-coverage'||
  !Array.isArray(coverage.sharedEffectGaps)||coverage.officialPrintsAdopted!==0)
  throw Error('Invalid reference effect coverage: fail closed');
 lines.push('','## Unconnected official-reference effects (not deck-print adoption)',
  'These gaps remain BLOCKED even when all runnable regression suites pass.',
  'Implement shared mechanics only after verifying official evidence and Rule Engine contracts.');
 for(const gap of coverage.sharedEffectGaps){
  if(gap.status!=='BLOCKED_UNCONNECTED'||!Array.isArray(gap.printIds)||!gap.printIds.length)
   throw Error('Invalid unresolved effect family');
  lines.push('','### '+gap.effectName,'Print references: '+gap.printIds.join(', '),
   'Shared effect text: '+String(gap.officialText||'').replace(/\\r?\\n/g,' '),
   'Next: confirm source evidence, implement one shared command family, add positive and negative tests.');
 }
}else lines.push('','Coverage inventory not present: effect completeness UNKNOWN; do not treat passing suites as complete.');
lines.push('','## Required verification',
'- node tests/cross-category-report.cjs',
'- node tests/effect-repair-triage.cjs',
'- node tests/fixed-deck-effect-coverage.test.cjs',
'- Run the repository complete offline regression and inspect its status.',
'- Include actual failing and passing cases in the PR description.','');
fs.mkdirSync('test-results',{recursive:true});
fs.writeFileSync(out,lines.join('\n'));
console.log('Codex handoff: '+out);
