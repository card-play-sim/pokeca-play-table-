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
  function connectionError(id,card,record) {
    if (!record) return 'NO_EFFECT_PLAN';
    if (!card || String(record.officialCardId)!==String(id) || card.name!==record.name ||
        card.url!==record.imageSourceUrl ||
        (record.regulationMark && record.regulationMark!==card.regulationMark)) return 'PRINT_IDENTITY_CONFLICT';
    const category=({goods:'item',support:'supporter'})[card.category]||card.category;
    const recordCategory=({goods:'item',support:'supporter'})[record.category]||record.category;
    const extension=record.source?.kind==='saved-official-extension'&&record.set==='OFFICIAL_PAGE_REFERENCE';
    if (category!==recordCategory ||
        (!extension&&card.pack&&record.set&&card.pack!==record.set) ||
        (card.number&&record.cardNumber&&card.number!==record.cardNumber)) return 'PRINT_IDENTITY_CONFLICT';
    return '';
  }
  // Diagnose the exact same card-print gate that matchEntries() uses. This
  // never substitutes a same-name print or weakens its official proof rules.
  function diagnoseDeck(deck,cards,plans) {
    const issues = [];
    const legal = new Set();
    for (const [id,count] of rows(deck)) {
      const card = cards.get(id);
      const archive = cards.archive?.get(id);
      const record = plans.get(id);
      const reason = connectionError(id,card,record);
      if (reason) issues.push({
        id:String(id),count,name:card?.name || archive?.name || 'カードID '+id,
        category:card?.category || archive?.category || 'unknown',reason
      });
      else if (record.category === 'pokemon' && record.facts?.basic === true) legal.add(String(id));
    }
    for (const item of blocked(deck)) {
      issues.push({
        id:String(item.officialCardId || ''),count:item.count,
        name:item.name || 'カードID '+(item.officialCardId || ''),
        category:item.category || 'unknown',reason:item.reason || 'OFFICIAL_PRINT_UNVERIFIED'
      });
    }
    const count = total(deck);
    const composition = compositionError(deck,cards,plans);
    const opening = count===60 && !issues.length && !legal.size ? 'NO_BASIC_POKEMON' : '';
    return {total:count,issues,compositionError:composition,
      deckReady:count===60&&!issues.length&&!composition&&!opening,
      openingError:opening};
  }
  const diagnosisReason = reason => ({
    NO_EFFECT_PLAN:'公式効果の接続待ち',
    PRINT_IDENTITY_CONFLICT:'印刷版・公式画像の照合不一致',
    OFFICIAL_PRINT_UNVERIFIED:'公式印刷版を未照合',
    OFFICIAL_PRINT_NOT_FOUND:'公式印刷版の登録待ち',
    OUT_OF_REGULATION:'使用可能なレギュレーションの照合待ち',
    AMBIGUOUS_PRINT:'公式印刷版を特定できません'
  })[reason] || '公式カード情報の照合待ち';

  // Text-only export is opt-in. No device deck data is sent to GitHub or any
  // remote service automatically.
  function diagnosticText(deck,cards,plans) {
    const result=diagnoseDeck(deck,cards,plans);
    const header=['ポケカ・デッキ対戦診断','デッキ: '+(deck.name||'名称未設定'),
      '合計: '+result.total+'/60枚',
      '未対応・未照合: '+result.issues.length+'種類'];
    if(result.compositionError)header.push('デッキ構成: '+result.compositionError);
    if(result.openingError)header.push('対戦開始: たねポケモンがありません');
    header.push('', '未対応の公式印刷版:');
    if(!result.issues.length)header.push('なし');
    for(const item of result.issues)
      header.push(item.name+' ×'+item.count+' [ID '+item.id+'] / '+diagnosisReason(item.reason));
    header.push('','全カード構成（公式印刷版IDと枚数）:');
    for(const [id,count] of rows(deck)) {
      const card=cards.get(id)||cards.archive?.get(id);
      header.push((card?.name||'カードID '+id)+' ×'+count+' [ID '+id+']');
    }
    for(const item of blocked(deck))
      header.push((item.name||'カードID '+item.officialCardId)+' ×'+item.count+' [未照合ID '+item.officialCardId+']');
    return header.join('\\n');
  }

  // Audits only the current I/J priority scope. H and historical prints are excluded.
  // An existing plan is evidence of connection, not proof of successful execution.
  function auditIJCoverage(cards,plans) {
    const result = {I:{total:0,connected:0,missing:0},J:{total:0,connected:0,missing:0}};
    for (const [id,card] of cards) {
      const mark = card.regulationMark;
      if (mark !== 'I' && mark !== 'J') continue;
      const bucket = result[mark];
      bucket.total++;
      const record = plans.get(String(id));
      const connected = !connectionError(id,card,record);
      bucket[connected ? 'connected' : 'missing']++;
    }
    return result;
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
      const reason = connectionError(id,card,record);
      if (reason) {
        // Preserve exact print identity: a same-name plan is not proof of equivalent effects.
        const reasonLabel = reason === 'NO_EFFECT_PLAN' ? '公式効果計画なし' : '印刷版の公式照合不一致';
        throw Error('BLOCKED · ' + reasonLabel + ': ' + (card?.name || id) + ' [ID ' + id + ']');
      }
      if (record.category === 'pokemon' && record.facts?.basic === true) basics = true;
      return {name:record.deckName,category:record.category,count,referenceOfficialCardId:id};
    });
    if (!basics) throw Error('たねポケモンを1枚以上入れてください。');
    return entries;
  }
  window.PokecaSavedDecks = {key,read,rows,blocked,total,basicEnergy,cover,plansFrom,loadCatalog,connectionError,diagnoseDeck,diagnosisReason,diagnosticText,auditIJCoverage,compositionError,matchEntries};
})();
