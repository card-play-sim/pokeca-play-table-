'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{},performance,console,Math,setTimeout};vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),ctx);
const E=ctx.window.Pokeca,manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json'));
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const firstDeck of [0,1]){
 let tested=false,mulligan=false;
 for(let seed=1;seed<=300;seed++){
  const make=choices=>E.createReferenceValidationMatch(manifest,{firstDeck,rng:rng(seed),startingBench:{you:[]},...choices});
  const preview=make({});assert(preview.ok);const p=preview.game.players[0],hand=[p.active,...p.hand],basics=hand.filter(c=>c.kind==='pokemon'&&c.basic);
  assert.equal(hand.length,7);assert.equal(p.bench.length,0);
  if(preview.mulligans.you>0){mulligan=true;assert(basics.length);const diff=preview.mulligans.you-preview.mulligans.ai;assert.equal(preview.game.pendingReferenceChoice?.options.length||0,diff?Math.abs(diff)+1:0);}
  if(basics.length<2||!hand.some(c=>c.kind==='pokemon'&&!c.basic))continue;
  const active=basics[1].id,bench=basics[0].id;
  for(const selectedBench of [[],[bench]]){
   const result=make({startingActive:{you:active},startingBench:{you:selectedBench}});assert(result.ok);
   assert.equal(result.game.players[0].active.id,active);assert.equal(result.game.players[0].bench.length,selectedBench.length);
   assert.equal(JSON.stringify(result.game.players[1]),JSON.stringify(preview.game.players[1]),'AI placement is unchanged');
   const port=E.createUIPort({getGame:()=>result.game,setGame:g=>result.game=g});assert(port.loadGame(result.game).ok);const before=JSON.stringify(port.getSnapshot());assert(port.restoreSession(port.getResumeSnapshot()).ok);assert.equal(JSON.stringify(port.getSnapshot()),before);
   for(const player of result.game.players){const cards=[player.active,...player.bench,...player.hand,...player.deck,...player.prizeCards];assert.equal(cards.length,60);assert.equal(new Set(cards.map(c=>c.id)).size,60);}
  }
  const evolution=hand.find(c=>c.kind==='pokemon'&&!c.basic).id;
  for(const opts of [{startingActive:{you:evolution}},{startingActive:{you:null}},{startingBench:{you:[evolution]}},{startingBench:{you:[bench,bench]}},{startingBench:{you:['1','2','3','4','5','6']}},{startingActive:{you:active},startingBench:{you:[active]}}])assert.throws(()=>make(opts));
  tested=true;if(mulligan)break;
 }
 assert(tested&&mulligan,'both manual choices and real mulligans covered for deck '+firstDeck);
}
for(const [cards,rule,good,bad] of [
 [[{id:'a',kind:'pokemon'},{id:'b',kind:'pokemon'},{id:'c',kind:'energy'}],{kind:'distinct',field:'kind'},['a','c'],['a','b']],
 [[{id:'a',energyType:'炎'},{id:'b',energyType:'炎'},{id:'c',energyType:'悪'}],{kind:'distinct',field:'energyType'},['a','c'],['a','b']],
 [[{id:'a',basic:true},{id:'b',basic:true},{id:'c',basic:false}],{kind:'maxWhen',field:'basic',equals:false,max:1},['a','b'],['a','c']]
]){assert(E.isSelectionAllowed(cards,good,[rule]));assert(!E.isSelectionAllowed(cards,bad,[rule]));assert(!E.isSelectionAllowed(cards,['missing'],[rule]));assert(!E.isSelectionAllowed(cards,['a'],[{kind:'unknown'}]));}
console.log('PASS manual opening, both fixed decks, mulligans, AI placement, invalid setup rejection, save restore and shared selection constraints');
