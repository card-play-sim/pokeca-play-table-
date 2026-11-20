'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const ctx={window:{},console,performance,setTimeout};
vm.runInNewContext(fs.readFileSync('ui/engine.bundle.js','utf8'),ctx);
const engine=ctx.window.Pokeca;
const catalog=JSON.parse(fs.readFileSync('data/effect-extensions/compiled.json'));
const results={};

function fixture(print,prepare=()=>{}){
  const record=catalog.records.find(row=>row.officialCardId===print);
  assert(record?.mainPlan,print);
  const manifest=JSON.parse(fs.readFileSync('data/fixed-test-decks.json'));
  const slot=manifest.decks[0].cards.find(row=>row.name==='ハイパーボール');
  Object.assign(slot,{name:record.deckName,category:record.category,referenceOfficialCardId:print});
  let seed=20;
  const match=engine.createReferenceValidationMatch(manifest,{rng:()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296)});
  assert(match.ok);
  let game=match.game;
  delete game.pendingReferenceChoice;
  game.turnNumber=3;
  game.turnPlayer='you';
  const player=game.players[0];
  const take=(predicate)=>player.deck.splice(player.deck.findIndex(predicate),1)[0];
  const card=player.hand.find(card=>card.validationReference.officialCardId===print)||
    take(card=>card.validationReference.officialCardId===print);
  if(!player.hand.includes(card))player.hand.push(card);
  assert.equal(card.validationReference.officialCardId,print);
  prepare(game,player,take);
  const port=engine.createUIPort({getGame:()=>game,setGame:next=>game=next});
  assert(port.loadGame(game).ok);
  const snapshot=()=>port.getResumeSnapshot().game;
  const option=()=>port.getHandOptions('you',card.id).find(row=>row.action.type.startsWith('play_'));
  return {port,snapshot,option,card,
    reject(action){
      const before=JSON.stringify(snapshot());
      assert(!port.dispatch('you',action).ok);
      assert.equal(JSON.stringify(snapshot()),before);
    },
    execute(action=option().action){
      assert(option().ok,JSON.stringify(option()));
      const result=port.dispatch('you',action);
      assert(result.ok,JSON.stringify(result));
      const save=port.getResumeSnapshot();
      const restored=port.restoreSession(save);
      assert(restored.ok,JSON.stringify(restored));
      assert.equal(JSON.stringify(snapshot()),JSON.stringify(save.game));
      results[print]='PASS';
      return snapshot();
    }
  };
}

const healthy=fixture('47174');
assert(!healthy.option().ok);
for(const print of ['47174','47732']){
  const test=fixture(print,(game,player)=>{
    player.active.damage=70;
    player.active.statusCondition='POISONED';
    player.active.referenceCannotAttackTurn=game.turnNumber;
  });
  const option=test.option();
  test.reject({...option.action,selections:{cards:[test.snapshot().players[1].active.id]}});
  const after=test.execute();
  assert.equal(after.players[0].active.damage,10);
  assert.equal(after.players[0].active.statusCondition,null);
  assert.equal(after.players[0].active.referenceCannotAttackTurn,3);
  assert.equal(after.players[0].turnLimits.supporterUsed,true);
}
const scoop=fixture('48251',(_game,player)=>player.discard.push(...player.deck.splice(1)));
const last=scoop.snapshot().players[0].deck[0].id;
const afterScoop=scoop.execute().players[0];
assert.equal(afterScoop.deck.length,0);
assert(afterScoop.discard.some(card=>card.id===last));

const recycle=fixture('50782',(_game,player,take)=>{
  player.discard.push(take(card=>card.kind==='energy'&&!card.isSpecial));
  player.discard.push(take(card=>card.kind==='pokemon'));
});
const recyclables=recycle.option().requests[0].candidates;
assert.equal(recyclables.length,1);
const nonEnergy=recycle.snapshot().players[0].discard.find(card=>card.kind==='pokemon');
recycle.reject({...recycle.option().action,selections:{cards:[nonEnergy.id]}});
assert(recycle.execute().players[0].deck.some(card=>card.id===recyclables[0].id));

for(const print of ['48340','50502','49378']){
  const search=fixture(print);
  const request=search.option().requests[0];
  assert(request.inspection.cards.length>request.candidates.length);
  assert(request.candidates.length>0);
  const allowed=request.candidates[0].id;
  const forbidden=request.inspection.cards.find(card=>!request.candidates.some(candidate=>candidate.id===card.id));
  search.reject({...search.option().action,selections:{cards:[forbidden.id]}});
  assert(search.execute({...search.option().action,selections:{cards:[allowed]}}).players[0].hand.some(card=>card.id===allowed));
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(results,null,2)+'\n');
console.log('I/J effect execution and exact restore:',JSON.stringify(results));
