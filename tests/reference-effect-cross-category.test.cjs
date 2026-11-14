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
const isolated = compile(sourceCatalog);
const fallbackProbe = {category:'item',text:'このポケモンがバトル場にいるなら、自分の番に1回使える。自分の山札を2枚引く。この特性は別の「おつかいダッシュ」を使った番は使えない。'};
const fallbackPlans = compile({records:[{officialCardId:'probe-1',category:'item',name:'Probe 1',text:fallbackProbe.text,attacks:[],abilities:[]},{officialCardId:'probe-2',category:'item',name:'Probe 2',text:fallbackProbe.text,attacks:[],abilities:[]}]}).records;
assert.ok(fallbackPlans[0].mainPlan && fallbackPlans[1].mainPlan, 'known fallback text must compile');
assert.notStrictEqual(fallbackPlans[0].mainPlan.commands, fallbackPlans[1].mainPlan.commands, 'fallback plans must own independent command arrays');
fallbackPlans[0].mainPlan.commands.push('ISOLATION_PROBE');
assert.equal(fallbackPlans[1].mainPlan.commands.includes('ISOLATION_PROBE'), false, 'fallback plan mutation must not leak');
const sameTextPlans = isolated.records.flatMap(r => [...r.attacks.map(a => a.plan), ...r.abilities.map(a => a.plan), r.mainPlan].filter(Boolean));
const byMechanic = new Map();
for (const plan of sameTextPlans) {
 if (!Array.isArray(plan.commands)) continue;
 const previous = byMechanic.get(plan.mechanic);
 if (previous && previous.commands.join('|') === plan.commands.join('|')) {
  assert.notStrictEqual(previous.commands, plan.commands, 'effect command arrays must not be shared across compiled cards');
  const original = plan.commands.slice();
  previous.commands.push('ISOLATION_PROBE');
  assert.equal(plan.commands.join('|'), original.join('|'), 'mutating one card plan must not change another card plan');
  previous.commands.pop();
 }
 byMechanic.set(plan.mechanic, plan);
}

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
// Additional cross-category smoke: supporters, tools and retreat in the same
// stateful gateway used for item/attack/ability/prize actions.
const categoryCounts = new Map();
for (let initialSeed = 1; initialSeed <= 12; initialSeed++) {
  let state = initialSeed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const created = engine.createReferenceValidationMatch(manifest, {
    rng: random, firstDeck: initialSeed % 2, firstPlayer: initialSeed % 2 ? 'you' : 'ai'
  });
  assert.equal(created.ok, true);
  let game = created.game;
  const gateway = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
  assert.equal(gateway.loadGame(game).ok, true);
  for (let step = 0; step < 60 && game.status === 'active'; step++) {
    const owner = game.pendingReferenceChoice?.playerId || game.turnPlayer;
    const actions = engine.getLegalActions(game, owner).actions;
    const preferred = ['resolve_reference_choice', 'bench_basic', 'play_active_basic', 'evolve', 'attach_energy', 'play_item', 'play_supporter', 'play_stadium', 'attach_tool', 'use_ability', 'attack_turn', 'take_prizes', 'retreat', 'end_turn'];
    const action = preferred.map(type => actions.find(a => a.type === type)).find(Boolean);
    if (!action) break;
    const outcome = gateway.dispatch(owner, action);
    assert.equal(outcome.ok, true, 'cross-category gateway failure seed=' + initialSeed + ' step=' + step + ' type=' + action.type);
    assert.equal(outcome.transitionAudit?.conservation?.ok, true, 'cross-category conservation failure seed=' + initialSeed + ' step=' + step);
    categoryCounts.set(action.type, (categoryCounts.get(action.type) || 0) + 1);
  }
}
for (const type of ['play_supporter', 'attach_tool', 'retreat', 'attack_turn', 'evolve']) {
  assert.ok(categoryCounts.get(type) > 0, 'cross-category action not exercised: ' + type);
}
console.log('REFERENCE_CROSS_CATEGORY_GATE PASS:', Object.fromEntries(categoryCounts));
