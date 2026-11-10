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
const match = engine.createReferenceValidationMatch(manifest, { rng, firstPlayer: 'you' });
assert.equal(match.ok, true, 'reference validation match must initialize: ' + JSON.stringify(match.errors || match.stage || 'unknown'));
assert.equal(match.game.referenceEffectValidation.adoptedPrints, 0);
assert.equal(match.game.players.length, 2);
assert.ok(match.game.players.every(p => p.active && p.hand.length > 0), 'both players need an opening board');
const legal = engine.getLegalActions(match.game, match.game.turnPlayer);
assert.ok(Array.isArray(legal.actions), 'reference validation match must expose legal actions');
let currentGame = match.game;
const port = engine.createUIPort({ getGame: () => currentGame, setGame: value => { currentGame = value; } });
const loaded = port.loadGame(match.game);
assert.equal(loaded.ok, true, 'reference match must pass canonical load/audit: ' + JSON.stringify(loaded.errors || loaded.stage || 'unknown'));
// Resolve mandatory opening choices, then exercise a real turn transition.
for (let i = 0; i < 4 && currentGame.pendingReferenceChoice; i++) {
  const choiceActor = currentGame.pendingReferenceChoice.playerId;
  const options = engine.getLegalActions(currentGame, choiceActor).actions;
  const choice = options.find(a => a.type === 'resolve_reference_choice');
  assert.ok(choice, 'mandatory setup choice must be legal');
  const outcome = port.dispatch(choiceActor, choice);
  assert.equal(outcome.ok, true, 'setup choice must execute: ' + JSON.stringify(outcome.errors || outcome.stage || 'unknown'));
}
assert.equal(currentGame.pendingReferenceChoice, undefined, 'opening choices must finish');
const actor = currentGame.turnPlayer;
const actions = engine.getLegalActions(currentGame, actor).actions;
const safe = actions.find(a => a.type === 'end_turn');
assert.ok(safe, 'canonical legal actions must include end_turn after setup');
const beforeTurn = currentGame.turnNumber;
const dispatched = port.dispatch(actor, safe);
assert.equal(dispatched.ok, true, 'canonical gateway must execute legal end_turn: ' + JSON.stringify(dispatched.errors || dispatched.stage || 'unknown'));
assert.notEqual(currentGame.turnPlayer, actor, 'end_turn must transfer the turn');
assert.ok(currentGame.turnNumber > beforeTurn, 'turn counter must advance');
console.log('REFERENCE_GATEWAY_DISPATCH PASS:', actor, '->', currentGame.turnPlayer);
console.log('REFERENCE_MATCH_BOOT_GATE PASS:', match.game.players.map(p => p.id).join(','), 'legal actions:', legal.actions.length);
// Execute an actual card effect (DRAW) through the same bundled canonical gateway.
let abilitySeed = 1;
const abilityRng = () => { abilitySeed = (Math.imul(abilitySeed, 1664525) + 1013904223) >>> 0; return abilitySeed / 4294967296; };
const abilityMatch = engine.createReferenceValidationMatch(manifest, { rng: abilityRng, firstPlayer: 'you' });
assert.equal(abilityMatch.ok, true);
let abilityGame = abilityMatch.game;
const abilityPort = engine.createUIPort({ getGame: () => abilityGame, setGame: value => { abilityGame = value; } });
assert.equal(abilityPort.loadGame(abilityGame).ok, true);
for (let i = 0; i < 4 && abilityGame.pendingReferenceChoice; i++) {
  const owner = abilityGame.pendingReferenceChoice.playerId;
  const choice = engine.getLegalActions(abilityGame, owner).actions.find(a => a.type === 'resolve_reference_choice');
  assert.ok(choice);
  assert.equal(abilityPort.dispatch(owner, choice).ok, true);
}
assert.equal(abilityGame.players.find(p => p.id === 'you').active.name, 'メガガルーラex', 'deterministic ability fixture changed');
const ability = engine.getLegalActions(abilityGame, 'you').actions.find(a => a.type === 'use_ability' && a.abilityId === 'reference-47847-ability-0');
assert.ok(ability, 'おつかいダッシュ must be a legal action');
const player = abilityGame.players.find(p => p.id === 'you');
const handBefore = player.hand.length, deckBefore = player.deck.length;
const abilityResult = abilityPort.dispatch('you', ability);
assert.equal(abilityResult.ok, true, 'DRAW ability must execute: ' + JSON.stringify(abilityResult.errors || abilityResult.stage || 'unknown'));
assert.equal(player.hand.length, handBefore + 2, 'DRAW must move two cards into hand');
assert.equal(player.deck.length, deckBefore - 2, 'DRAW must remove exactly two cards from deck');
assert.equal(abilityGame.players.reduce((n, p) => n + p.deck.length + p.hand.length + p.discard.length + p.prizeCards.length + (p.active ? 1 : 0) + p.bench.length, 0) >= 120, true, 'cards must not disappear from match');
const secondUse = abilityPort.dispatch('you', ability);
assert.equal(secondUse.ok, false, 'once-per-turn ability must reject repeated use');
console.log('REFERENCE_DRAW_ABILITY PASS: 2 cards drawn; repeat blocked');
// A reusable search/discard item effect must preserve all physical cards.
let itemSeed = 1;
const itemRng = () => { itemSeed = (Math.imul(itemSeed, 1664525) + 1013904223) >>> 0; return itemSeed / 4294967296; };
const itemMatch = engine.createReferenceValidationMatch(manifest, { rng: itemRng, firstPlayer: 'you' });
assert.equal(itemMatch.ok, true);
let itemGame = itemMatch.game;
const itemPort = engine.createUIPort({ getGame: () => itemGame, setGame: value => { itemGame = value; } });
assert.equal(itemPort.loadGame(itemGame).ok, true);
for (let i = 0; i < 4 && itemGame.pendingReferenceChoice; i++) {
  const owner = itemGame.pendingReferenceChoice.playerId;
  const choice = engine.getLegalActions(itemGame, owner).actions.find(a => a.type === 'resolve_reference_choice');
  assert.ok(choice);
  assert.equal(itemPort.dispatch(owner, choice).ok, true);
}
const item = engine.getLegalActions(itemGame, 'you').actions.find(a => a.type === 'play_item' && itemGame.players[0].hand.some(c => c.id === a.cardId && c.name === 'ハイパーボール'));
assert.ok(item, 'search/discard item action must be generated');
const itemPlayer = itemGame.players[0];
const itemBefore = { hand: itemPlayer.hand.length, deck: itemPlayer.deck.length, discard: itemPlayer.discard.length };
const itemResult = itemPort.dispatch('you', item);
assert.equal(itemResult.ok, true, 'search/discard item must execute: ' + JSON.stringify(itemResult.errors || itemResult.stage || 'unknown'));
assert.equal(itemPlayer.hand.length, itemBefore.hand - 2, 'two discards and item consumption offset one searched card');
assert.equal(itemPlayer.deck.length, itemBefore.deck - 1, 'search removes exactly one card from deck');
assert.equal(itemPlayer.discard.length, itemBefore.discard + 3, 'two discard costs and item enter discard');
assert.equal(itemResult.transitionAudit?.conservation?.ok, true, 'item effect must preserve physical cards');
console.log('REFERENCE_SEARCH_DISCARD_ITEM PASS: hand/deck/discard conserved');
// Cross-card rule regression: energy attachment is once per turn, stadium is a real shared zone.
function openSeededReferenceMatch(initialSeed) {
  let state = initialSeed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const created = engine.createReferenceValidationMatch(manifest, { rng: random, firstPlayer: 'you' });
  assert.equal(created.ok, true);
  let game = created.game;
  const gateway = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
  assert.equal(gateway.loadGame(game).ok, true);
  for (let i = 0; i < 4 && game.pendingReferenceChoice; i++) {
    const owner = game.pendingReferenceChoice.playerId;
    const action = engine.getLegalActions(game, owner).actions.find(a => a.type === 'resolve_reference_choice');
    assert.ok(action);
    assert.equal(gateway.dispatch(owner, action).ok, true);
  }
  assert.equal(game.pendingReferenceChoice, undefined);
  return { game, gateway };
}
const energyCase = openSeededReferenceMatch(2);
const energyAction = engine.getLegalActions(energyCase.game, 'you').actions.find(a => a.type === 'attach_energy');
assert.ok(energyAction, 'legal energy attachment must exist');
const energyBefore = energyCase.game.players[0].active.energyCards.length;
const energyResult = energyCase.gateway.dispatch('you', energyAction);
assert.equal(energyResult.ok, true);
assert.equal(energyCase.game.players[0].active.energyCards.length, energyBefore + 1);
assert.equal(energyResult.transitionAudit?.conservation?.ok, true);
assert.equal(engine.getLegalActions(energyCase.game, 'you').actions.some(a => a.type === 'attach_energy'), false, 'second hand attachment must not be legal');
assert.equal(energyCase.gateway.dispatch('you', energyAction).ok, false, 'replaying energy attachment must be rejected');
const stadiumCase = openSeededReferenceMatch(8);
const stadiumAction = engine.getLegalActions(stadiumCase.game, 'you').actions.find(a => a.type === 'play_stadium');
assert.ok(stadiumAction, 'stadium play must be legal');
const stadiumResult = stadiumCase.gateway.dispatch('you', stadiumAction);
assert.equal(stadiumResult.ok, true);
assert.equal(stadiumCase.game.stadium?.name, '夜の鉱山');
assert.equal(stadiumResult.transitionAudit?.conservation?.ok, true);
console.log('REFERENCE_RULE_FAMILIES PASS: once-per-turn energy; stadium zone; conservation');
console.log('REFERENCE_FAST_SMOKE_GATE PASS');
