/* Generic official image resolver. Read-only, no print inference by name. */
(function(global){
  'use strict';
  const entries=new Map();
  const rules=global.PokecaImageValidation;
  if(!rules)throw Error('IMAGE_VALIDATION_NOT_LOADED');
  function register(records){
    const source=records?.imageByOfficialCardId||records;
    if(!source||typeof source!=='object'||Array.isArray(source))throw Error('IMAGE_REGISTRY_SCHEMA');
    const pending=new Map(entries);
    let changed=0;
    for(const [id,record] of Object.entries(source)){
      if(record?.officialCardId!=null&&String(record.officialCardId)!==id)throw Error('IMAGE_REGISTRY_CONFLICT_ID');
      const value=rules.validate({...record,officialCardId:id});
      const old=pending.get(id),merged=old?rules.merge(old,value):value;
      if(JSON.stringify(old)!==JSON.stringify(merged))changed++;
      pending.set(id,merged);
    }
    entries.clear();for(const [id,record] of pending)entries.set(id,record);
    return changed;
  }
  function resolve(card){
    if(!card||typeof card!=='object')return '';
    const print=Array.isArray(card.evolutionCards)&&card.evolutionCards.length?card.evolutionCards.at(-1):card;
    const id=print.officialCardId??print.catalogCardId;
    if(id==null||!/^\d+$/.test(String(id)))return '';
    const record=entries.get(String(id));
    return record&&rules.matches(record,print)?record.imageSourceUrl:'';
  }
  function resolvePreview(card){
    const exact=resolve(card);
    if(exact)return exact;
    // For identity-free practice cards only, use a uniquely registered visual preview.
    // Never infer a print when an official ID was supplied.
    if(!card||typeof card!=='object')return '';
    const print=Array.isArray(card.evolutionCards)&&card.evolutionCards.length?card.evolutionCards.at(-1):card;
    if(print.officialCardId!=null||print.catalogCardId!=null||card.officialCardId!=null||card.catalogCardId!=null)return '';
    const matches=[...entries.values()].filter(r=>rules.matches(r,print,{requireId:false}));
    return matches.length===1?matches[0].imageSourceUrl:'';
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
    const validated=rules.index(data.cards),map=Object.create(null);
    for(const [id,c] of validated)map[id]=c;
    return {received:data.cards.length,registered:register(map),total:entries.size};
  }
  global.PokecaImageResolver=Object.freeze({register,resolve,resolvePreview,coverage,loadRegistry,count:()=>entries.size});
  register(global.PokecaVerifiedArt||{});
})(window);
