'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../ui/engine.bundle.js'), 'utf8');
const sandbox = { window: {}, performance: require('node:perf_hooks').performance, setTimeout };
vm.runInNewContext(source, sandbox, { filename: 'engine.bundle.js', timeout: 10000 });
const engine = sandbox.window.Pokeca;
assert.equal(typeof engine?.createReferenceValidationMatch, 'function', 'reference validation adapter must be bundled');
assert.equal(typeof engine?.getReferenceEffectCoverage, 'function', 'reference effect runtime must be bundled');
assert.equal(typeof engine?.getReferenceEffectRecord, 'function', 'print-specific runtime lookup must be bundled');
const catalog = engine.getReferenceEffectCatalog();
const coverage = engine.getReferenceEffectCoverage();
const sourceCatalog = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/reference-effects/plans.json'), 'utf8'));
const { compile } = require('../engine/reference-effect-plans.cjs');
const expected = compile(sourceCatalog);
assert.equal(catalog.records.length, expected.records.length, 'published runtime catalog must include every verified reference print');
const bundledById = new Map(catalog.records.map(r => [String(r.officialCardId), r]));
assert.equal(bundledById.size, catalog.records.length, 'published runtime must not duplicate print IDs');
for (const record of expected.records) {
  const actual = bundledById.get(String(record.officialCardId));
  assert.ok(actual, 'missing published reference print ' + record.officialCardId);
  assert.equal(actual.name, record.name);
  assert.equal(actual.source.sha256, record.source.sha256, 'reference source hash mismatch for ' + record.officialCardId);
  assert.equal(actual.deckPrintAdopted, false);
  assert.equal(JSON.stringify(actual.attacks.map(a => a.plan)), JSON.stringify(record.attacks.map(a => a.plan)), 'published attack plan mismatch for ' + record.officialCardId);
  assert.equal(JSON.stringify(actual.abilities.map(a => a.plan)), JSON.stringify(record.abilities.map(a => a.plan)), 'published ability plan mismatch for ' + record.officialCardId);
  assert.equal(JSON.stringify(actual.mainPlan), JSON.stringify(record.mainPlan), 'published main plan mismatch for ' + record.officialCardId);
}
assert.equal(catalog.adoptedDeckPrints, 0);
assert.equal(coverage.prints, catalog.records.length);
assert.equal(coverage.defaults.length, Object.keys(catalog.defaultValidationReferences).length);
for (const entry of coverage.defaults) {
  assert.equal(entry.deckPrintAdopted, false);
  const record = catalog.records.find(r => r.officialCardId === entry.officialCardId);
  assert.ok(record, 'missing reference print ' + entry.officialCardId);
  assert.equal(record.deckName, entry.name);
  assert.equal(entry.mainConnected, record.category === 'pokemon' || Boolean(record.mainPlan));
}
assert.equal(engine.getReferenceEffectRecord({name:'unverified'}), null, 'unbound card must not receive an official print');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/fixed-test-decks.json'), 'utf8'));
let seed = 0x12345678;
const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
// Deterministic multi-seed regression across both deck orders and starting players.
for (const setup of [{ firstDeck: 0, firstPlayer: 'you' }, { firstDeck: 1, firstPlayer: 'ai' }]) {
  for (let initialSeed = 1; initialSeed <= 100; initialSeed++) {
    let state = initialSeed;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const created = engine.createReferenceValidationMatch(manifest, { rng: random, ...setup });
    assert.equal(created.ok, true, 'match generation failed for seed ' + initialSeed);
    let game = created.game;
    const gateway = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
    assert.equal(gateway.loadGame(game).ok, true, 'canonical load failed for seed ' + initialSeed);
    for (let i = 0; i < 4 && game.pendingReferenceChoice; i++) {
      const owner = game.pendingReferenceChoice.playerId;
      const choice = engine.getLegalActions(game, owner).actions.find(a => a.type === 'resolve_reference_choice');
      assert.ok(choice, 'opening choice missing for seed ' + initialSeed);
      assert.equal(gateway.dispatch(owner, choice).ok, true, 'opening choice failed for seed ' + initialSeed);
    }
    assert.equal(game.pendingReferenceChoice, undefined, 'unresolved opening choice for seed ' + initialSeed);
    const actor = game.turnPlayer;
    const openingActions = engine.getLegalActions(game, actor).actions;
    assert.equal(openingActions.some(a => a.type === 'attack_turn'), false, 'first player must not attack on opening turn seed=' + initialSeed);
    const openingSnapshot = JSON.stringify(game);
    const forcedOpeningAttack = gateway.dispatch(actor, { type: 'attack_turn', attackIndex: 0 });
    assert.equal(forcedOpeningAttack.ok, false, 'gateway must reject forced opening attack seed=' + initialSeed);
    assert.equal(JSON.stringify(game), openingSnapshot, 'rejected opening attack must not mutate state seed=' + initialSeed);
    const end = engine.getLegalActions(game, actor).actions.find(a => a.type === 'end_turn');
    assert.ok(end, 'end_turn missing for seed ' + initialSeed);
    const outcome = gateway.dispatch(actor, end);
    assert.equal(outcome.ok, true, 'end_turn failed for seed ' + initialSeed);
    assert.notEqual(game.turnPlayer, actor, 'turn did not change for seed ' + initialSeed);
    assert.equal(outcome.transitionAudit?.conservation?.ok, true, 'card conservation failed for seed ' + initialSeed);
  }
}
console.log('REFERENCE_MULTI_SEED_GATE PASS: 200 match setups, opening choices, turn transitions');
// Execute the first legal non-pass action across 100 different opening boards.
// This exercises item, energy, tool, ability, stadium and retreat paths, not only turn passing.
const exercised = new Set();
for (let initialSeed = 1; initialSeed <= 100; initialSeed++) {
  let state = initialSeed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const created = engine.createReferenceValidationMatch(manifest, { rng: random, firstPlayer: 'you' });
  assert.equal(created.ok, true);
  let game = created.game;
  const gateway = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
  assert.equal(gateway.loadGame(game).ok, true);
  for (let i = 0; i < 4 && game.pendingReferenceChoice; i++) {
    const owner = game.pendingReferenceChoice.playerId;
    const choice = engine.getLegalActions(game, owner).actions.find(a => a.type === 'resolve_reference_choice');
    assert.ok(choice);
    assert.equal(gateway.dispatch(owner, choice).ok, true);
  }
  const action = engine.getLegalActions(game, 'you').actions.find(a => a.type !== 'end_turn' && a.type !== 'resolve_reference_choice');
  if (!action) continue;
  const result = gateway.dispatch('you', action);
  assert.equal(result.ok, true, 'legal action ' + action.type + ' failed for seed ' + initialSeed + ': ' + JSON.stringify(result.errors || result.stage || 'unknown'));
  assert.equal(result.transitionAudit?.conservation?.ok, true, 'card conservation failed for action ' + action.type + ' seed ' + initialSeed);
  exercised.add(action.type);
}
for (const family of ['play_item', 'attach_energy', 'attach_tool', 'use_ability', 'play_stadium', 'retreat']) {
  assert.ok(exercised.has(family), 'unexercised common action family: ' + family);
}
console.log('REFERENCE_MULTI_ACTION_GATE PASS:', [...exercised].join(', '));
console.log('REFERENCE_OPENING_ACTIONS_INDEPENDENT_GATE PASS');
