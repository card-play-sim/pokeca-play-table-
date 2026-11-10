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
// Seeded opening, multi-turn, extended gameplay and cross-category regressions
// run independently in reference-effect-opening-actions, -multi-turn,
// -extended-gameplay and -cross-category CI jobs.
// Supporter effects: Judge must reset both players' hands to four cards
// while preserving all physical cards through the canonical action gateway.
let judgeSeed = 1;
const judgeRandom = () => { judgeSeed = (Math.imul(judgeSeed, 1664525) + 1013904223) >>> 0; return judgeSeed / 4294967296; };
const judgeCreated = engine.createReferenceValidationMatch(manifest, { rng: judgeRandom, firstDeck: 1, firstPlayer: 'ai' });
assert.equal(judgeCreated.ok, true);
let judgeGame = judgeCreated.game;
const judgePort = engine.createUIPort({ getGame: () => judgeGame, setGame: next => { judgeGame = next; } });
assert.equal(judgePort.loadGame(judgeGame).ok, true);
let judgeSeen = false;
for (let step = 0; step < 65 && judgeGame.status === 'active'; step++) {
  const owner = judgeGame.pendingReferenceChoice?.playerId || judgeGame.turnPlayer;
  const actions = engine.getLegalActions(judgeGame, owner).actions;
  const preferred = ['resolve_reference_choice', 'bench_basic', 'evolve', 'attach_energy', 'play_item', 'play_supporter', 'play_stadium', 'attach_tool', 'use_ability', 'attack_turn', 'take_prizes', 'retreat', 'end_turn'];
  const action = preferred.map(type => actions.find(a => a.type === type)).find(Boolean);
  if (!action) break;
  const supporter = action.type === 'play_supporter' ? judgeGame.players.find(p => p.id === owner).hand.find(c => c.id === action.cardId)?.name : null;
  const result = judgePort.dispatch(owner, action);
  assert.equal(result.ok, true, 'supporter scenario failed step=' + step);
  assert.equal(result.transitionAudit?.conservation?.ok, true);
  if (supporter === 'ジャッジマン') {
    assert.ok(judgeGame.players.every(p => p.hand.length === 4), 'Judge must leave both players with four cards');
    judgeSeen = true;
    break;
  }
}
assert.ok(judgeSeen, 'Judge supporter was not reached in seeded scenario');
console.log('REFERENCE_JUDGE_HAND_RESET PASS: both hands four; card conservation');
// Match-owned RNG must survive serialization and reproduce shuffle-dependent
// supporter effects without consuming the AI policy's independent randomness.
let deterministicSeed = 1;
const deterministicRandom = () => { deterministicSeed = (Math.imul(deterministicSeed, 1664525) + 1013904223) >>> 0; return deterministicSeed / 4294967296; };
const deterministicCreated = engine.createReferenceValidationMatch(manifest, { rng: deterministicRandom, firstDeck: 1, firstPlayer: 'ai' });
assert.equal(deterministicCreated.ok, true);
assert.ok(Number.isInteger(deterministicCreated.game.referenceRngState), 'reference match must automatically seed persisted effect RNG');
assert.ok(deterministicCreated.game.referenceRngState >= 0 && deterministicCreated.game.referenceRngState <= 0xffffffff, 'effect seed must be uint32');
let repeatSeed = 1;
const repeatRandom = () => { repeatSeed = (Math.imul(repeatSeed, 1664525) + 1013904223) >>> 0; return repeatSeed / 4294967296; };
const repeatCreated = engine.createReferenceValidationMatch(manifest, { rng: repeatRandom, firstDeck: 1, firstPlayer: 'ai' });
assert.equal(repeatCreated.ok, true);
assert.equal(JSON.stringify(repeatCreated.game), JSON.stringify(deterministicCreated.game), 'same setup seed must reproduce the entire opening game and effect seed');

