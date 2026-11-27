'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync,spawn} = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const B = require('./lib/shared-effect-batch.cjs');
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const intakePath = 'data/effect-extensions/intake.json';
const compiledPath = 'data/effect-extensions/compiled.json';

function requiredSlots(record) {
  const effect = (kind, index, entry) => ({
    officialCardId: record.officialCardId,
    category: record.category,
    officialPageUrl: record.officialPageUrl,
    effectKind: kind,
    effectName: entry.name,
    effectIndex: index,
    effectText: entry.text?.trim() || '',
    printedDamage: kind === 'attack' && entry.plan?.mechanic === 'VANILLA_DAMAGE'
      && /^\d+$/.test(entry.damage) ? entry.damage : undefined,
    officialTextSha256: B.hash(entry.text?.trim() || '')
  });
  return record.category === 'pokemon'
    ? [...record.attacks.map((entry, index) => effect('attack', index, entry)),
       ...record.abilities.map((entry, index) => effect('ability', index, entry))]
    : [effect(record.category, 0, record)];
}

function allExecuted(slots, results, verifiedBasicEnergy = false) {
  return slots.length > 0 && slots.every(slot =>
    (slot.effectText || slot.printedDamage !== undefined ||
      (verifiedBasicEnergy && slot.effectKind === 'energy' && slot.effectText === '')) &&
    results.get(B.slot(slot)) === 'SUCCEEDED');
}

// A legal old printing of basic Energy is not an arbitrary same-name reprint.
// The catalog already verifies the official search evidence and image/ID pair;
// the compiler independently verifies the saved official HTML, image, type and
// SHA-256 before a record can reach this stage.
function verifiedBasicEnergy(record, card) {
  const type = record.name.match(/^基本([草炎水雷超闘悪鋼])エネルギー$/)?.[1];
  return Boolean(type && card?.basicEnergy === true && card.category === 'energy' &&
    card.name === record.name && record.category === 'energy' &&
    record.facts?.basicEnergyType === type && record.mainPlan?.mechanic === 'BASIC_ENERGY' &&
    record.text === '' && record.attacks?.length === 0 && record.abilities?.length === 0);
}

// This empty-text mechanic must attach the actual physical print, not pass a
// dummy text-based effect receipt. No worker execution -> remain BLOCKED.
function verifyBasicEnergyRuntime(worker, record) {
  try {
    const frame = worker.prepare(record,
      {name:record.name, text:'', plan:record.mainPlan, effectIndex:0}, 'energy');
    if (frame.blocked || !frame.port || !frame.sourceId) return false;
    const p = frame.port;
    const before = p.getSnapshot();
    const choices = p.getHandOptions('you', frame.sourceId);
    const choice = choices.find(option => (option.ok ?? option.enabled) &&
      option.action?.type === 'attach_energy');
    if (!choice || !before.players[0].hand.some(card =>
      String(card.id) === String(frame.sourceId))) return false;
    const attached = game => [game.players[0].active, ...game.players[0].bench]
      .flatMap(mon => mon?.energyCards || []);
    const n = attached(before).length;
    if (!p.dispatch('you', choice.action).ok) return false;
    const after = p.getSnapshot();
    if (after.players[0].hand.some(card =>
      String(card.id) === String(frame.sourceId))) return false;
    const energies = attached(after);
    if (energies.length !== n + 1) return false;
    const physical = energies.find(card => String(card.id) === String(frame.sourceId));
    return Boolean(physical && String(physical.validationReference?.officialCardId) ===
      String(record.officialCardId) &&
      (physical.energyType === undefined ||
        physical.energyType === record.facts.basicEnergyType));
  } catch { return false; }
}

