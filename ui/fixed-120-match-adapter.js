/* Fixed 120-card match adapter. No print IDs or effects are inferred from names. */
(function(root){
  'use strict';
  function expand(deck,records,owner){
    if(!deck||!Array.isArray(deck.cards))throw Error('Fixed deck missing');
    if(!records||typeof records!=='object')throw Error('Verified card records missing');
    const out=[];
    for(const item of deck.cards){
      const record=records[item.name];
      if(!record||record.verified!==true||!record.officialCardId||record.name!==item.name)
        throw Error('公式カード未接続: '+item.name);
      if(!['pokemon','energy','trainer','tool','stadium'].includes(record.kind))
        throw Error('カード分類未接続: '+item.name);
      if(record.kind==='pokemon'&&(!Number.isInteger(record.hp)||record.hp<=0||typeof record.basic!=='boolean'))
        throw Error('HP・進化段階未確認: '+item.name);
      if(record.kind==='pokemon'&&!Array.isArray(record.attacks))throw Error('ワザ情報未接続: '+item.name);
      for(let i=0;i<item.count;i++)out.push({...record,id:owner+'-'+out.length+'-'+record.officialCardId});
    }
    if(out.length!==60)throw Error('60枚構成に不一致: '+owner);
    return out;
  }
  function createMatch(manifest,records,engine,options={}){
    if(!manifest||!Array.isArray(manifest.decks)||manifest.decks.length!==2)throw Error('固定2デッキ不正');
    if(typeof engine?.createMatchFromVerifiedDecks!=='function')throw Error('対戦エンジン未接続');
    const you=expand(manifest.decks[0],records,'you');
    const ai=expand(manifest.decks[1],records,'ai');
    return engine.createMatchFromVerifiedDecks({you,ai,maxOpeningAttempts:100,autoBenchBasics:true,...options});
  }
  root.PokecaFixed120={expand,createMatch};
})(typeof window==='undefined'?globalThis:window);
