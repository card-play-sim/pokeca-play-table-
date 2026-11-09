/* Generic official image resolver. Read-only, no print inference by name. */
(function(global){
  'use strict';
  const entries=new Map(),previews=new Map();
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
  function resolveDisplay(card){
    if(!card||typeof card!=='object')return {mode:'missing',url:''};
    const print=Array.isArray(card.evolutionCards)&&card.evolutionCards.length?card.evolutionCards.at(-1):card;
    const identified=[card,print].some(c=>c.officialCardId!=null||c.catalogCardId!=null);
    const exact=resolve(card);
    if(identified&&print.validationReference)return {mode:'missing',url:''};
    if(identified)return {mode:exact?'verified-print':'missing',url:exact,adopted:card.identityStatus==='CONFIRMED'&&!!exact};
    if(print.validationReference){
      const ref=print.validationReference,aliases={'たけしのスカウト':'タケシのスカウト','ロケット団のエネルギー':'ロケット団エネルギー'};
      if(print.name!==ref.officialName&&aliases[print.name]!==ref.officialName)return {mode:'missing',url:''};
      const r=entries.get(String(ref.officialCardId)),known=previews.get(print.name)?.preview;
      const query={officialCardId:ref.officialCardId,name:ref.officialName,set:ref.set,cardNumber:ref.cardNumber,imageSourceUrl:ref.imageSourceUrl};
      const registered=r&&rules.matches(r,query);
      const isolated=known&&['officialCardId','name','set','cardNumber','imageSourceUrl'].every(k=>String(known[k]??'')===String(query[k]??''));
      if(ref.adopted!==false||(!registered&&!isolated))return {mode:'missing',url:''};
      return {mode:'provisional-preview',url:query.imageSourceUrl,referenceOfficialCardId:String(ref.officialCardId),officialName:ref.officialName,adopted:false};
    }
    const binding=previews.get(print.name);
    if(binding){
      const r=binding.preview;
      // Runtime constraints must agree, including aliases; preview IDs never enter cards.
      try{const c=rules.canonical(print);
        if(['set','cardNumber','imageSourceUrl'].some(k=>c[k]!=null&&c[k]!==r[k]))return {mode:'missing',url:''};
      }catch{return {mode:'missing',url:''};}
      return {mode:'provisional-preview',url:r.imageSourceUrl,referenceOfficialCardId:r.officialCardId,
        officialName:r.name,adopted:false,nameAlias:binding.nameAlias,numberlessEnergy:binding.numberlessEnergy};
    }
    const matches=[...entries.values()].filter(r=>rules.matches(r,print,{requireId:false}));
    return matches.length===1?{mode:'provisional-preview',url:matches[0].imageSourceUrl,referenceOfficialCardId:matches[0].officialCardId,adopted:false}:{mode:'missing',url:''};
  }
  function resolvePreview(card){return resolveDisplay(card).url;}
  function registerPreviews(data){
    if(data?.schemaVersion!==1||data.deckPrintAdopted!==false||!Array.isArray(data.bindings))throw Error('PREVIEW_SCHEMA');
    const pending=new Map();
    const aliases={'たけしのスカウト':'タケシのスカウト','ロケット団のエネルギー':'ロケット団エネルギー'};
    for(const b of data.bindings){
      if(b.mode!=='provisional-preview'||b.adoptedOfficialCardId!==null||pending.has(b.deckName)||!b.evidence?.sha256?.match(/^[a-f0-9]{64}$/))throw Error('PREVIEW_IDENTITY');
      const r=b.preview;
      const {cardNumber,...withoutNumber}=r;
      rules.validate(b.numberlessEnergy?withoutNumber:r);
      const imageId=r.imageSourceUrl.split('/').at(-1).match(/^0*(\d+)_/);
      if(!imageId||imageId[1]!==r.officialCardId)throw Error('PREVIEW_IMAGE_ID');
      if(b.numberlessEnergy&&(!/^基本(?:炎|悪|超)エネルギー$/.test(r.name)||cardNumber!==null||!r.set))throw Error('PREVIEW_NUMBERLESS_NOT_ENERGY');
      if(b.nameAlias?aliases[b.deckName]!==r.name:b.deckName!==r.name)throw Error('PREVIEW_NAME');
      if(!b.numberlessEnergy&&(!r.set||!r.cardNumber))throw Error('PREVIEW_PRINT_EMPTY');
      const registered=entries.get(r.officialCardId);
      if(registered&&!rules.matches(registered,r))throw Error('PREVIEW_REGISTRY_CONFLICT');
      if(!registered&&!b.nameAlias&&!b.numberlessEnergy)throw Error('PREVIEW_UNREGISTERED');
      pending.set(b.deckName,JSON.parse(JSON.stringify(b)));
    }
    previews.clear();for(const [key,value] of pending)previews.set(key,value);
    return previews.size;
  }
  async function loadPreviews(url){
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('PREVIEW_HTTP_'+response.status);
    return registerPreviews(await response.json());
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
  global.PokecaImageResolver=Object.freeze({register,resolve,resolvePreview,resolveDisplay,registerPreviews,loadPreviews,coverage,loadRegistry,count:()=>entries.size});
  register(global.PokecaVerifiedArt||{});
})(window);