// Never remove a previously compiled print. Only newly compilable rows that
// failed the current proof gate are deferred; raw records remain retryable.
function deferUnverifiedPromotions(intake, checkpoint, baseIntake, baseCompiled, qualified, blockers) {
  const allowed = new Set(qualified);
  const blocked = new Map(blockers.map(row => [row.id,row]));
  const raw = new Map(checkpoint.records.map(row => [row.officialCardId,row]));
  const deferred = [];
  for (const row of intake.records) {
    const id = row.officialCardId;
    if (baseCompiled.has(id) || !blocked.has(id)) continue;
    if (!baseIntake.has(id)) continue;
    if (allowed.has(id)) throw Error('CONFLICTING_EXECUTION_GATE:'+id);
    const prior = raw.get(id);
    if (prior && require('node:util').isDeepStrictEqual(prior,row) === false)
      throw Error('DEFERRED_EVIDENCE_CONFLICT:'+id);
    raw.set(id,row);
    deferred.push(blocked.get(id));
  }
  const deferredIds = new Set(deferred.map(row => row.id));
  checkpoint.records = [...raw.values()];
  intake.records = intake.records.filter(row => baseCompiled.has(row.officialCardId) ||
    allowed.has(row.officialCardId) ||
    (baseIntake.has(row.officialCardId) && !deferredIds.has(row.officialCardId)));
  return deferred;
}

