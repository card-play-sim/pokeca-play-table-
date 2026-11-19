(() => {
'use strict';
const savedDecks = window.PokecaSavedDecks;
const KEY = savedDecks.key;
const params = new URLSearchParams(location.search);
const fromList = params.has('new') || params.has('deck') || params.has('import');
const api = window.PokecaDeckCodeImport;
const $ = id => document.getElementById(id);
const say = message => $('message').textContent = message;
const fresh = () => ({id:crypto.randomUUID(),name:'新しいデッキ',cards:{}});
const copy = deck => JSON.parse(JSON.stringify(deck));
const {rows,blocked,total,basicEnergy,cover} = savedDecks;
const trainer = new Set(['trainer','goods','item','tool','support','supporter','stadium']);
let cards = new Map();
let current = fresh();
let limit = 48;
let store = {decks:[]};
let storageReady = true;

try {
  store = savedDecks.read();
} catch {
  storageReady = false;
}

function nameCount(name) {
  return rows(current).reduce((n,[id,count]) => n+(cards.get(id)?.name===name ? count : 0),0);
}

function deckStatus() {
  const unknown = blocked(current).length + rows(current).filter(([id]) => !cards.has(id)).length;
  if (unknown) return 'BLOCKED · 照合できないカードが' + unknown + '行あります。';
  for (const [id] of rows(current)) {
    const card = cards.get(id);
    if (!basicEnergy(card) && nameCount(card.name)>4) return card.name + 'が同名4枚を超えています。';
  }
  return total(current) === 60 ? '60枚・同名枚数の基本チェック完了' : '編集中 · あと' + (60-total(current)) + '枚';
}

function addImage(parent, card) {
  if (!card?.url) return;
  const img = document.createElement('img');
  img.src = card.url;
  img.alt = card.name;
  img.loading = 'lazy';
  parent.append(img);
}

function control(text, label, action) {
  const button = document.createElement('button');
  button.textContent = text;
  button.setAttribute('aria-label',label);
  button.onclick = action;
  return button;
}

function drawSaved() {
  const grid = $('saved');
  grid.replaceChildren();
  if (!store.decks.length) grid.textContent = '保存したデッキはありません。';
  for (const deck of store.decks) {
    const button = document.createElement('button');
    button.className = 'saved-deck';
    addImage(button, cover(deck,cards));
    const label = document.createElement('span');
    label.textContent = deck.name + ' · ' + total(deck) + '枚';
    button.append(label);
    button.onclick = () => { current = copy(deck); drawDeck(); };
    grid.append(button);
  }
  $('remove').disabled = !store.decks.some(deck => deck.id === current.id);
}

function drawDeck() {
  $('deck-name').value = current.name;
  const select = $('deck-cover');
  select.replaceChildren(new Option('自動', ''));
  for (const [id] of rows(current)) {
    const card = cards.get(id);
    if (card) select.add(new Option(card.name + ' #' + id,id));
  }
  select.value = current.coverCardId || '';
  if (!select.value) select.value = '';
  $('total').textContent = total(current) + ' / 60枚';
  const grid = $('deck-list');
  grid.replaceChildren();
  for (const [id,count] of rows(current)) {
    const card = cards.get(id);
    const name = card?.name || 'BLOCKED · カードID ' + id;
    const tile = document.createElement('div');
    tile.className = 'card';
    addImage(tile,card);
    const label = document.createElement('strong');
    label.textContent = name + ' ×' + count;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(control('−',name+'を1枚減らす',() => change(id,-1)));
    if (card) actions.append(control('＋',name+'を1枚増やす',() => change(id,1)));
    actions.append(control('削除',name+'をすべて削除',() => change(id,-count)));
    tile.append(label,actions);
    grid.append(tile);
  }
  for (const [index,row] of blocked(current).entries()) {
    const tile = document.createElement('div');
    tile.className = 'card';
    const name = row.name || 'カードID ' + row.officialCardId;
    const label = document.createElement('strong');
    label.textContent = 'BLOCKED · ' + name + ' ×' + row.count;
    tile.append(label,control('削除',name+'をすべて削除',() => {
      current.blocked.splice(index,1);
      drawDeck();
    }));
    grid.append(tile);
  }
  say(deckStatus());
  drawSaved();
}

function change(id,delta) {
  const card = cards.get(id);
  if (delta > 0 && (!card || total(current)>=60 || (!basicEnergy(card) && nameCount(card.name)>=4))) {
    say('60枚上限または同名4枚制限です。');
    return;
  }
  const count = (current.cards[id] || 0) + delta;
  if (count>0) current.cards[id] = count;
  else delete current.cards[id];
  drawDeck();
}

function drawCards() {
  const query = $('query').value.trim().toLowerCase();
  const category = $('category').value;
  const matches = [...cards.values()].filter(card =>
    (!category || card.category===category || (category==='trainer' && trainer.has(card.category))) &&
    (card.name.toLowerCase().includes(query) || card.id.includes(query)));
  $('catalog-info').textContent = matches.length + '種類';
  $('more').hidden = matches.length<=limit;
  const grid = $('cards');
  grid.replaceChildren();
  for (const card of matches.slice(0,limit)) {
    const tile = document.createElement('div');
    tile.className = 'card';
    addImage(tile,card);
    const label = document.createElement('strong');
    label.textContent = card.name;
    const print = document.createElement('small');
    print.textContent = [card.pack,card.number,'#'+card.id].filter(Boolean).join(' ');
    tile.append(label,print,control('＋ 追加',card.name+'を追加',() => change(card.id,1)));
    grid.append(tile);
  }
}

function persist(decks, message, returnToList = false) {
  try {
    if (!storageReady) throw Error('保存形式が不正です');
    const next = {...store,decks};
    localStorage.setItem(KEY,JSON.stringify(next));
    store = next;
    if (returnToList) { location.href = './'; return; }
    drawSaved();
    say(message);
  } catch {
    say('保存データを更新できませんでした。');
  }
}

function loadImport() {
  const deckId = params.get('deck');
  if (deckId) {
    const deck = store.decks.find(entry => entry.id === deckId);
    if (!deck) throw Error('保存したデッキが見つかりません。');
    current = copy(deck);
    return;
  }
  const code = params.get('import');
  if (!code) return;
  const imported = api.readImports(localStorage).find(deck => deck.deckCode === code);
  if (!imported) throw Error('取り込んだレシピが見つかりません。');
  const id = 'official-' + code;
  const existing = store.decks.find(deck => deck.id === id);
  if (existing) { current = copy(existing); return; }
  const checked = api.matchCatalog(imported,cards);
  const deck = {id,name:imported.name || code,cards:{},blocked:[],sourceDeckCode:code};
  for (const row of checked.cards) {
    if (row.identityStatus === 'CONFIRMED') {
      deck.cards[row.officialCardId] = (deck.cards[row.officialCardId] || 0) + row.count;
    } else deck.blocked.push(row);
  }
  current = deck;
}

$('deck-cover').onchange = event => { current.coverCardId = event.target.value; };
$('deck-name').oninput = event => current.name = event.target.value;
$('query').oninput = $('category').onchange = () => { limit = 48; drawCards(); };
$('more').onclick = () => { limit += 48; drawCards(); };
$('new').onclick = () => { current = fresh(); drawDeck(); };
$('save').onclick = () => {
  current.name = current.name.trim() || '名称未設定';
  $('deck-name').value = current.name;
  const decks = [...store.decks];
  const index = decks.findIndex(deck => deck.id === current.id);
  decks[index < 0 ? decks.length : index] = copy(current);
  persist(decks,'保存しました。' + deckStatus(),fromList);
};
$('duplicate').onclick = () => {
  current = copy(current);
  current.id = crypto.randomUUID();
  current.name = current.name.slice(0,56) + ' コピー';
  drawDeck();
  say('複製しました。「保存」で一覧に追加します。');
};
$('remove').onclick = () => {
  if (!confirm('保存デッキを削除しますか？')) return;
  persist(store.decks.filter(deck => deck.id !== current.id),'保存デッキを削除しました。',fromList);
};
$('export').onclick = () => {
  const blob = new Blob([JSON.stringify({schemaVersion:1,deck:current},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pokeca-deck.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};

drawDeck();
$('catalog-info').textContent = 'カード台帳を読み込んでいます…';
savedDecks.loadCatalog().then(catalog => {
  cards = catalog.cards;
  drawCards();
  loadImport();
  drawDeck();
}).catch(error => { $('catalog-info').textContent = error.message; });
})();
