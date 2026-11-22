'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
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

function run(baseCommit, directory) {
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
  const results = new Map();
  fs.mkdirSync(directory, {recursive: true});
  if (evidence.length) {
    const path = directory + '/candidate-evidence.json';
    const queue = directory + '/candidate-queue';
    // Always execute against this candidate bundle. Old receipts may describe other code.
    if (fs.existsSync(queue)) throw Error('CANDIDATE_QUEUE_MUST_BE_FRESH');
    B.atomic(path, evidence);
    const result = spawnSync(process.execPath, ['scripts/process-shared-effect-batch.cjs', queue, path,
      '--limit', String(evidence.length), '--max-tasks', String(evidence.length)],
    {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    if (result.status !== 0) throw Error(result.stderr || result.stdout);
    for (const job of Object.values(read(queue + '/queue.json').jobs)) {
      for (const test of job.summary?.cases || []) results.set(test.slot, test.status);
    }
  }
  if (printedDamage.length) {
    const worker = require('./lib/shared-effect-engine-worker.cjs');
    const outcomes = printedDamage.map(slot => worker.verifyPrintedDamage(slot));
    B.atomic(directory + '/printed-damage-results.json', outcomes);
    for (const outcome of outcomes) results.set(outcome.slot, outcome.status);
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
  const report = {baseCommit, state:'PREPUBLICATION', qualified, blockers, publicBattleVerified:[]};
  B.atomic(directory + '/candidate.json', report);
  console.log(JSON.stringify(report));
  // An engine change can compile previously unsupported rows already in the
  // release input. Preserve that input and stop if any such row is unverified.
  const promotedWithoutProof = blockers.filter(({id}) => baseIntake.has(id));
  if (promotedWithoutProof.length)
    throw Error('EXISTING_INTAKE_PROMOTION_BLOCKED: ' + promotedWithoutProof.map(row => row.id).join(', '));
  const allowed = new Set(qualified);
  const intake = read(intakePath);
  // Keep raw evidence in the existing checkpoint. Only qualified additions go
  // into the release compiler input, alongside the entire original intake.
  intake.records = intake.records.filter(record => baseIntake.has(record.officialCardId) || allowed.has(record.officialCardId));
  const temporary = intakePath + '.candidate-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(intake,null,2)+'\n', {flag:'wx'});
  fs.renameSync(temporary,intakePath);

}

if (require.main === module) run(process.argv[2], process.argv[3]);
module.exports = {requiredSlots, allExecuted, verifiedBasicEnergy, verifyBasicEnergyRuntime};
