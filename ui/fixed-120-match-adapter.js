/* Fixed 120-card match adapter. No print IDs or effects are inferred from names. */
(function(root){
  'use strict';
  function expand(deck,records,owner,options={}){
    if(!deck||!Array.isArray(deck.cards))throw Error('Fixed deck missing');
    if(!records||typeof records!=='object')throw Error('Verified card records missing');
    const out=[];
    const seenNames=new Set();
    for(const item of deck.cards){
      if(!item||typeof item.name!=='string'||!item.name.trim()||!Number.isInteger(item.count)||item.count<1||item.count>60)
        throw Error('カード名・枚数不正');
      if(seenNames.has(item.name))throw Error('同名カードの重複行: '+item.name);
      seenNames.add(item.name);
      const record=records[item.name];
      if(!record||record.verified!==true||!record.officialCardId||record.name!==item.name)
        throw Error('公式カード未接続: '+item.name);
      const categoryKind={pokemon:'pokemon',energy:'energy',goods:'trainer',support:'trainer',supporter:'trainer',item:'trainer',tool:'tool',stadium:'stadium'};
      if(!Object.prototype.hasOwnProperty.call(categoryKind,item.category))
        throw Error('デッキのカード分類が不正: '+item.name);
      if(record.kind!==categoryKind[item.category])
        throw Error('デッキ分類と公式カード分類が不一致: '+item.name);
      if(!['pokemon','energy','trainer','tool','stadium'].includes(record.kind))
        throw Error('カード分類未接続: '+item.name);
      if(record.kind==='pokemon'&&(!Number.isInteger(record.hp)||record.hp<=0||typeof record.basic!=='boolean'))
        throw Error('HP・進化段階未確認: '+item.name);
      if(record.kind==='pokemon'&&!Array.isArray(record.attacks))throw Error('ワザ情報未接続: '+item.name);
      if(record.effectStatus!=='verified' || record.engineReadable!==true)
        throw Error('公式効果未接続: '+item.name);
      if(!options.testOnlyAllowSynthetic && (String(record.officialCardId).startsWith('SYNTHETIC_') || String(record.sourceEvidence).startsWith('TEST_ONLY_')))
        throw Error('試験用カードを本番対戦に使用できません: '+item.name);
      if(!record.sourceEvidence || typeof record.sourceEvidence!=='string')
        throw Error('公式証跡未接続: '+item.name);
      for(let i=0;i<item.count;i++)out.push({...record,id:owner+'-'+out.length+'-'+record.officialCardId});
    }
    if(out.length!==60)throw Error('60枚構成に不一致: '+owner);
    return out;
  }
  function createMatch(manifest,records,engine,options={}){
    if(!manifest||!Array.isArray(manifest.decks)||manifest.decks.length!==2)throw Error('固定2デッキ不正');
    if(typeof engine?.createMatchFromVerifiedDecks!=='function')throw Error('対戦エンジン未接続');
    const you=expand(manifest.decks[0],records,'you',options);
    const ai=expand(manifest.decks[1],records,'ai',options);
    const result=engine.createMatchFromVerifiedDecks({you,ai,maxOpeningAttempts:100,autoBenchBasics:true,...(options.rng?{rng:options.rng}:{}),...(options.firstPlayer?{firstPlayer:options.firstPlayer}:{})});
    // An opening board can be valid even when the effect catalog cannot read its
    // official print IDs. Verify the first actionable turn before exposing it to UI.
    if(result?.ok&&typeof engine.getLegalActions==='function'){
      try{
        const legal=engine.getLegalActions(result.game,result.game.turnPlayer);
        if(!Array.isArray(legal?.actions))throw Error('合法操作候補がありません');
      }catch(error){
        return {ok:false,stage:'effect_catalog_unregistered',errors:[String(error?.message||error)]};
      }
    }
    return result;
  }
  root.PokecaFixed120={expand,createMatch};
})(typeof window==='undefined'?globalThis:window);
