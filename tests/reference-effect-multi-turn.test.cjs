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
// Stateful multi-turn smoke test: legal actions must remain executable after prior effects.
let multiTurnActions = 0, multiTurnEnds = 0;
const multiTurnTypes = new Set();
for (let initialSeed = 1; initialSeed <= 40; initialSeed++) {
  let state = initialSeed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const created = engine.createReferenceValidationMatch(manifest, {
    rng: random, firstDeck: initialSeed % 2, firstPlayer: initialSeed % 2 ? 'you' : 'ai'
  });
  assert.equal(created.ok, true);
  let game = created.game;
  const gateway = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
  assert.equal(gateway.loadGame(game).ok, true);
  for (let step = 0; step < 35 && game.status === 'active'; step++) {
    const owner = game.pendingReferenceChoice?.playerId || game.turnPlayer;
    const actions = engine.getLegalActions(game, owner).actions;
    const preferred = ['resolve_reference_choice', 'attach_energy', 'play_item', 'play_stadium', 'use_ability', 'attack_turn', 'end_turn'];
    const action = preferred.map(type => actions.find(a => a.type === type)).find(Boolean);
    if (!action) break;
    const result = gateway.dispatch(owner, action);
    assert.equal(result.ok, true, 'multi-turn action failed seed=' + initialSeed + ' step=' + step + ' type=' + action.type + ': ' + JSON.stringify(result.errors || result.stage || 'unknown'));
    assert.equal(result.transitionAudit?.conservation?.ok, true, 'multi-turn conservation failed seed=' + initialSeed + ' step=' + step);
    multiTurnActions++;
    multiTurnTypes.add(action.type);
    if (action.type === 'end_turn') multiTurnEnds++;
  }
}
assert.ok(multiTurnActions >= 1000, 'insufficient stateful multi-turn exercise');
assert.ok(multiTurnEnds >= 300, 'insufficient real turn transitions');
console.log('REFERENCE_MULTI_TURN_GATE PASS:', multiTurnActions, 'actions;', multiTurnEnds, 'turn transitions;', [...multiTurnTypes].join(', '));
