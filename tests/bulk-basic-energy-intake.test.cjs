'use strict';
const assert = require('node:assert/strict');
const {selectIds, verifiedBasicException} = require('../scripts/list-card-auto-connect-ids.cjs');
const {allExecuted, verifiedBasicEnergy, requiredSlots} =
  require('../scripts/stage-card-auto-connect.cjs');
const B = require('../scripts/lib/shared-effect-batch.cjs');
const basic = (id, overrides = {}) => ({
  officialCardId:id, name:'基本炎エネルギー', category:'energy',
  regulationMark:'G', basicEnergy:true, legality:'official-basic-energy-exception',
  source:{heading:'基本エネルギー'}, ...overrides
});
const source = {records:[
  {officialCardId:'50001', regulationMark:'J', legality:'printed-hij'},
  {officialCardId:'46001', regulationMark:'I', legality:'printed-hij'},
  {officialCardId:'45001', regulationMark:'H', legality:'printed-hij'},
  basic('42945'),
  basic('42946',{name:'架空エネルギー'}),
  basic('42947',{basicEnergy:false}),
  basic('42948',{source:{heading:'特殊エネルギー'}}),
  basic('42949',{category:'support'}),
  basic('42950',{legality:'unverified'}),
  basic('not-an-id'),
  basic('42945')
]};
const {ids,invalid} = selectIds(source, new Set(['46001']));
assert.deepEqual(ids,['42945','50001','45001']);
assert.deepEqual(invalid.map(x=>x.officialCardId),['not-an-id']);
assert(verifiedBasicException(basic('42945')));
assert(!verifiedBasicException(basic('42947',{basicEnergy:false})));
assert(!verifiedBasicException(basic('42948',{source:{heading:'特殊エネルギー'}})));
assert(!verifiedBasicException(basic('42950',{legality:'unverified'})));
const record={
  officialCardId:'42945',name:'基本炎エネルギー', category:'energy',
  officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/42945',
  mainPlan:{mechanic:'BASIC_ENERGY',commands:['ATTACH_ENERGY']},
  facts:{basicEnergyType:'炎'},text:'',attacks:[],abilities:[]
};
assert(verifiedBasicEnergy(record,basic('42945')));
assert(!verifiedBasicEnergy({...record,facts:{basicEnergyType:'超'}},basic('42945')));
assert(!verifiedBasicEnergy({...record,mainPlan:{mechanic:'IGNITION'}},basic('42945')));
assert(!verifiedBasicEnergy({...record,text:'draw three cards'},basic('42945')));
assert(!verifiedBasicEnergy({...record,attacks:[{}]},basic('42945')));
assert(!verifiedBasicEnergy(record,basic('42945',{basicEnergy:false})));
const slots=requiredSlots(record);
assert.equal(slots.length,1);
assert.equal(slots[0].effectText,'');
const succeeded=new Map([[B.slot(slots[0]),'SUCCEEDED']]);
assert.equal(allExecuted(slots,succeeded),false,'empty-text print cannot pass the text effect gate');
assert.equal(allExecuted(slots,succeeded,true),true,'a runtime-verified basic energy may pass');
assert.equal(allExecuted(slots,new Map(),true),false,'no execution receipt must remain BLOCKED');
assert.equal(allExecuted([{...slots[0],effectKind:'supporter'}],succeeded,true),false);
console.log('PASS: exact official basic energy intake/strict release scope; no unverified legacy card or no-op promotion');
