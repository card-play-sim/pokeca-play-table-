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
    officialTextSha256: B.hash(entry.text?.trim() || '')
  });
  return record.category === 'pokemon'
    ? [...record.attacks.map((entry, index) => effect('attack', index, entry)),
       ...record.abilities.map((entry, index) => effect('ability', index, entry))]
    : [effect(record.category, 0, record)];
}

function allExecuted(slots, results) {
  return slots.length > 0 && slots.every(slot => slot.effectText && results.get(B.slot(slot)) === 'SUCCEEDED');
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
  const cards = importer.catalogFrom(read('data/official-image-registry.json'), formal, read('data/deck-building/catalog.json'));
  const candidates = read(compiledPath).records.filter(record => !baseCompiled.has(record.officialCardId));
  const slotsById = new Map();
  const blockers = [];
  for (const record of candidates) {
    const id = record.officialCardId;
    const card = cards.get(id);
    const reason = !card || !['H','I','J'].includes(card.regulationMark)
      ? 'UNVERIFIED_HIJ_SCOPE' : decks.connectionError(id, card, record);
    if (reason) blockers.push({id, reason});
    else slotsById.set(id, requiredSlots(record));
  }
  const evidence = [...slotsById.values()].filter(slots=>slots.length && slots.every(slot=>slot.effectText)).flat();
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
  const qualified = [];
  for (const [id, slots] of slotsById) {
    if (allExecuted(slots, results)) qualified.push(id);
    else blockers.push({id, reason: slots.some(slot=>results.get(B.slot(slot))==='FAILED')
      ? 'ENGINE_EXECUTION_FAILED' : 'EXECUTION_EVIDENCE_INCOMPLETE'});
  }
  const allowed = new Set(qualified);
  const intake = read(intakePath);
  // Keep raw evidence in the existing checkpoint. Only qualified additions go
  // into the release compiler input, alongside the entire original intake.
  intake.records = intake.records.filter(record => baseIntake.has(record.officialCardId) || allowed.has(record.officialCardId));
  const temporary = intakePath + '.candidate-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(intake,null,2)+'\n', {flag:'wx'});
  fs.renameSync(temporary,intakePath);
  const report = {baseCommit, state:'PREPUBLICATION', qualified, blockers, publicBattleVerified:[]};
  B.atomic(directory + '/candidate.json', report);
  console.log(JSON.stringify(report));
}

if (require.main === module) run(process.argv[2], process.argv[3]);
module.exports = {requiredSlots, allExecuted};