let deterministicGame = deterministicCreated.game;
const deterministicPort = engine.createUIPort({ getGame: () => deterministicGame, setGame: next => { deterministicGame = next; } });
assert.equal(deterministicPort.loadGame(deterministicGame).ok, true);
let replayedShuffle = false;
for (let step = 0; step < 65 && deterministicGame.status === 'active'; step++) {
  const owner = deterministicGame.pendingReferenceChoice?.playerId || deterministicGame.turnPlayer;
  const actions = engine.getLegalActions(deterministicGame, owner).actions;
  const preferred = ['resolve_reference_choice', 'bench_basic', 'evolve', 'attach_energy', 'play_item', 'play_supporter', 'play_stadium', 'attach_tool', 'use_ability', 'attack_turn', 'take_prizes', 'retreat', 'end_turn'];
  const action = preferred.map(type => actions.find(a => a.type === type)).find(Boolean);
  if (!action) break;
  const supporter = action.type === 'play_supporter' ? deterministicGame.players.find(p => p.id === owner).hand.find(c => c.id === action.cardId)?.name : null;
  if (supporter === 'ジャッジマン') {
    const snapshot = JSON.parse(JSON.stringify(deterministicGame));
    snapshot.referenceRngState = 123456;
    const replay = () => {
      let game = JSON.parse(JSON.stringify(snapshot));
      const port = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
      assert.equal(port.loadGame(game).ok, true);
      const outcome = port.dispatch(owner, action);
      assert.equal(outcome.ok, true);
      assert.equal(outcome.transitionAudit?.conservation?.ok, true);
      return game;
    };
    const first = replay(), second = replay();
    assert.equal(JSON.stringify(first), JSON.stringify(second), 'saved RNG state must reproduce shuffle and resulting game');
    assert.notEqual(first.referenceRngState, snapshot.referenceRngState, 'shuffle must advance persisted RNG');
    assert.ok(first.players.every(p => p.hand.length === 4), 'Judge must draw four for both players');
    replayedShuffle = true;
    break;
  }
  assert.equal(deterministicPort.dispatch(owner, action).ok, true, 'RNG scenario step failed ' + step);
}
assert.ok(replayedShuffle, 'deterministic RNG scenario did not reach a shuffle');
console.log('REFERENCE_DETERMINISTIC_RNG PASS: serialized match replay, shuffle and Judge hands');
// A mid-game JSON snapshot must replay multiple subsequent actions and
// preserve the match-owned effect RNG stream across a fresh UI port.
let continuationSeed = 7;
const continuationRandom = () => { continuationSeed = (Math.imul(continuationSeed, 1664525) + 1013904223) >>> 0; return continuationSeed / 4294967296; };
const continuationCreated = engine.createReferenceValidationMatch(manifest, { rng: continuationRandom, firstDeck: 1, firstPlayer: 'ai' });
assert.equal(continuationCreated.ok, true);
let continuationGame = continuationCreated.game;
const continuationPort = engine.createUIPort({ getGame: () => continuationGame, setGame: next => { continuationGame = next; } });
assert.equal(continuationPort.loadGame(continuationGame).ok, true);
const continuationPreference = ['resolve_reference_choice', 'bench_basic', 'evolve', 'attach_energy', 'play_item', 'play_supporter', 'play_stadium', 'attach_tool', 'use_ability', 'attack_turn', 'take_prizes', 'retreat', 'end_turn'];
const nextContinuationAction = game => {
  const owner = game.pendingReferenceChoice?.playerId || game.turnPlayer;
  const actions = engine.getLegalActions(game, owner).actions;
  return { owner, action: continuationPreference.map(type => actions.find(a => a.type === type)).find(Boolean) };
};
for (let step = 0; step < 15; step++) {
  const { owner, action } = nextContinuationAction(continuationGame);
  assert.ok(action, 'midgame setup action ' + step);
  assert.equal(continuationPort.dispatch(owner, action).ok, true);
}
const continuationSnapshot = JSON.parse(JSON.stringify(continuationGame));
const resumeContinuation = () => {
  let game = JSON.parse(JSON.stringify(continuationSnapshot));
  const port = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
  assert.equal(port.loadGame(game).ok, true);
  let actionsDone = 0;
  for (; actionsDone < 28 && game.status === 'active'; actionsDone++) {
    const { owner, action } = nextContinuationAction(game);
    if (!action) break;
    const outcome = port.dispatch(owner, action);
    assert.equal(outcome.ok, true, 'restored action ' + actionsDone);
    assert.equal(outcome.transitionAudit?.conservation?.ok, true);
  }
  return { game, actionsDone };
};
const resumedA = resumeContinuation(), resumedB = resumeContinuation();
assert.equal(resumedA.actionsDone, 28, 'saved match must continue through 28 legal actions');
assert.equal(JSON.stringify(resumedA.game), JSON.stringify(resumedB.game), 'serialized match replay must reproduce complete later game');
assert.notEqual(resumedA.game.referenceRngState, continuationSnapshot.referenceRngState, 'continued effect shuffles must advance persisted RNG');
console.log('REFERENCE_SAVED_MATCH_REPLAY PASS: 15 setup actions, 28 resumed actions, deterministic RNG');
// Reject corrupted persisted RNG state before dispatch; never mutate the game.
{
  let state = JSON.parse(JSON.stringify(continuationSnapshot));
  state.referenceRngState = -1;
  const port = engine.createUIPort({ getGame: () => state, setGame: next => { state = next; } });
  const before = JSON.stringify(state);
  const load = port.loadGame(state);
  assert.equal(load.ok, false, 'corrupt persisted RNG must fail at canonical load');
  assert.ok(load.errors.includes('INVALID_REFERENCE_RNG_STATE'), 'invalid RNG load error must be explicit');
  assert.equal(JSON.stringify(state), before, 'invalid RNG load must not mutate saved game');
}
console.log('REFERENCE_RNG_INTEGRITY PASS: corrupt RNG rejected without state mutation');
// Invalid actions must never mutate the authoritative game state.
const snapshot = JSON.stringify(currentGame);
const rejected = port.dispatch(currentGame.turnPlayer, { type: 'nonexistent_reference_action' });
assert.equal(rejected.ok, false, 'unknown action must be rejected');
assert.equal(JSON.stringify(currentGame), snapshot, 'rejected action must not mutate the game');
console.log('REFERENCE_GATEWAY_ROLLBACK PASS');
console.log('REFERENCE_RUNTIME_BUNDLE_GATE PASS:', coverage.prints, 'prints;', coverage.defaults.length, 'default print references; no adoption');
