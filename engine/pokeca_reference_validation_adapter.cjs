'use strict';
const R=require('./pokeca_reference_effect_runtime');
const copy=x=>JSON.parse(JSON.stringify(x));
function create(manifest,{rng=Math.random,firstDeck=0,referenceIds={},firstPlayer='you',startingActive={},startingBench={}}={}){
 if(manifest?.decks?.length!==2||![0,1].includes(firstDeck))throw Error('REFERENCE_DECK_SCHEMA');
 for(const deck of manifest.decks){if(!Array.isArray(deck.cards)||deck.cards.some(c=>!Number.isInteger(c.count)||c.count<1||c.count>60)||deck.cards.reduce((n,c)=>n+c.count,0)!==60)throw Error('REFERENCE_DECK_COUNT');}
 const order=firstDeck?[1,0]:[0,1],used=new Set();
 const decks=order.map((index,i)=>manifest.decks[index].cards.flatMap(entry=>{
  const ident=String(entry.referenceOfficialCardId||referenceIds[entry.name]||R.catalog.defaultValidationReferences[entry.name]||''),record=R.referenceRecord(ident);
  if(!record||record.deckName!==entry.name||record.category!==entry.category||!Number.isInteger(entry.count)||entry.count<1)throw Error('REFERENCE_PRINT_BINDING:'+entry.name);
  return Array.from({length:entry.count},(_,n)=>{
   const physical=`reference-${i}-${used.size}`;if(used.has(physical))throw Error('DUPLICATE_REFERENCE_PHYSICAL_ID');used.add(physical);
   const kind={pokemon:'pokemon',energy:'energy',goods:'trainer',item:'trainer',support:'trainer',supporter:'trainer',tool:'tool',stadium:'stadium'}[entry.category];
   const card={id:physical,name:entry.name,kind,verified:true,verificationScope:'EXACT_REFERENCE_FACTS_NOT_DECK_ADOPTION',identityStatus:'UNCONFIRMED',
    validationReference:{officialCardId:ident,officialName:record.name,set:record.set,cardNumber:record.cardNumber,imageSourceUrl:record.imageSourceUrl,sourceSha256:record.source.sha256,adopted:false},
    fixtureNote:'公式参照版の効果検証。正式採用版未確定。未接続効果は停止。'};
   if(kind==='pokemon')Object.assign(card,copy(record.facts),{species:entry.name,attacks:copy(record.attacks),abilities:copy(record.abilities),prizeCount:record.facts.prizeCount});
   else if(kind==='energy'){
    if(record.mainPlan?.mechanic==='BASIC_ENERGY')card.energyType=record.name.match(/^基本([炎超悪])エネルギー$/)[1];
    else {card.isSpecial=true;card.cardType='SPECIAL_ENERGY';}
   }else if(kind==='trainer')card.cardType=['support','supporter'].includes(entry.category)?'SUPPORTER':'ITEM';
   return card;
  });
 }));
 if(decks.some(d=>d.length!==60))throw Error('REFERENCE_DECK_COUNT');
 const result=require('./pokeca_match_setup').createMatchFromVerifiedDecks({you:decks[0],ai:decks[1],rng,firstPlayer,maxOpeningAttempts:100,autoBenchBasics:true,startingActive,startingBench});
 if(!result.ok)return result;
 const g=result.game;g.referenceEffectValidation={schemaVersion:1,sourceDeckIds:order.map(i=>manifest.decks[i].id),adoptedPrints:0,referenceIds:copy({...R.catalog.defaultValidationReferences,...referenceIds}),coverageComplete:false};
 // Seed the persisted effect RNG once after opening setup, independently of AI decisions.
 const effectSeedSample=rng();
 if(!Number.isFinite(effectSeedSample)||effectSeedSample<0||effectSeedSample>=1)throw Error('INVALID_REFERENCE_EFFECT_SEED');
 g.referenceRngState=Math.floor(effectSeedSample*4294967296)>>>0;
 g.manualPrizeSelection=true;g.referenceActionSequence=0;
 const difference=result.mulligans.you-result.mulligans.ai;if(difference){const actor=difference>0?'ai':'you';g.pendingReferenceChoice={kind:'MULLIGAN',playerId:actor,options:Array.from({length:Math.min(Math.abs(difference),g.players.find(p=>p.id===actor).deck.length)+1},(_,i)=>i)};}
 R.refresh(g);
 return {...result,officialDeckAdoptionPass:false};
}
module.exports={create};
