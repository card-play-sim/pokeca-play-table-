'use strict';
// Goods-only regression gate: every fixed-deck item must have a sourced,
// print-specific executable plan. No other card categories are modified.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const test=require('node:test');
const decks=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('data/reference-effects/plans.json','utf8'));
const runtimeSource=fs.readFileSync('engine/pokeca_reference_effect_runtime.cjs','utf8');
const goods=[...new Set(decks.decks.flatMap(d=>d.cards).filter(c=>['goods','item'].includes(c.category)).map(c=>c.name))];
test('all fixed-deck Goods have sourced executable reference plans',()=>{
  assert(goods.length>0,'no Goods found');
  const failures=[];
  for(const name of goods){
    const id=catalog.defaultValidationReferences[name];
    const r=catalog.records.find(r=>r.officialCardId===id&&r.deckName===name);
    if(!r||!['goods','item'].includes(r.category)||!r.source?.sha256||!r.mainPlan?.mechanic||!Array.isArray(r.mainPlan.commands)||!r.mainPlan.commands.length||!runtimeSource.includes('function connected(plan)'))failures.push(name);
  }
  assert.deepEqual(failures,[],'Goods missing sourced effect plans');
});
