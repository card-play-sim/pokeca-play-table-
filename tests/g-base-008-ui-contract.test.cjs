'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'mobile.js'), 'utf8');

// Guard the actual browser entry points against regressions. These source-contract
// checks are NOT substitutes for Chromium interaction tests or live-match evidence.
test('deck-search UI delegates selection and legality to the engine', () => {
  assert.match(source, /function selectDeckSearch\(/);
  assert.match(source, /port\.getActionExplanation\('you',\{\.\.\.a,selectedCardIds:probeIds\}\)/);
  assert.match(source, /dispatch\('you',\{\.\.\.a,selectedCardIds:ids\}\)/);
  assert.match(source, /sheet\.addEventListener\('close',cancel\)/);
  assert.match(source, /disabled:!allowed/);
});
test('ability targeting uses legal engine options and shared selector', () => {
  assert.match(source, /port\.getPokemonActions\('you',id\)\.filter\(o=>o\.kind==='ability'/);
  assert.match(source, /await resolveOption\(legal\[0\]\)/);
  assert.match(source, /if\(option\.targets\)/);
  assert.match(source, /action\.targetIds=id/);
  assert.doesNotMatch(source, /特性の対象選択は未対応/);
});
test('switch and search choices are dispatched through one guarded path', () => {
  assert.match(source, /function dispatch\(playerId,action\)/);
  assert.match(source, /const result=port\.dispatch\(playerId,action\)/);
  assert.match(source, /getHandOptions\('you',id\)/);
  assert.match(source, /resolveOption\(option\)/);
});
test('save and restore use the existing session contract', () => {
  assert.match(source, /port\.getResumeSnapshot\(\)/);
  assert.match(source, /store\.save\(snapshot\)/);
  assert.match(source, /port\.restoreSession\(await store\.read\(item\.matchId\)\)/);
  assert.match(source, /if\(!result\.ok\)throw Error/);
});
