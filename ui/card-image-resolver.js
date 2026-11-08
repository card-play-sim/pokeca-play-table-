/* Generic official image resolver. Read-only, no print inference by name. */
(function(global){
  'use strict';
  const entries=new Map();
  const validURL=url=>typeof url==='string'&&/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(url);

  function register(records){
    const source=records?.imageByOfficialCardId||records;
    if(!source||typeof source!=='object'||Array.isArray(source))return 0;
    // Validate the entire batch before mutating the live registry.
    // A late collision must not leave an earlier part of the batch installed.
    const pending=[];
    for(const [id,record] of Object.entries(source)){
      if(!/^\d+$/.test(id)||!record||typeof record.name!=='string'||typeof record.sourceUrl!=='string')continue;
      if(!validURL(record.sourceUrl))throw Error('IMAGE_REGISTRY_INVALID_URL_'+id);
      if(entries.has(id)){
        const existing=entries.get(id);
        if(existing.name!==record.name||existing.sourceUrl!==record.sourceUrl)throw Error('IMAGE_REGISTRY_CONFLICT_'+id);
      }else pending.push([id,{name:record.name,sourceUrl:record.sourceUrl,cardNumber:record.cardNumber,set:record.set}]);
    }
    for(const [id,record] of pending)entries.set(id,record);
    return pending.length;
  }
  function resolve(card){
    if(!card||typeof card!=='object')return '';
    const print=Array.isArray(card.evolutionCards)&&card.evolutionCards.length?card.evolutionCards.at(-1):card;
    const id=print.officialCardId??print.catalogCardId;
    if(id==null||!/^\d+$/.test(String(id)))return '';
    const record=entries.get(String(id));
    return record&&record.name===print.name&&(!print.cardNumber||print.cardNumber===record.cardNumber)&&(!(print.set||print.setCode)||(print.set||print.setCode)===record.set)?record.sourceUrl:'';
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
  function coverage(cards){
    const missing=[],resolved=[];
    for(const card of cards||[]){
      const url=resolve(card);
      (url?resolved:missing).push({name:card?.name||'',officialCardId:card?.officialCardId??card?.catalogCardId??null,...(url?{sourceUrl:url}:{})});
    }
    return {total:resolved.length+missing.length,resolved:resolved.length,missing};
  }
  async function loadRegistry(url){
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error('IMAGE_REGISTRY_HTTP_'+response.status);
    const data=await response.json();
    if(!data||!Array.isArray(data.cards))throw Error('IMAGE_REGISTRY_SCHEMA');
    const map=Object.create(null);
    for(const c of data.cards){
      const id=String(c?.officialCardId??'');
      if(!/^\d+$/.test(id)||typeof c.name!=='string'||typeof c.imageSourceUrl!=='string'||
         !validURL(c.imageSourceUrl))throw Error('IMAGE_REGISTRY_INVALID_CARD_'+id);
      if(map[id]&&(map[id].sourceUrl!==c.imageSourceUrl||map[id].name!==c.name))throw Error('IMAGE_REGISTRY_DUPLICATE_'+id);
      map[id]={name:c.name,sourceUrl:c.imageSourceUrl,cardNumber:c.cardNumber,set:c.set};
    }
    return {received:data.cards.length,registered:register(map),total:entries.size};
  }
  global.PokecaImageResolver=Object.freeze({register,resolve,resolvePreview,coverage,loadRegistry,count:()=>entries.size});
  register(global.PokecaVerifiedArt||{});
})(window);
