'use strict';
// Diagnose exact official-print identity overlaps before shared-mechanic batching.
// This audit does not mark any print as connected or modify protected ledgers.
const fs = require('node:fs');
const path = require('node:path');
const worklist = JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/official-effect-continuation/atomic-battle-connection-shared-mechanic-worklist.json'), 'utf8'));
const coverage = JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/ij-effect-coverage.json'), 'utf8'));
const owners = new Map();
const discrepancies = [];
const missingEvidence = [];
for (const group of worklist.groups) {
  const ids = (group.officialCardIds || []).map(String);
  const evidence = group.officialEvidencePaths || [];
  if (new Set(ids).size !== ids.length) discrepancies.push({task:group.sharedTaskId,reason:'duplicate-within-group'});
  if (group.printCount !== ids.length) discrepancies.push({task:group.sharedTaskId,reason:'print-count-mismatch',printCount:group.printCount,distinctIds:new Set(ids).size,slots:group.effectSlots});
  for (const id of ids) {
    if (!owners.has(id)) owners.set(id, []);
    owners.get(id).push(group.sharedTaskId);
    const expected = 'data/effect-extensions/evidence/' + id + '.json';
    if (!evidence.includes(expected) || !fs.existsSync(path.join(__dirname, '..', expected))) {
      missingEvidence.push({id,task:group.sharedTaskId,expected});
    }
  }
}
const coverageRecords = coverage.records || [];
const required = new Set(coverageRecords.filter(r=>r.status==='MECHANIC_REQUIRED').map(r=>String(r.id)));
const overlap = [...owners].filter(([,tasks])=>tasks.length>1).map(([id,tasks])=>({id,tasks}));
const result = {
  scope:coverage.scope,
  worklistGroups:worklist.groups.length,
  uniqueWorklistIds:owners.size,
  summedPrintCount:worklist.groups.reduce((n,g)=>n+(g.printCount||0),0),
  summedEffectSlots:worklist.groups.reduce((n,g)=>n+(g.effectSlots||0),0),
  duplicateAcrossGroups:overlap,
  discrepancies,
  missingEvidence,
  mechanicRequiredInCoverage:required.size,
  worklistIdsInMechanicRequired:[...owners.keys()].filter(id=>required.has(id)).length,
  mechanicRequiredNotInWorklist:[...required].filter(id=>!owners.has(id)),
  worklistIdsNotMechanicRequired:[...owners.keys()].filter(id=>!required.has(id))
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
// Fail only on structural corruption; scope differences and missing evidence are diagnostic.
if (discrepancies.length || overlap.length) process.exitCode=1;
