/* Read-only loader for verified official basic-Pokémon candidate JSON.
 * Candidate records are NOT adopted deck prints and never become playable by loading.
 */
(function(global){
'use strict';
const ROOT='https://www.pokemon-card.com/assets/images/card_images/';
function normalize(data){
 if(!data||!['CANDIDATES_ONLY_NOT_ENGINE_READY','VERIFIED_CANDIDATES_NOT_ADOPTED'].includes(data.status)||!Array.isArray(data.cards)||!Array.isArray(data.adoptedPrintIds)||data.adoptedPrintIds.length)throw Error('Untrusted candidate dataset');
 const byId=Object.create(null),byName=Object.create(null),imageByOfficialCardId=Object.create(null);
 for(const c of data.cards){
  if(!c||c.verificationStatus!=='verified'||c.cardType!=='pokemon'||c.pokemonStage!=='たね'||!/^\d+$/.test(String(c.officialCardId))||!c.name||!Number.isInteger(c.hp)||c.hp<=0||!Array.isArray(c.attacks)||!Array.isArray(c.abilities))throw Error('Invalid candidate');
  const id=String(c.officialCardId);
  if(byId[id])throw Error('Duplicate official ID '+id);
  const record=Object.freeze({...c});
  byId[id]=record;
  (byName[c.name]??=[]).push(record);
  if(typeof c.imageSourceUrl==='string'&&c.imageSourceUrl.startsWith(ROOT)){
   imageByOfficialCardId[id]=Object.freeze({name:c.name,sourceUrl:c.imageSourceUrl,cardNumber:c.cardNumber});
  }
 }
 if(data.candidateCount!==data.cards.length)throw Error('Candidate count mismatch');
 for(const name of Object.keys(byName))Object.freeze(byName[name]);
 return Object.freeze({status:'CANDIDATES_ONLY',byId:Object.freeze(byId),byName:Object.freeze(byName),imageByOfficialCardId:Object.freeze(imageByOfficialCardId),count:data.cards.length});
}
global.PokecaOfficialCandidates=Object.freeze({normalize});
})(window);
