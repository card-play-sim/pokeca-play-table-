/* Shared offline identity rules. No network, print inference, or data mutation. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PokecaImageValidation=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const validURL=url=>typeof url==='string'&&/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(url);
  const present=v=>v!==undefined&&v!==null;
  function canonical(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('IMAGE_REGISTRY_INVALID_CARD');
    const id=raw.officialCardId??raw.catalogCardId;
    const url=raw.imageSourceUrl??raw.sourceUrl??raw.imageUrl;
    for(const [a,b] of [['officialCardId','catalogCardId'],['set','setCode'],['imageSourceUrl','sourceUrl'],['imageSourceUrl','imageUrl'],['sourceUrl','imageUrl']]){
      if(present(raw[a])&&present(raw[b])&&String(raw[a])!==String(raw[b]))throw Error('IMAGE_REGISTRY_CONFLICT_'+a);
    }
    const value={...raw};
    if(present(id))value.officialCardId=String(id);
    if(present(raw.set??raw.setCode))value.set=raw.set??raw.setCode;
    if(present(url))value.imageSourceUrl=url;
    for(const field of ['set','cardNumber'])if(present(value[field])&&(typeof value[field]!=='string'||!value[field].trim()))throw Error('IMAGE_REGISTRY_INVALID_'+field);
    return value;
  }
  function validate(raw){
    const c=canonical(raw),id=c.officialCardId;
    if(!/^\d+$/.test(id||'')||typeof c.name!=='string'||!c.name.trim())throw Error('IMAGE_REGISTRY_INVALID_CARD_'+id);
    if(!validURL(c.imageSourceUrl))throw Error('IMAGE_REGISTRY_INVALID_URL_'+id);
    for(const field of ['officialPageUrl','officialCardPageUrl'])if(present(c[field])){
      const match=typeof c[field]==='string'&&c[field].match(/^https:\/\/www\.pokemon-card\.com\/card-search\/details\.php(?:\/card\/(\d+)(?:\/regu\/XY)?\/?|\?card_id=(\d+))$/);
      if(!match||(match[1]||match[2])!==id)throw Error('IMAGE_REGISTRY_PAGE_ID_MISMATCH_'+id);
    }
    return c;
  }
  // Enrich missing evidence, but never overwrite conflicting evidence (including nested fields).
  function preserve(a,b,path=''){
    const out={...a};
    for(const [key,value] of Object.entries(b)){
      if(!present(value))continue;
      const old=out[key];
      if(!present(old)){out[key]=value;continue;}
      if(old&&value&&typeof old==='object'&&typeof value==='object'&&!Array.isArray(old)&&!Array.isArray(value))out[key]=preserve(old,value,path+key+'.');
      else if(JSON.stringify(old)!==JSON.stringify(value))throw Error('IMAGE_REGISTRY_CONFLICT_'+path+key);
    }
    return out;
  }
  function merge(a,b){return preserve(validate(a),validate(b));}
  function matches(record,card,{requireId=true}={}){
    try{
      const r=validate(record),c=canonical(card);
      if(requireId&&!/^\d+$/.test(c.officialCardId||''))return false;
      if(present(c.officialCardId)&&c.officialCardId!==r.officialCardId)return false;
      return c.name===r.name&&['set','cardNumber','imageSourceUrl'].every(k=>!present(c[k])||c[k]===r[k]);
    }catch{return false;}
  }
  function index(cards){
    if(!Array.isArray(cards))throw Error('IMAGE_REGISTRY_SCHEMA');
    const map=new Map();
    for(const raw of cards){const c=validate(raw);if(map.has(c.officialCardId))throw Error('IMAGE_REGISTRY_DUPLICATE_'+c.officialCardId);map.set(c.officialCardId,c);}
    return map;
  }
  return Object.freeze({validURL,canonical,validate,merge,matches,index});
});
