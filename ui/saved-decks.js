(() => {
  'use strict';
  const key = 'pokeca.deck-builder.v1';
  function read(storage = localStorage) {
    const saved = JSON.parse(storage.getItem(key) || '{"decks":[]}');
    if (!Array.isArray(saved?.decks)) throw Error('保存形式が不正です');
    return saved;
  }
  const rows = deck => Object.entries(deck.cards || {});
  const blocked = deck => deck.blocked || [];
  const total = deck => [...rows(deck).map(([,count]) => count), ...blocked(deck).map(row => row.count)]
    .reduce((sum,count) => sum + count,0);
  const basicEnergy = card => card.category === 'energy' && /^基本.+エネルギー$/.test(card.name);
  function cover(deck,cards) {
    if (deck.cards?.[deck.coverCardId] > 0 && cards.has(deck.coverCardId)) return cards.get(deck.coverCardId);
    return rows(deck).map(([id]) => cards.get(id)).find(Boolean);
  }
  async function loadCatalog() {
    const importer = window.PokecaDeckCodeImport;
    const [cards,response] = await Promise.all([
      importer.loadCatalog(), fetch('./data/reference-effects/plans.json')
    ]);
    if (!response.ok) throw Error('対戦用の公式カード情報を読み込めません。');
    const plans = await response.json();
    const proven = plans.records.filter(record => /^[a-f0-9]{64}$/.test(record.source?.sha256))
      .map(record => ({...record,verified:true}));
    const references = importer.catalogFrom({cards:proven},{records:plans.records});
    for (const [id,card] of references) if (!cards.has(id)) cards.set(id,card);
    return {cards,plans:new Map(plans.records.map(record => [String(record.officialCardId),record]))};
  }
  // Shared deck-composition rules used before editing and when starting a match.
  function compositionError(deck,cards,plans) {
    if (total(deck)>60) return '60枚まで追加できます。';
    const names=new Map();
    let radiant=0, aceSpec=0;
    for(const [id,count] of rows(deck)){
      const card=cards.get(id);
      if(!card)continue;
      if(!basicEnergy(card)){
        const combined=(names.get(card.name)||0)+count;
        if(combined>4)return card.name+'は同名4枚制限です。';
        names.set(card.name,combined);
      }
      if(card.category==='pokemon'&&card.name.startsWith('かがやく'))radiant+=count;
      if(plans.get(id)?.rulesText?.includes('ACE SPECのカードは、デッキに1枚'))aceSpec+=count;
    }
    if(aceSpec>1)return 'ACE SPECはデッキに1枚までです。';
    if(radiant>1)return 'かがやくポケモンはデッキに1枚までです。';
    return '';
  }
  function matchEntries(deck,cards,plans) {
    if (total(deck) !== 60 || rows(deck).some(([,count]) => !Number.isInteger(count) || count < 1)) {
      throw Error('デッキを60枚にしてください。');
    }
    if (blocked(deck).length) throw Error('BLOCKED · 未照合のカードがあります。');
    const error = compositionError(deck,cards,plans);
    if(error)throw Error(error);
    let basics = false;

    const entries = rows(deck).map(([id,count]) => {
      const card = cards.get(id);
      const record = plans.get(id);
      if (!card || !record || card.name !== record.name ||
          (card.pack && record.set && card.pack !== record.set) ||
          (card.number && record.cardNumber && card.number !== record.cardNumber)) {
        throw Error('BLOCKED · 対戦用の公式印刷版を照合できません: ' + (card?.name || id));
      }
      if (record.category === 'pokemon' && record.facts?.basic === true) basics = true;
      return {name:record.deckName,category:record.category,count,referenceOfficialCardId:id};
    });
    if (!basics) throw Error('たねポケモンを1枚以上入れてください。');
    return entries;
  }
  window.PokecaSavedDecks = {key,read,rows,blocked,total,basicEnergy,cover,loadCatalog,compositionError,matchEntries};
})();
