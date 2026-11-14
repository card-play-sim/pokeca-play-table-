'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../ui/engine.bundle.js'), 'utf8');
const sandbox = { window: {}, performance: require('node:perf_hooks').performance, setTimeout };
vm.runInNewContext(source, sandbox, { filename: 'engine.bundle.js', timeout: 10000 });
const engine = sandbox.window.Pokeca;
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/fixed-test-decks.json'), 'utf8'));
let checked = 0;
for (const firstDeck of [0, 1]) {
  for (let initialSeed = 1; initialSeed <= 150; initialSeed++) {
    let seed = initialSeed;
    const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const created = engine.createReferenceValidationMatch(manifest, { rng, firstDeck, firstPlayer: firstDeck ? 'ai' : 'you' });
    assert.equal(created.ok, true, 'creation seed=' + initialSeed);
    let game = created.game;
    const gateway = engine.createUIPort({ getGame: () => game, setGame: next => { game = next; } });
    assert.equal(gateway.loadGame(game).ok, true);
    for (let i = 0; i < 4 && game.pendingReferenceChoice; i++) {
      const actor = game.pendingReferenceChoice.playerId;
      const choice = engine.getLegalActions(game, actor).actions.find(a => a.type === 'resolve_reference_choice');
      assert.ok(choice);
      assert.equal(gateway.dispatch(actor, choice).ok, true);
    }
    assert.equal(game.pendingReferenceChoice, undefined);
    const actor = game.turnPlayer;
    const before = JSON.stringify(game);
    const forbidden = gateway.dispatch(actor, { type: 'attack_turn', attackIndex: 0 });
    assert.equal(forbidden.ok, false, 'first turn attack accepted seed=' + initialSeed);
    assert.ok(forbidden.errors?.some(error => error.includes('FIRST_PLAYER_FIRST_TURN_ATTACK')), 'attack must be rejected for the actual first-turn rule, not for a different reason: ' + JSON.stringify(forbidden.errors));
    assert.equal(JSON.stringify(game), before, 'rejected attack mutated state seed=' + initialSeed);
    const end = engine.getLegalActions(game, actor).actions.find(a => a.type === 'end_turn');
    assert.ok(end);
    const result = gateway.dispatch(actor, end);
    assert.equal(result.ok, true);
    assert.equal(result.transitionAudit?.conservation?.ok, true);
    checked++;
  }
}
assert.equal(checked, 200);
console.log('REFERENCE_OPENING_REJECTION_INTEGRITY PASS:', checked, 'seeded opening games');
