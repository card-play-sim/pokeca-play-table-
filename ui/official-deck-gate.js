/* Strict official-card readiness gate for the two fixed decks.
 * This module does not select print editions or invent missing effects.
 * Keep official source data read-only; only explicitly adopted prints may pass.
 */
(function(global){
'use strict';
const fail=(code,name,detail)=>({code,name,detail});
function validate(deck,cardRegistry,imageRegistry,effectRegistry){
 const issues=[],seen=new Set();
 if(!deck||!Array.isArray(deck.cards))return {ready:false,issues:[fail('DECK_INVALID','','Missing deck cards')]};
 const total=deck.cards.reduce((n,c)=>n+(Number.isInteger(c?.count)&&c.count>0?c.count:0),0);
 if(deck.cards.length===0)issues.push(fail('DECK_EMPTY',deck.name,'Deck has no entries'));
 if(total!==60)issues.push(fail('DECK_COUNT_INVALID',deck.name,'Expected 60 cards, got '+total));
 for(const entry of deck.cards){
  if(!entry||typeof entry!=='object'){issues.push(fail('CARD_ENTRY_INVALID','','Null or non-object entry'));continue;}
  const name=entry.name;
  if(!Number.isInteger(entry.count)||entry.count<1)issues.push(fail('COUNT_INVALID',name,'Invalid count'));
  if(entry.count>4&&!['basic-energy'].includes(entry.category))issues.push(fail('COPY_LIMIT_EXCEEDED',name,'More than four copies'));
  if(typeof name!=='string'||!name.trim()){issues.push(fail('CARD_NAME_INVALID',String(name),'Missing name'));continue;}
  const id=entry.officialCardId;
  if(id==null||!/^\d+$/.test(String(id))||entry.identityStatus!=='CONFIRMED'){
   issues.push(fail('PRINT_NOT_CONFIRMED',name,'An adopted official print ID is required'));continue;
  }
  const key=String(id),record=cardRegistry?.[key],image=imageRegistry?.[key],effects=effectRegistry?.[key];
  if(!record||record.name!==name||record.cardType!==entry.category){issues.push(fail('CARD_DATA_MISMATCH',name,key));continue;}
  if(!image||image.name!==name||!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\//.test(image.sourceUrl||'')){
   issues.push(fail('OFFICIAL_IMAGE_MISSING',name,key));
  }
  if(entry.category==='pokemon'){
   if(!Number.isInteger(record.hp)||record.hp<=0)issues.push(fail('HP_MISSING',name,key));
   if(record.pokemonStage!=='たね'&&record.pokemonStage!=='1進化'&&record.pokemonStage!=='2進化')issues.push(fail('STAGE_MISSING',name,key));
   if(!Array.isArray(record.attacks)||record.attacks.some(a=>typeof a?.name!=='string'||!Array.isArray(a.cost)||typeof a.text!=='string'))issues.push(fail('ATTACKS_MISSING',name,key));
   if(!Array.isArray(record.abilities)||record.abilities.some(a=>typeof a?.name!=='string'||typeof a.text!=='string'))issues.push(fail('ABILITIES_MISSING',name,key));
  }
  if(entry.category!=='basic-energy'&&(!effects||effects.engineReadable!==true||String(effects.officialCardId)!==key))issues.push(fail('EFFECT_NOT_ENGINE_READY',name,key));
  if(seen.has(key))issues.push(fail('DUPLICATE_PRINT_ENTRY',name,key));
  seen.add(key);
 }
 return {ready:issues.length===0,issues,checked:deck.cards.length,total};
}
function validatePair(decks,cardRegistry,imageRegistry,effectRegistry){
 if(!Array.isArray(decks)||decks.length!==2)return {ready:false,issues:[fail('DECK_PAIR_INVALID','','Expected exactly two decks')],decks:[]};
 const reports=decks.map(d=>validate(d,cardRegistry,imageRegistry,effectRegistry));
 return {ready:reports.every(x=>x.ready),issues:reports.flatMap((x,i)=>x.issues.map(issue=>({...issue,deck:decks[i].id||decks[i].name}))),decks:reports};
}
global.PokecaOfficialDeckGate=Object.freeze({validate,validatePair});
})(window);
