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
  const basicEnergy = card => card.category === 'energy' && card.basicEnergy === true;
  function cover(deck,cards) {
    if (deck.cards?.[deck.coverCardId] > 0) {
      const selected = cards.get(deck.coverCardId) || cards.archive?.get(deck.coverCardId);
      if (selected) return selected;
    }
    return rows(deck).map(([id]) => cards.get(id) || cards.archive?.get(id)).find(Boolean);
  }
  function plansFrom(base,extensions) {
    const plans = new Map();
    for (const record of [...base.records,...extensions.records]) {
      const id=String(record.officialCardId);
      if (plans.has(id) || !/^[1-9][0-9]*$/.test(id) ||
          !/^[a-f0-9]{64}$/.test(record.source?.sha256) || record.deckPrintAdopted !== false ||
          !(record.category === 'pokemon' ? record.attacks?.length &&
            [...record.attacks,...record.abilities].every(effect=>effect.plan) : record.mainPlan)) {
        throw Error('対戦効果の公式証跡を照合できません。');
      }
      plans.set(id,record);
    }
    return plans;
  }
  async function loadCatalog() {
    const importer = window.PokecaDeckCodeImport;
    const [cards,response,extensionResponse] = await Promise.all([
      importer.loadCatalog(), fetch('./data/reference-effects/plans.json'),
      fetch('./data/effect-extensions/compiled.json')
    ]);
    if (!response.ok || !extensionResponse.ok) throw Error('対戦用の公式カード情報を読み込めません。');
    return {cards,plans:plansFrom(await response.json(),await extensionResponse.json())};
  }
  // Shared deck-composition rules used before editing and when starting a match.
  function compositionError(deck,cards,plans) {
    if (rows(deck).some(([,count]) => !Number.isSafeInteger(count) || count < 1)) return '枚数が不正です。';
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
      if(card.aceSpec === true)aceSpec+=count;
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
      const extension = record?.source?.kind === 'saved-official-extension' && record.set === 'OFFICIAL_PAGE_REFERENCE';
      if (!card || !record || card.name !== record.name || card.url !== record.imageSourceUrl ||
          (!extension && card.pack && record.set && card.pack !== record.set) ||
          (card.number && record.cardNumber && card.number !== record.cardNumber)) {
        throw Error('BLOCKED · カード効果の対戦接続が未対応です: ' + (card?.name || id));
      }
      if (record.category === 'pokemon' && record.facts?.basic === true) basics = true;
      return {name:record.deckName,category:record.category,count,referenceOfficialCardId:id};
    });
    if (!basics) throw Error('たねポケモンを1枚以上入れてください。');
    return entries;
  }
  window.PokecaSavedDecks = {key,read,rows,blocked,total,basicEnergy,cover,plansFrom,loadCatalog,compositionError,matchEntries};
})();
