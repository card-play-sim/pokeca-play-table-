/* Generic official image resolver. Read-only, no print inference by name. */
(function(global){
  'use strict';
  const entries=new Map();
  function register(records){
    const source=records?.imageByOfficialCardId||records;
    if(!source||typeof source!=='object'||Array.isArray(source))return 0;
    let added=0;
    for(const [id,record] of Object.entries(source)){
      if(!/^\d+$/.test(id)||!record||typeof record.name!=='string'||typeof record.sourceUrl!=='string')continue;
      if(!/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\//.test(record.sourceUrl))continue;
      if(entries.has(id))continue;
      entries.set(id,{name:record.name,sourceUrl:record.sourceUrl});added++;
    }
    return added;
  }
  function resolve(card){
    if(!card||typeof card!=='object')return '';
    const print=Array.isArray(card.evolutionCards)&&card.evolutionCards.length?card.evolutionCards.at(-1):card;
    const id=print.officialCardId??print.catalogCardId;
    if(id==null||!/^\d+$/.test(String(id)))return '';
    const record=entries.get(String(id));
    return record&&record.name===print.name?record.sourceUrl:'';
  }
  function resolvePreview(card){
    const exact=resolve(card);
    if(exact)return exact;
    // For identity-free practice cards only, use a uniquely registered visual preview.
    // Never infer a print when an official ID was supplied.
    if(!card||typeof card!=='object')return '';
    const print=Array.isArray(card.evolutionCards)&&card.evolutionCards.length?card.evolutionCards.at(-1):card;
    if(print.officialCardId!=null||print.catalogCardId!=null||card.officialCardId!=null||card.catalogCardId!=null)return '';
    const matches=[...entries.values()].filter(r=>r.name===print.name);
    return matches.length===1?matches[0].sourceUrl:'';
  }
  global.PokecaImageResolver=Object.freeze({register,resolve,resolvePreview,count:()=>entries.size});
  register(global.PokecaVerifiedArt||{});
})(window);