// Keep all effect slots of an exact print together. Largest print groups
// go first, then the least-loaded shard; deterministic ties by ID/index.
function partitionEvidence(evidence, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) throw Error('INVALID_ENGINE_SHARD_COUNT');
  const byPrint=new Map(),seen=new Set();
  for(const row of evidence){
    const slot=B.slot(row);
    if(seen.has(slot))throw Error('DUPLICATE_CANDIDATE_SLOT:'+slot);
    seen.add(slot);
    const key=String(row.officialCardId);
    if(!byPrint.has(key))byPrint.set(key,[]);
    byPrint.get(key).push(row);
  }
  const shards=Array.from({length:Math.min(count,byPrint.size)},()=>[]);
  const groups=[...byPrint.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));
  for(const [,rows] of groups){
    let i=0;for(let j=1;j<shards.length;j++)if(shards[j].length<shards[i].length)i=j;
    shards[i].push(...rows.sort((a,b)=>B.slot(a).localeCompare(B.slot(b))));
  }
  return shards;
}
// Missing/failed receipts cannot promote a card. Reject foreign or duplicate
// results, even if another shard already passed that effect.
function mergeShardResults(shards, receipts) {
  if(shards.length!==receipts.length)throw Error('ENGINE_SHARD_RECEIPT_COUNT');
  const fingerprints=new Set(),merged=new Map();
  for(let i=0;i<shards.length;i++){
    const {executionFingerprint, cases}=receipts[i];
    if(!/^[a-f0-9]{64}$/.test(executionFingerprint||''))throw Error('ENGINE_SHARD_FINGERPRINT_MISSING');
    fingerprints.add(executionFingerprint);
    const expected=new Set(shards[i].map(B.slot));
    for(const result of cases){
      if(!expected.has(result.slot)||merged.has(result.slot))throw Error('FOREIGN_OR_DUPLICATE_ENGINE_SLOT:'+result.slot);
      if(!['SUCCEEDED','BLOCKED','FAILED'].includes(result.status))throw Error('INVALID_ENGINE_SLOT_STATUS');
      merged.set(result.slot,result);
    }
    for(const slot of expected)if(!merged.has(slot))merged.set(slot,{slot,status:'BLOCKED',reason:'ENGINE_SHARD_SLOT_RECEIPT_MISSING'});
  }
  if(fingerprints.size>1)throw Error('ENGINE_SHARD_FINGERPRINT_CONFLICT');
  return merged;
}
async function executeEvidenceShards(evidence,directory){
  const fallback=Math.max(1,Math.min(4,os.availableParallelism(),Math.floor(os.totalmem()/(3*1024**3))));
  const count=Number(process.env.POKECA_ENGINE_SHARDS||fallback);
  const shards=partitionEvidence(evidence,count);
  B.atomic(directory+'/candidate-evidence.json',evidence);
  const root=directory+'/candidate-queue';
  if(fs.existsSync(root))throw Error('CANDIDATE_QUEUE_MUST_BE_FRESH');
  fs.mkdirSync(root,{recursive:true});
  const started=Date.now();
  const outcomes=await Promise.allSettled(shards.map(async(rows,index)=>{
    const queue=root+'/shard-'+index,source=directory+'/candidate-evidence-'+index+'.json';
    B.atomic(source,rows);
    const log=fs.openSync(directory+'/engine-shard-'+index+'.log','wx');
    try{
      await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,['scripts/process-shared-effect-batch.cjs',queue,source,
          '--limit',String(rows.length),'--max-tasks',String(rows.length)],{stdio:['ignore',log,log]});
        child.once('error',reject);
        child.once('close',(code,signal)=>code===0?resolve():reject(Error('ENGINE_SHARD_FAILED:'+index+':'+(signal||code))));
      });
    }finally{fs.closeSync(log);}
    const report=read(queue+'/last-run.json').run;
    if(report.stopped||report.staleSuccesses!==0)throw Error('ENGINE_SHARD_INCOMPLETE:'+index);
    const cases=[];
    for(const job of Object.values(read(queue+'/queue.json').jobs)){
      if(!job.summary?.cases?.length)continue;
      if(job.attempt?.executionFingerprint!==report.executionFingerprint)throw Error('ENGINE_JOB_FINGERPRINT_CONFLICT:'+index);
      cases.push(...job.summary.cases);
    }
    console.log('ENGINE_SHARD_DONE '+index+' slots='+rows.length+' receipts='+cases.length);
    return {executionFingerprint:report.executionFingerprint,cases};
  }));
  const failures=outcomes.flatMap((row,i)=>row.status==='rejected'?[{shard:i,reason:String(row.reason)}]:[]);
  B.atomic(directory+'/engine-parallel-summary.json',{shards:shards.length,slots:evidence.length,elapsedMs:Date.now()-started,failures,completed:outcomes.map((row,i)=>({shard:i,status:row.status,slots:shards[i].length}))});
  if(failures.length)throw Error('ENGINE_PARALLEL_INFRASTRUCTURE_FAILURE:'+JSON.stringify(failures));
  return mergeShardResults(shards,outcomes.map(row=>row.value));
}
async function run(baseCommit, directory) {
  const gitRead = path => {
    const result = spawnSync('git', ['show', baseCommit + ':' + path], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
    if (result.status !== 0) throw Error(result.stderr);
    return JSON.parse(result.stdout);
  };
  const baseCompiled = new Set(gitRead(compiledPath).records.map(record => record.officialCardId));
  const baseIntake = new Set(gitRead(intakePath).records.map(record => record.officialCardId));
  const context = {window: {}};
  for (const file of ['deck-code-import', 'saved-decks']) {
    vm.runInNewContext(fs.readFileSync('ui/' + file + '.js', 'utf8'), context);
  }
  const {PokecaDeckCodeImport: importer, PokecaSavedDecks: decks} = context.window;
  const formal = read('data/reference-effects/catalog.json');
  const cards = importer.catalogFrom(read('data/official-image-registry.json'), formal,
    read('data/deck-building/catalog.json'), read('data/deck-building/m7-official-image-extension.json'));
  const candidates = read(compiledPath).records.filter(record => !baseCompiled.has(record.officialCardId));
  const slotsById = new Map();
  const basicCandidates = new Map();
  const blockers = [];
  for (const record of candidates) {
    const id = record.officialCardId;
    const card = cards.get(id);
    const basic = verifiedBasicEnergy(record, card);
    const reason = !card || !(['H','I','J'].includes(card.regulationMark) || basic)
      ? 'UNVERIFIED_HIJ_SCOPE' : decks.connectionError(id, card, record);
    if (reason) blockers.push({id, reason});
    else {
      slotsById.set(id, requiredSlots(record));
      if (basic) basicCandidates.set(id, record);
    }
  }
  const slots = [...slotsById.values()].flat();
  const evidence = slots.filter(slot => slot.effectText);
  const printedDamage = slots.filter(slot => !slot.effectText && slot.printedDamage !== undefined);
  const results = new Map(),diagnostics = new Map();
  fs.mkdirSync(directory, {recursive: true});
  if (evidence.length) {
    for(const [slot,test] of await executeEvidenceShards(evidence,directory)){
      results.set(slot,test.status);
      diagnostics.set(slot,{status:test.status,reason:test.reason||null,details:test.details||null});
    }
  }
  if (printedDamage.length) {
    const worker = require('./lib/shared-effect-engine-worker.cjs');
    const outcomes = printedDamage.map(slot => worker.verifyPrintedDamage(slot));
    B.atomic(directory + '/printed-damage-results.json', outcomes);
    for (const outcome of outcomes) {results.set(outcome.slot, outcome.status);diagnostics.set(outcome.slot,{status:outcome.status,reason:outcome.reason||null,details:outcome.details||null});}
  }
  if (basicCandidates.size) {
    const worker = require('./lib/shared-effect-engine-worker.cjs');
    for (const [id, record] of basicCandidates) {
      if (verifyBasicEnergyRuntime(worker, record))
        results.set(B.slot(slotsById.get(id)[0]), 'SUCCEEDED');
    }
  }
  const qualified = [];
  for (const [id, slots] of slotsById) {
    if (allExecuted(slots, results, basicCandidates.has(id))) qualified.push(id);
    else blockers.push({id, reason: slots.some(slot=>results.get(B.slot(slot))==='FAILED')
      ? 'ENGINE_EXECUTION_FAILED' : 'EXECUTION_EVIDENCE_INCOMPLETE'});
  }
  const executionGaps=[...slotsById].flatMap(([id,slots])=>slots.filter(s=>results.get(B.slot(s))!=='SUCCEEDED').map(s=>({id,kind:s.effectKind,index:s.effectIndex,slot:B.slot(s),...diagnostics.get(B.slot(s)),status:results.get(B.slot(s))||'NO_RECEIPT'})));
  B.atomic(directory+'/execution-gaps.json',{baseCommit,scope:'DIAGNOSTIC_NOT_BATTLE_APPROVAL',gaps:executionGaps});
  const report = {baseCommit, state:'PREPUBLICATION', qualified, blockers, publicBattleVerified:[]};
  B.atomic(directory + '/candidate.json', report);
  console.log(JSON.stringify(report));
  const intake = read(intakePath);
  const checkpointPath = 'data/official-effect-intake/checkpoint.json';
  const checkpoint = read(checkpointPath);
  // A newly compilable but unverified old intake row must not stop unrelated
  // proven prints or become playable. Preserve exact source in the retry
  // checkpoint before excluding that row from the release compiler input.
  const deferred = deferUnverifiedPromotions(intake, checkpoint, baseIntake,
    baseCompiled, qualified, blockers);
  if (deferred.length) {
    const checkpointTemp = checkpointPath + '.candidate-' + process.pid;
    fs.writeFileSync(checkpointTemp, JSON.stringify(checkpoint,null,2)+'\n', {flag:'wx'});
    fs.renameSync(checkpointTemp,checkpointPath);
    B.atomic(directory + '/deferred-promotions.json', deferred);
  }
  const temporary = intakePath + '.candidate-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(intake,null,2)+'\n', {flag:'wx'});
  fs.renameSync(temporary,intakePath);

}

if (require.main === module) run(process.argv[2], process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
module.exports = {requiredSlots, allExecuted, verifiedBasicEnergy, verifyBasicEnergyRuntime, deferUnverifiedPromotions, partitionEvidence, mergeShardResults, executeEvidenceShards};
