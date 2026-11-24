'use strict';
// One per-print work unit from official retrieval through actual battle execution.
// Collecting an official page is NEVER a completion state. Unknown mechanics stay
// in this same work unit, grouped for shared-engine implementation and recheck.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {compile} = require('../engine/reference-effect-plans.cjs');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
const statuses = [
  'QUALIFIED_PREPUBLICATION',
  'NEEDS_ENGINE_EXECUTION',
  'NEEDS_SHARED_MECHANIC',
  'NEEDS_OFFICIAL_PARSER',
  'EVIDENCE_BLOCKED',
  'EFFECT_UNRESOLVED',
  'PENDING_OFFICIAL_FETCH'
];
const semantic = new Set(['UNSUPPORTED_POKEMON_OR_ENERGY_EFFECT_PATTERN','UNSUPPORTED_EFFECT_PATTERN']);
const parserReason = reason => /^UNSUPPORTED_|^MISSING_PRINTED_|^UNPARSED_|^INVALID_OFFICIAL_/.test(reason || '');
function rawSlots(row) {
  try {
    const result = compile({records:[row]}).records[0];
    return result.category === 'pokemon'
      ? [
        ...result.attacks.map((effect,i) => ({kind:'attack',index:i,effect})),
        ...result.abilities.map((effect,i) => ({kind:'ability',index:i,effect}))
      ].filter(item => !item.effect.plan)
      : result.mainPlan ? [] : [{kind:result.category,index:0,effect:result}];
  } catch {
    return [{kind:row.category,index:0,effect:{text:row.text || '',damage:'',cost:[]}}];
  }
}
function makeWorklist(records,blocked,ids) {
  const groups = new Map();
  const seenPrints = new Map();
  const source = new Map(records.map(row => [String(row.officialCardId),row]));
  for (const failure of blocked) {
    const id = String(failure.officialCardId);
    if (!ids.has(id) || !semantic.has(failure.reason)) continue;
    const row = source.get(id);
    if (!row) continue;
    const slots = rawSlots(row);
    for (const slot of slots) {
      const e = slot.effect;
      const text = String(e.text || '');
      // The complete text, cost and printed damage matter; identical names do not.
      const signature = {
        category:row.category,kind:slot.kind,text,
        cost:e.cost || [],damage:e.damage === undefined ? null : e.damage
      };
      const key = hash(JSON.stringify(signature)).slice(0,20);
      if (!groups.has(key)) {
        seenPrints.set(key,new Set());
        groups.set(key,{
        sharedTaskId:'OFFICIAL_SHARED_MECHANIC_'+key.toUpperCase(),
        category:row.category,effectKind:slot.kind,
        exampleOfficialText:text.slice(0,1600),
        printedDamage:signature.damage,
        energyCost:signature.cost,
        officialCardIds:[],
        officialEvidencePaths:[],
        printCount:0,
        effectSlots:0
        });
      }
      const group = groups.get(key);
      group.effectSlots++;
      const alreadyCounted = seenPrints.get(key).has(id);
      if (!alreadyCounted) {
        seenPrints.get(key).add(id);
        group.printCount++;
        group.officialCardIds.push(id);
        if (row.source?.path) group.officialEvidencePaths.push(row.source.path);
      }
    }
  }
  return [...groups.values()].sort((a,b) =>
    b.printCount-a.printCount || a.sharedTaskId.localeCompare(b.sharedTaskId));
}
function buildLedger({ids,candidate,checkpoint,status,compiled}) {
  if (!Array.isArray(ids)) throw Error('OFFICIAL_ID_QUEUE_REQUIRED');
  if (candidate?.state !== 'PREPUBLICATION' ||
      !Array.isArray(candidate.qualified) ||
      !Array.isArray(candidate.blockers) ||
      !Array.isArray(candidate.publicBattleVerified))
    throw Error('BATTLE_EXECUTION_CANDIDATE_GATE_REQUIRED');
  const selected = new Set(ids.map(String));
  const qualified = new Set(candidate.qualified.map(String));
  const stagedBlock = new Map(candidate.blockers.map(row=>[String(row.id),row]));
  const compilerBlock = new Map((status.compilerBlocked || [])
    .map(row => [String(row.officialCardId),row]));
  const rawBlocked = new Map((checkpoint.blocked || [])
    .map(row => [String(row.officialCardId),row]));
  const rawRecords = new Map((checkpoint.records || [])
    .map(row => [String(row.officialCardId),row]));
  const publishedRecords = new Map((compiled.records || [])
    .map(row => [String(row.officialCardId),row]));
  const counts = Object.fromEntries(statuses.map(x=>[x,0]));
  // A staged print must also be in the actual release artifact; otherwise
  // fail the entire run instead of recording a false success.
  for (const id of qualified) {
    if (!publishedRecords.has(id)) throw Error('QUALIFIED_PRINT_NOT_IN_BATTLE_RELEASE:'+id);
  }
  const entries = [];
  for (const id of new Set([...selected,...qualified])) {
    let state,reason=null;
    if (qualified.has(id)) state='QUALIFIED_PREPUBLICATION';
    else if (stagedBlock.has(id)) {
      state='NEEDS_ENGINE_EXECUTION';
      reason=stagedBlock.get(id).reason;
    } else if (compilerBlock.has(id)) {
      const b=compilerBlock.get(id);
      state=semantic.has(b.reason)?'NEEDS_SHARED_MECHANIC':
        parserReason(b.reason)?'NEEDS_OFFICIAL_PARSER':'EVIDENCE_BLOCKED';
      reason=b.reason;
    } else if (rawBlocked.has(id)) {
      const b=rawBlocked.get(id);
      state=parserReason(b.reason)?'NEEDS_OFFICIAL_PARSER':'EVIDENCE_BLOCKED';
      reason=b.reason;
    } else if (rawRecords.has(id))
      state='EFFECT_UNRESOLVED';
    else state='PENDING_OFFICIAL_FETCH';
    counts[state]++;
    entries.push({officialCardId:id,state,...(reason?{reason}:{})});
  }
  const groups = makeWorklist([...rawRecords.values()],status.compilerBlocked || [],
    new Set(entries.filter(row=>row.state==='NEEDS_SHARED_MECHANIC')
      .map(row=>row.officialCardId)));
  const workRemaining = entries.length-counts.QUALIFIED_PREPUBLICATION;
  return {
    schemaVersion:1,
    scope:'OFFICIAL_CARD_TO_ENGINE_ONE_ATOMIC_WORK_UNIT',
    source:'EXACT_OFFICIAL_HTML_ID_IMAGE_EFFECT_AND_ENGINE_RECEIPTS',
    publicBattleVerified:false,
    finalization:'ONLY_AFTER_REQUIRED_CI_MAIN_PAGES_AND_PUBLISHED_BATTLE',
    totalSelected:entries.length,
    qualifiedForPublication:counts.QUALIFIED_PREPUBLICATION,
    workRemaining,
    counts,
    allCardEffectsConnectedAndExecuted:workRemaining===0,
    sharedMechanicGroups:groups.length,
    sharedMechanicWorklist:groups,
    // Keep unresolved print IDs in the SAME work ledger; never label these as
    // collected/done, and always re-evaluate when a mechanic or parser changes.
    entries
  };
}
function main(args) {
  const idsPath=args[0] || '/tmp/official-update-ids.json';
  const candidatePath=args[1] || 'work/card-auto-connect/candidate.json';
  const output=args[2] || 'reports/official-effect-continuation/atomic-battle-connection.json';
  const ledger=buildLedger({
    ids:read(idsPath),
    candidate:read(candidatePath),
    checkpoint:read('data/official-effect-intake/checkpoint.json'),
    status:read('reports/official-effect-continuation/status.json'),
    compiled:read('data/effect-extensions/compiled.json')
  });
  fs.mkdirSync(require('node:path').dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(ledger,null,2)+'\n');
  const groupPath=output.replace(/\.json$/,'-shared-mechanic-worklist.json');
  fs.writeFileSync(groupPath,JSON.stringify({
    schemaVersion:1,
    scope:ledger.scope,
    groups:ledger.sharedMechanicWorklist,
    unfinishedPrints:ledger.workRemaining
  },null,2)+'\n');
  console.log(JSON.stringify({
    state:'ATOMIC_PRINT_CONNECTION_LEDGER',
    total:ledger.totalSelected,
    executionQualifiedNotYetPublished:ledger.qualifiedForPublication,
    unresolvedInSameWorkUnit:ledger.workRemaining,
    statuses:ledger.counts,
    sharedMechanicGroups:ledger.sharedMechanicGroups,
    output,groupPath
  }));
}
if (require.main===module) main(process.argv.slice(2));
module.exports={buildLedger,rawSlots,makeWorklist};
