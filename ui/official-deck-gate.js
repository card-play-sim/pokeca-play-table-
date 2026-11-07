/* Strict official-card readiness gate for the two fixed decks.
 * This module does not select print editions or invent missing effects.
 * Keep official source data read-only; only explicitly adopted prints may pass.
 */
(function(global){
'use strict';
const OWN=Object.prototype.hasOwnProperty;
const fail=(code,name,detail)=>({code,name,detail});
function validate(deck,cardRegistry,imageRegistry,effectRegistry){
 const issues=[],seen=new Set();
 if(!deck||!Array.isArray(deck.cards))return {ready:false,issues:[fail('DECK_INVALID','','Missing deck cards')]};
 const total=deck.cards.reduce((n,c)=>n+Number(c.count||0),0);
 if(total!==60)issues.push(fail('DECK_COUNT_INVALID',deck.name,'Expected 60 cards, got '+total));
 for(const entry of deck.cards){
  const name=entry.name;
  if(!Number.isInteger(entry.count)||entry.count<1)issues.push(fail('COUNT_INVALID',name,'Invalid count'));
  const id=entry.officialCardId;
  if(id==null||!/^\d+$/.test(String(id))||entry.identityStatus!=='CONFIRMED'){
   issues.push(fail('PRINT_NOT_CONFIRMED',name,'An adopted official print ID is required'));continue;
  }
  const key=String(id),record=cardRegistry?.[key],image=imageRegistry?.[key],effects=effectRegistry?.[key];
  if(!record||record.name!==name){issues.push(fail('CARD_DATA_MISMATCH',name,key));continue;}
  if(!image||image.name!==name||!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\//.test(image.sourceUrl||'')){
   issues.push(fail('OFFICIAL_IMAGE_MISSING',name,key));
  }
  if(entry.category==='pokemon'){
   if(!Number.isInteger(record.hp)||record.hp<=0)issues.push(fail('HP_MISSING',name,key));
   if(!Array.isArray(record.attacks))issues.push(fail('ATTACKS_MISSING',name,key));
   if(!Array.isArray(record.abilities))issues.push(fail('ABILITIES_MISSING',name,key));
  }
  if(!effects||effects.engineReadable!==true)issues.push(fail('EFFECT_NOT_ENGINE_READY',name,key));
  if(seen.has(key)&&!OWN.call(entry,'allowSamePrintRepeat'))issues.push(fail('DUPLICATE_PRINT_ENTRY',name,key));
  seen.add(key);
 }
 return {ready:issues.length===0,issues,checked:deck.cards.length,total};
}
global.PokecaOfficialDeckGate=Object.freeze({validate});
})(window);
