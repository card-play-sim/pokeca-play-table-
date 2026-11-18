/* Bridge imported, verified prints into existing match engine; no new AI implementation. */
(function(root){'use strict';
function expand(deck,records,owner){
 if(deck?.playable!==true||deck?.identityStatus!=='CONFIRMED'||deck?.total!==60)throw Error('DECK_BLOCKED');
 if(!Array.isArray(deck.cards))throw Error('DECK_CARDS_MISSING');
 const lookup=Array.isArray(records)?records:Object.values(records||{});
 const result=[];
 for(const row of deck.cards){
  if(row.identityStatus!=='CONFIRMED'||!/^\d+$/.test(String(row.officialCardId))||!Number.isInteger(row.count)||row.count<1||row.count>60)throw Error('DECK_PRINT_BLOCKED');
  const found=lookup.filter(r=>r&&String(r.officialCardId)===String(row.officialCardId)&&r.name===row.name&&r.effectStatus==='verified'&&r.engineReadable===true&&typeof r.sourceEvidence==='string'&&r.sourceEvidence&&!String(r.sourceEvidence).startsWith('TEST_ONLY_'));
  if(found.length!==1)throw Error('ENGINE_PRINT_NOT_VERIFIED: '+row.name);
  for(let i=0;i<row.count;i++)result.push({...found[0],id:owner+'-'+result.length+'-'+row.officialCardId});
 }
 if(result.length!==60)throw Error('DECK_COUNT_INVALID');
 return result;
}
function createMatch(youDeck,aiDeck,records,engine,options={}){
 if(typeof engine?.createMatchFromVerifiedDecks!=='function')throw Error('ENGINE_NOT_CONNECTED');
 const you=expand(youDeck,records,'you'),ai=expand(aiDeck,records,'ai');
 const result=engine.createMatchFromVerifiedDecks({you,ai,maxOpeningAttempts:100,autoBenchBasics:true,...(options.rng?{rng:options.rng}:{}),...(options.firstPlayer?{firstPlayer:options.firstPlayer}:{})});
 if(result?.ok&&typeof engine.getLegalActions==='function'){
  const actions=engine.getLegalActions(result.game,result.game.turnPlayer);
  if(!Array.isArray(actions?.actions))return {ok:false,stage:'legal_actions',errors:['LEGAL_ACTIONS_UNAVAILABLE']};
 }
 return result;
}
root.PokecaImportedDeckMatch=Object.freeze({expand,createMatch});
})(typeof window==='undefined'?globalThis:window);
