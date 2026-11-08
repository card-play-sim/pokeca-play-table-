/* Manual practice through the existing engine. Reference facts are not adopted prints/effects. */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  function create(manifest,facts,engine,{rng=Math.random,firstDeck=0}={}){
    if(manifest?.decks?.length!==2||facts?.schemaVersion!==1||facts.mode!=='manual-practice-reference-facts'||facts.adoptedPrints!==0||facts.officialEffectsConnected!==false||!Array.isArray(facts.records)||![0,1].includes(firstDeck))throw Error('FIXED_PRACTICE_SCHEMA');
    const records=new Map(facts.records.map(c=>[c.name,c]));
    if(records.size!==facts.records.length)throw Error('FIXED_PRACTICE_DUPLICATE');
    const game=engine.createPracticeGame();
    const order=firstDeck?[1,0]:[0,1];
    for(let i=0;i<2;i++){
      const deck=manifest.decks[order[i]],player=game.players[i],cards=[];
      const kinds={pokemon:'pokemon',energy:'energy',goods:'trainer',support:'trainer',supporter:'trainer',item:'trainer',tool:'tool',stadium:'stadium'};
      for(const entry of deck.cards){
        const record=records.get(entry.name);
        if(entry.officialCardId!=null||entry.catalogCardId!=null||entry.identityStatus==='CONFIRMED')throw Error('FIXED_PRACTICE_CONFIRMED_ENTRY');
        if(!record||record.category!==entry.category||record.officialCardId!==null||record.catalogCardId!==null||record.identityStatus!=='UNCONFIRMED'||record.effectStatus!=='UNIMPLEMENTED'||!kinds[entry.category]||!Number.isInteger(entry.count)||entry.count<1)throw Error('FIXED_PRACTICE_FACTS_'+entry.name);
        for(let n=0;n<entry.count;n++){
          const card={id:`fixed-practice-${i}-${cards.length}`,name:entry.name,kind:kinds[entry.category],identityStatus:'UNCONFIRMED',effectStatus:'UNIMPLEMENTED',
            practiceReference:{officialCardId:record.referenceOfficialCardId,source:copy(record.source)},fixtureNote:'暫定参照版の基本情報。正式採用版・公式効果は未確定／未接続。'};
          if(card.kind==='pokemon'){
            if(!Number.isInteger(record.hp)||record.hp<=0||typeof record.basic!=='boolean'||!Number.isInteger(record.stage)||record.basic!==(record.stage===0)||record.stage<0||record.stage>2||!Number.isInteger(record.retreatCost)||record.retreatCost<0||(!record.basic&&!record.evolvesFrom))throw Error('FIXED_PRACTICE_POKEMON_'+card.name);
            Object.assign(card,{species:card.name,hp:record.hp,basic:record.basic,stage:record.stage,retreatCost:record.retreatCost,evolvesFrom:record.evolvesFrom,attacks:[],abilities:[]});
          }else if(card.kind==='energy'){
            if(record.isSpecial){card.cardType='SPECIAL_ENERGY';card.isSpecial=true;}
            else {if(!['炎','超','悪'].includes(record.energyType))throw Error('FIXED_PRACTICE_ENERGY');card.energyType=record.energyType;}
          }else if(card.kind==='trainer'){card.cardType=['support','supporter'].includes(entry.category)?'SUPPORTER':'ITEM';card.commands=[];}
          cards.push(card);
        }
      }
      if(cards.length!==60)throw Error('FIXED_PRACTICE_COUNT');
      for(let n=cards.length-1;n>0;n--){const v=rng();if(!Number.isFinite(v)||v<0||v>=1)throw Error('FIXED_PRACTICE_RNG');const j=Math.floor(v*(n+1));[cards[n],cards[j]]=[cards[j],cards[n]];}
      // Manual practice opening; no claim of an official mulligan/setup implementation.
      const index=cards.findIndex(c=>c.kind==='pokemon'&&c.basic);if(index<0)throw Error('FIXED_PRACTICE_NO_BASIC');
      const active=cards.splice(index,1)[0];Object.assign(active,{cardId:active.id,damage:0,enteredTurn:3,energyCards:[],energies:[]});
      Object.assign(player,{active,bench:[],hand:cards.splice(0,6),prizeCards:cards.splice(0,6),deck:cards,discard:[],prizes:6,normalEnergyAttached:false,turnLimits:{supporterUsed:false,abilityUses:{}}});
    }
    delete game.practiceScenario;
    game.mode='practice';game.history=[];game.effectStates=[];
    game.fixedDeckPractice={schemaVersion:1,sourceDeckIds:order.map(i=>manifest.decks[i].id),imageMode:'provisional-preview',adoptedPrints:0,officialEffectsConnected:false,manualOpening:true};
    return game;
  }
  root.PokecaFixedDeckPractice=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
