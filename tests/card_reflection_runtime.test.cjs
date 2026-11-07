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

const energyBefore = port.getSnapshot().players.find(p => p.id === 'you');
const energyCardIndex = energyBefore.hand.findIndex(c => c.id === 'hand-energy');
assert.ok(energyCardIndex >= 0, 'practice energy remains in hand');
const energyId = energyBefore.hand[energyCardIndex].id;
const targetIndex = energyBefore.bench.findIndex(c => c.id === 'hand-basic');
assert.ok(targetIndex >= 0, 'placed Basic remains on bench');
const attachAction = {type: 'attach_energy', cardIndex: energyCardIndex, target: targetIndex};
assert.equal(port.canDispatch('you', attachAction), true, 'first energy attachment must be legal');
const attachResult = port.dispatch('you', attachAction);
assert.equal(attachResult.ok, true, JSON.stringify(attachResult.errors || attachResult));
const energyAfter = port.getSnapshot().players.find(p => p.id === 'you');
const attachedPokemon = energyAfter.bench.find(c => c.id === 'hand-basic');
const energyView = port.getView('you').players.find(p => p.id === 'you');
const visiblePokemon = energyView.bench.find(c => c.id === 'hand-basic');
assert.equal(energyAfter.hand.length, energyBefore.hand.length - 1, 'energy leaves hand');
assert.equal(attachedPokemon.energyCards.filter(c => c.id === energyId).length, 1, 'physical energy attached exactly once');
assert.equal(attachedPokemon.energies.length, 1, 'energy type projection updated');
assert.equal(energyView.handCount, beforeView.handCount - 2, 'UI count reflects Basic and energy leaving hand');
assert.equal(visiblePokemon.energyCards.some(c => c.id === energyId), true, 'UI receives attached energy identity');
assert.equal(energyAfter.normalEnergyAttached, true, 'once-per-turn energy limit marked');
const secondIndex = energyAfter.hand.findIndex(c => c.kind === 'energy');
assert.ok(secondIndex >= 0, 'second energy exists for limit check');
const beforeRejectedEnergy = JSON.stringify(port.getSnapshot());
const secondResult = port.dispatch('you', {type: 'attach_energy', cardIndex: secondIndex, target: targetIndex});
assert.equal(secondResult.ok, false, 'second normal energy attachment must be rejected');
assert.equal(port.getSnapshot().players.find(p => p.id === 'you').hand.length, energyAfter.hand.length, 'failed action must not remove energy');
assert.equal(JSON.stringify(port.getSnapshot()), beforeRejectedEnergy, 'rejected energy action must preserve entire authoritative state');
console.log('PASS: attach_energy hand -1, physical energy attached, UI view synchronized, second attachment rejected');



const evolutionGame = Pokeca.createPracticeGame(1);
const evoPlayer = evolutionGame.players.find(p => p.id === 'you');
const basicIndex = evoPlayer.hand.findIndex(c => c.id === 'hand-basic');
const basicForEvolution = evoPlayer.hand.splice(basicIndex, 1)[0];
evoPlayer.bench.push({...basicForEvolution, enteredTurn: 1, damage: 0, energyCards: [], energies: [], evolutionCards: []});
let evolutionState = evolutionGame;
const evolutionPort = Pokeca.createUIPort({
  getGame: () => evolutionState,
  setGame: next => { evolutionState = next; },
  onChange: () => {},
  onSessionChange: () => {}
});
assert.equal(evolutionPort.loadGame(evolutionGame).ok, true, 'synthetic evolution setup must load');
const evolutionBefore = evolutionPort.getSnapshot().players.find(p => p.id === 'you');
const evoCard = evolutionBefore.hand.find(c => c.id === 'hand-evolution');
const evoAction = {type: 'evolve', cardId: evoCard.id, targetInstanceId: 'hand-basic'};
assert.equal(evolutionPort.canDispatch('you', evoAction), true, 'evolution after earlier turn must be legal');
const evoResult = evolutionPort.dispatch('you', evoAction);
assert.equal(evoResult.ok, true, JSON.stringify(evoResult.errors || evoResult));
const evolutionAfter = evolutionPort.getSnapshot().players.find(p => p.id === 'you');
const evolved = evolutionAfter.bench.find(c => c.id === 'hand-basic');
const evolvedView = evolutionPort.getView('you').players.find(p => p.id === 'you').bench.find(c => c.id === 'hand-basic');
assert.equal(evolutionAfter.hand.length, evolutionBefore.hand.length - 1, 'evolution card leaves hand');
assert.equal(evolved.evolutionCards.filter(c => c.id === evoCard.id).length, 1, 'physical evolution card tracked');
assert.equal(evolved.name, evoCard.name, 'evolved Pokemon display name changes');
assert.equal(evolved.hp, evoCard.hp, 'evolved Pokemon HP changes');
assert.equal(evolvedView.name, evoCard.name, 'UI projection displays evolution');
assert.equal(evolvedView.evolutionCards.some(c => c.id === evoCard.id), true, 'UI projection includes physical evolution card');
assert.equal(evolved.evolvedTurn, evolutionGame.turnNumber, 'evolution turn is recorded');
console.log('PASS: evolve hand -1, physical evolution retained, name/HP and UI view synchronized');

const illegalGame = Pokeca.createPracticeGame(1);
const illegalPlayer = illegalGame.players.find(p => p.id === 'you');
const illegalBasicIndex = illegalPlayer.hand.findIndex(c => c.id === 'hand-basic');
const illegalBasic = illegalPlayer.hand.splice(illegalBasicIndex, 1)[0];
illegalPlayer.bench.push({...illegalBasic, enteredTurn: illegalGame.turnNumber, energyCards: [], energies: []});
let illegalState = illegalGame;
const illegalPort = Pokeca.createUIPort({
  getGame: () => illegalState,
  setGame: next => { illegalState = next; },
  onChange: () => {},
  onSessionChange: () => {}
});
assert.equal(illegalPort.loadGame(illegalGame).ok, true, 'same-turn evolution setup must load');
const illegalBefore = JSON.stringify(illegalPort.getSnapshot());
const illegalResult = illegalPort.dispatch('you', evoAction);
assert.equal(illegalResult.ok, false, 'Pokemon entering this turn cannot evolve');
assert.equal(JSON.stringify(illegalPort.getSnapshot()), illegalBefore, 'rejected evolution must preserve entire state');
console.log('PASS: same-turn evolution rejected without state changes');
