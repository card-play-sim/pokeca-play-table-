'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json','utf8'));
const ctx={};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('ui/fixed-120-match-adapter.js','utf8'),ctx);
const api=ctx.PokecaFixed120;
const all=[...new Set(manifest.decks.flatMap(d=>d.cards.map(c=>c.name)))];
assert.equal(all.length,45);
assert.throws(()=>api.createMatch(manifest,{},{}),/対戦エンジン未接続/);
const engine={createMatchFromVerifiedDecks:({you,ai})=>{
  assert.equal(you.length,60);assert.equal(ai.length,60);
  assert.equal(new Set([...you,...ai].map(c=>c.id)).size,120);
  return {ok:true};
}};
assert.throws(()=>api.createMatch(manifest,{},engine),/公式カード未接続/);
const records=Object.fromEntries(all.map((name,i)=>[name,{
  name,verified:true,officialCardId:String(i+1),kind:'trainer',
  effectStatus:'verified',engineReadable:true,sourceEvidence:'test-only'
}]));
assert.equal(api.createMatch(manifest,records,engine).ok,true);
records[all[0]].engineReadable=false;
assert.throws(()=>api.createMatch(manifest,records,engine),/公式効果未接続/);
records[all[0]].engineReadable=true;
records[all[0]].officialCardId=null;
assert.throws(()=>api.createMatch(manifest,records,engine),/公式カード未接続/);
console.log('Fixed 120 adapter: 120 physical IDs, 45 types, rejection gates PASS (synthetic test fixtures only)');
