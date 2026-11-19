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
          !saved.rows(deck).some(([id]) => matches(cards.get(id)?.name)) &&
          !saved.blocked(deck).some(row => matches(row.name))) continue;
      const tile = document.createElement('article');
      tile.className = 'deck-home-card';
      const card = saved.cover(deck,cards);
      const image = document.createElement('img');
      image.src = card?.url || 'ui/card-back.svg';
      image.alt = card?.name || '';
      image.loading = 'lazy';
      const title = document.createElement('h2');
      title.textContent = deck.name;
      const count = document.createElement('p');
      count.textContent = saved.total(deck) + ' / 60枚';
      const edit = document.createElement('a');
      edit.className = 'home-button';
      edit.href = 'deck-builder.html?deck=' + encodeURIComponent(deck.id);
      edit.textContent = '編集';
      const play = document.createElement('button');
      play.textContent = 'このデッキで対戦';
      play.onclick = () => prepare(deck.id,play);
      const actions = document.createElement('div');
      actions.className = 'deck-home-actions';
      actions.append(edit,play);
      tile.append(image,title,count,actions);
      grid.append(tile);
    }
    status.textContent = grid.childElementCount ? '' :
      (query ? '該当するデッキがありません。' : '＋からデッキを作成できます。');
  }

  async function prepare(id,button) {
    if (preparing || confirm.open) return;
    preparing = true;
    button.disabled = true;
    try {
      const deck = saved.read().decks.find(entry => entry.id === id);
      if (!deck) throw Error('デッキが見つかりません。');
      matchData ||= Promise.all([catalog,json('./data/fixed-test-decks.json')])
        .catch(error => { matchData = null; throw error; });
      const [{cards,plans},fixed] = await matchData;
      const entries = saved.matchEntries(deck,cards,plans);
      const opponent = fixed.decks[1];
      pending = {decks:[{id:deck.id,name:deck.name,cards:entries},opponent]};
      $('deck-home-selection').textContent = deck.name + '（60枚） · 相手は ' + opponent.name;
      confirm.returnValue = '';
      confirm.showModal();
    } catch (error) { status.textContent = error.message; }
    finally { preparing = false; button.disabled = false; }
  }

  confirm.addEventListener('close',async () => {
    const manifest = pending;
    pending = null;
    if (confirm.returnValue !== 'start' || !manifest) return;
    history.pushState(null,'','#battle');
    route(false);
    try { await window.PokecaMobile.startSavedDeck(manifest); }
    catch (error) { location.hash = ''; route(false); status.textContent = 'BLOCKED · ' + error.message; }
  });

  function route(resume) {
    const battle = location.hash === '#battle';
    home.hidden = battle;
    document.documentElement.classList.toggle("deck-home-active", !battle);
    $('app').hidden = !battle;
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
  catalog.then(result => { cards = result.cards; if (!home.hidden) render(); })
    .catch(error => { status.textContent = error.message; });
  route(false);
})();
