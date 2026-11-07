'use strict';
// Runtime test: actual bundled engine, authoritative state, and UI view.
// Synthetic practice cards only; not evidence of official-card integration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = {window: {}, console, performance};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ui/engine.bundle.js'), 'utf8'), context);
const Pokeca = context.window.Pokeca;
let game = Pokeca.createPracticeGame(1);
let renders = 0;
const port = Pokeca.createUIPort({
  getGame: () => game,
  setGame: next => { game = next; },
  onChange: () => { renders++; },
  onSessionChange: () => {}
});
assert.equal(port.loadGame(game).ok, true, 'practice game must load');
const before = port.getSnapshot();
const you = before.players.find(p => p.id === 'you');
const card = you.hand.find(c => c.id === 'hand-basic');
assert.ok(card, 'practice Basic in hand');
const beforeView = port.getView('you').players.find(p => p.id === 'you');
const action = {type: 'bench_basic', cardId: card.id};
assert.equal(port.canDispatch('you', action), true, 'placement must be legal');
const result = port.dispatch('you', action);
assert.equal(result.ok, true, JSON.stringify(result.errors || result));
const after = port.getSnapshot().players.find(p => p.id === 'you');
const afterView = port.getView('you').players.find(p => p.id === 'you');
assert.equal(after.hand.length, you.hand.length - 1, 'hand decreases exactly once');
assert.equal(after.bench.length, you.bench.length + 1, 'bench increases exactly once');
assert.equal(after.hand.some(c => c.id === card.id), false, 'card leaves hand');
assert.equal(after.bench.filter(c => c.id === card.id).length, 1, 'same instance enters bench once');
assert.equal(afterView.handCount, beforeView.handCount - 1, 'UI hand count reflects authoritative state');
assert.equal(afterView.bench.some(c => c.id === card.id), true, 'UI bench reflects authoritative state');
assert.ok(renders >= 2, 'load and successful action must notify renderer');
const repeat = port.dispatch('you', action);
assert.equal(repeat.ok, false, 'same card cannot be played twice');
assert.equal(port.getSnapshot().players.find(p => p.id === 'you').bench.length, after.bench.length);
console.log('PASS: bench_basic hand -1, bench +1, UI view synchronized, replay rejected');
