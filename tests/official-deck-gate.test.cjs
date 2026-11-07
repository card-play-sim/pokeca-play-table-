/* Run with: node tests/official-deck-gate.test.cjs */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('ui/official-deck-gate.js','utf8'),context);
const gate=context.window.PokecaOfficialDeckGate;
const deck=(cards)=>({name:'test',cards});
const card=(name,count=4)=>({name,count,category:'pokemon',officialCardId:'123',identityStatus:'CONFIRMED'});
const record={123:{name:'A',cardType:'pokemon',hp:70,pokemonStage:'たね',attacks:[],abilities:[]}};
const art={123:{name:'A',sourceUrl:'https://www.pokemon-card.com/assets/images/card_images/large/test.jpg'}};
const effect={123:{engineReadable:true,officialCardId:'123'}};
const ready=()=>gate.validate(deck([card('A',60)]),record,art,effect);
assert.equal(ready().ready,false); // 60 copies of one non-energy card violate the four-copy limit
assert.equal(gate.validate(deck([card('A',59)]),record,art,effect).ready,false);
assert.equal(gate.validate(deck([{...card('A'),officialCardId:null}]),record,art,effect).ready,false);
assert.equal(gate.validate(deck([{...card('A'),identityStatus:'UNCONFIRMED'}]),record,art,effect).ready,false);
assert.equal(gate.validate(deck([card('B')]),record,art,effect).ready,false);
assert.equal(gate.validate(deck([card('A')]),{123:{...record[123],hp:0}},art,effect).ready,false);
assert.equal(gate.validate(deck([card('A')]),record,{},effect).ready,false);
assert.equal(gate.validate(deck([card('A')]),record,art,{}).ready,false);
assert.equal(gate.validatePair([deck([card('A')]),deck([card('A')])],record,art,effect).ready,true);
assert.equal(gate.validatePair([deck([card('A')]),deck([card('B')])],record,art,effect).ready,false);
assert.equal(gate.validatePair([deck([card('A')])],record,art,effect).ready,false);
assert.equal(gate.validate(deck([null]),record,art,effect).ready,false);
assert.equal(gate.validate(deck([card('A',60)]),{123:{...record[123],cardType:'item'}},art,effect).ready,false);
console.log('Official deck readiness gate: fail-closed checks passed');
