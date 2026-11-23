(() => {
  'use strict';
  const saved = window.PokecaSavedDecks;
  const $ = id => document.getElementById(id);
  const home = $('deck-home');
  const grid = $('deck-home-grid');
  const status = $('deck-home-status');
  const confirm = $('deck-home-confirm');
  let cards = new Map();
  let pending;
  let preparing = false;
  let matchData;
  const opponentSelect = $('deck-home-opponent');
  const matchStatus = $('deck-home-match-status');
  const startButton = $('deck-home-start');
  let chosen = null;

  async function json(path) {
    const response = await fetch(path);
    if (!response.ok) throw Error('対戦データを読み込めません。');
    return response.json();
  }
  const catalog = saved.loadCatalog();
  function render() {
    grid.replaceChildren();
    const query = $('deck-home-search').value.trim().toLocaleLowerCase();
    let decks;
    try { decks = saved.read().decks; }
    catch (error) { status.textContent = error.message; return; }
    for (const deck of decks) {
      const matches = name => name?.toLocaleLowerCase().includes(query);
      if (query && !matches(deck.name) &&
          !saved.rows(deck).some(([id]) => matches((cards.get(id) || cards.archive?.get(id))?.name)) &&
          !saved.blocked(deck).some(row => matches(row.name))) continue;
      const tile = document.createElement('article');
      tile.className = 'deck-home-card';
      const card = saved.cover(deck,cards);
      const image = document.createElement('img');
      image.src = card?.url || 'ui/card-back.svg';
      image.alt = card?.name || '';
      image.loading = 'lazy';
      const coverButton=document.createElement('button');
      coverButton.className='deck-cover';
      coverButton.setAttribute('aria-label',deck.name+'の内容を見る');
      coverButton.append(image);
      // Open the visual editor directly instead of the legacy text-only modal.
      coverButton.onclick=()=>{ location.href='deck-builder.html?deck='+encodeURIComponent(deck.id); };
      const title = document.createElement('h2');
      title.textContent = deck.name;
      const count = document.createElement('p');
      count.textContent = saved.total(deck) + ' / 60枚';
      const edit = document.createElement('a');
      edit.className = 'home-button';
      edit.href = 'deck-builder.html?deck=' + encodeURIComponent(deck.id);
      edit.textContent = '編集する';
      const play = document.createElement('button');
      play.textContent = '対戦する';
      play.onclick = () => prepare(deck.id,play);
      const actions = document.createElement('div');
      actions.className = 'deck-home-actions';
      actions.append(edit,play);
      tile.append(coverButton,title,count,actions);
      grid.append(tile);
    }
    status.textContent = grid.childElementCount ? '' :
      (query ? '該当するデッキがありません。' : '＋からデッキを作成できます。');
  }

  // Assemble both *chosen* 60-card print lists using the same official
  // readiness gate. Never swap a same-name print or silently use a fixed AI deck.
  function selectedManifest() {
    if (!chosen || !opponentSelect.value) throw Error('対戦相手のデッキを選んでください。');
    const savedDecks = saved.read().decks;
    const mine = savedDecks.find(deck => deck.id === chosen.ownId);
    if (!mine) throw Error('自分の保存デッキが見つかりません。');
    const mineCards = saved.matchEntries(mine,chosen.cards,chosen.plans);
    let opponent;
    if (opponentSelect.value.startsWith('saved:')) {
      const otherId = opponentSelect.value.slice('saved:'.length);
      const other = savedDecks.find(deck => deck.id === otherId);
      if (!other) throw Error('相手の保存デッキが見つかりません。');
      opponent = {id:other.id,name:other.name,cards:saved.matchEntries(other,chosen.cards,chosen.plans)};
    } else if (opponentSelect.value.startsWith('fixed:')) {
      const index = Number(opponentSelect.value.slice('fixed:'.length));
      if (!Number.isInteger(index) || index<0 || index>1 || !chosen.fixed.decks[index])
        throw Error('相手の固定デッキが見つかりません。');
      opponent = chosen.fixed.decks[index];
    } else throw Error('対戦相手のデッキを選んでください。');
    return {decks:[{id:mine.id,name:mine.name,cards:mineCards},opponent]};
  }

  function refreshOpponent() {
    pending = null;
    startButton.disabled = true;
    if (!opponentSelect.value) {
      matchStatus.textContent = '対戦相手を選んでください。';
      return;
    }
    try {
      const manifest = selectedManifest();
      pending = manifest;
      const [mine,opponent] = manifest.decks;
      matchStatus.textContent = mine.name+'（60枚） 対 '+opponent.name+'（60枚）';
      startButton.disabled = false;
    } catch (error) {
      matchStatus.textContent = error.message;
    }
  }

  async function prepare(id,button) {
    if (preparing || confirm.open) return;
    preparing = true;
    button.disabled = true;
    try {
      const decks = saved.read().decks;
      const deck = decks.find(entry => entry.id === id);
      if (!deck) throw Error('デッキが見つかりません。');
      matchData ||= Promise.all([catalog,json('./data/fixed-test-decks.json')])
        .catch(error => { matchData = null; throw error; });
      const [{cards,plans},fixed] = await matchData;
      chosen = {ownId:id,cards,plans,fixed};
      pending = null;
      startButton.disabled = true;
      opponentSelect.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '相手のデッキを選択';
      opponentSelect.append(placeholder);
      const savedGroup = document.createElement('optgroup');
      savedGroup.label = '保存済みデッキ';
      for (const opponent of decks) {
        const option = document.createElement('option');
        option.value = 'saved:'+opponent.id;
        option.textContent = opponent.name+'（'+saved.total(opponent)+'/60枚）';
        savedGroup.append(option);
      }
      opponentSelect.append(savedGroup);
      // Preset decks remain optional test opponents, never the implicit default.
      const fixedGroup = document.createElement('optgroup');
      fixedGroup.label = '固定参照デッキ（検証用）';
      fixed.decks.forEach((opponent,index) => {
        const option = document.createElement('option');
        option.value = 'fixed:'+index;
        option.textContent = opponent.name+'（60枚・検証用）';
        fixedGroup.append(option);
      });
      opponentSelect.append(fixedGroup);
      $('deck-home-selection').textContent = '自分：'+deck.name+'（'+saved.total(deck)+'/60枚）';
      matchStatus.textContent = '相手のデッキを選んでください。';
      confirm.returnValue = '';
      confirm.showModal();
    } catch (error) {
      chosen = null;
      pending = null;
      status.textContent = error.message;
    } finally {
      preparing = false;
      button.disabled = false;
    }
  }

  opponentSelect.addEventListener('change',refreshOpponent);
  confirm.addEventListener('close',async () => {
    const proceed = confirm.returnValue === 'start' && pending;
    pending = null;
    if (!proceed) { chosen = null; return; }
    let manifest;
    try {
      // Re-check saved print identity in case another tab edited either deck.
      manifest = selectedManifest();
    } catch (error) {
      status.textContent = '対戦開始できません：'+error.message;
      chosen = null;
      return;
    }
    chosen = null;
    history.pushState(null,'','#battle');
    route(false);
    try { await window.PokecaMobile.startSavedDeck(manifest); }
    catch (error) { location.hash = ''; route(false); status.textContent = 'BLOCKED · ' + error.message; }
  });

  function route(resume) {
    const battle = location.hash === '#battle';
    const enteringBattle=battle&&(!$('app').dataset.battleVisible);
    $('app').dataset.battleVisible=battle?'1':'';
    home.hidden = battle;
    document.documentElement.classList.toggle("deck-home-active", !battle);
    $('app').hidden = !battle;
    if(enteringBattle){
      window.scrollTo(0,0);
      requestAnimationFrame(()=>window.scrollTo(0,0));
    }
    if (battle && resume) window.PokecaMobile.resumeBattle();
    if (!battle) render();
  }
  $('battle-home').onclick = async event => {
    event.preventDefault();
    try { await window.PokecaMobile.returnToDecks(); location.hash = ''; }
    catch (error) { $('save-status').textContent = error.message; }
  };
  $('deck-home-search').oninput = render;
  window.addEventListener('hashchange', () => route(true));
  window.addEventListener('pageshow', () => route(false));
  catalog.then(result => {
    cards = result.cards;
    let restored=0, migrationError=null;
    try {restored=window.PokecaDeckCodeImport.migrateImports(localStorage,cards);}
    catch(error){migrationError=error;}
    if(!home.hidden) {
      render();
      if(migrationError)status.textContent='取り込み履歴の一覧反映を確認できません（'+migrationError.message+'）。保存履歴は変更していません。';
      else if(restored)status.textContent='保存済みの公式デッキ '+restored+'件を一覧に反映しました。';
    }
  }).catch(error => { status.textContent = error.message; });
  route(false);
})();
