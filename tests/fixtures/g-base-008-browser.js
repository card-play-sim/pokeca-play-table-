// Controlled mid-game fixtures use unchanged fixed decks and verified reference effects.
// Only setup uses loadGame; every tested effect is subsequently selected through DOM taps.
async options => {
 const E=Pokeca, manifest=await (await fetch('data/fixed-test-decks.json')).json();
 let seed=2;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const g=E.createReferenceValidationMatch(manifest,{rng,firstDeck:options.firstDeck||0}).game;
 delete g.pendingReferenceChoice;delete g.pendingPrizeSelection;g.turnNumber=3;g.turnPlayer='you';g.history=[];g.effectStates=[];
 const pools=g.players.map(p=>[p.active,...p.bench,...p.hand,...p.deck,...p.prizeCards].filter(Boolean));
 const take=(i,name)=>{const at=pools[i].findIndex(c=>c.name===name);if(at<0)throw Error('Missing fixture '+name);return pools[i].splice(at,1)[0];};
 const mon=c=>Object.assign(c,{cardId:c.id,damage:0,enteredTurn:0,energies:[],energyCards:[]});
 g.players.forEach((p,i)=>{
  p.active=mon(take(i,(options.active||['ロケット団のニューラ','ドラメシヤ'])[i]));
  p.bench=(options.bench?.[i]||[]).map(n=>mon(take(i,n)));
  p.hand=(options.hand?.[i]||[]).map(n=>take(i,n));p.discard=[];p.prizes=6;p.turnLimits={supporterUsed:false,abilityUses:{}};p.normalEnergyAttached=false;
  for(const [which,names] of Object.entries(options.energy?.[i]||{})){
   const target=which==='active'?p.active:p.bench[Number(which)];target.energyCards=names.map(n=>take(i,n));target.energies=target.energyCards.map(c=>c.energyType).filter(Boolean);
  }
  p.prizes=options.prizes?.[i]??6;p.prizeCards=pools[i].splice(0,p.prizes);p.deck=pools[i];
 });
 if(options.damage)for(const [i,n] of Object.entries(options.damage))g.players[Number(i)].active.damage=n;
 const loaded=PokecaMobile.port.loadGame(g);if(!loaded.ok||loaded.viewError)throw Error(JSON.stringify(loaded));
 return PokecaMobile.port.getSnapshot();
}
