(() => {
'use strict';
const savedDecks = window.PokecaSavedDecks;
const KEY = savedDecks.key;
const params = new URLSearchParams(location.search);
const draftKey = 'pokeca.deck-draft.v1:' + (params.get('deck') || params.get('import') || 'new');
const api = window.PokecaDeckCodeImport;
const $ = id => document.getElementById(id);
const say = message => $('message').textContent = message;
const fresh = () => ({id:crypto.randomUUID(),name:'新しいデッキ',cards:{}});
const copy = deck => JSON.parse(JSON.stringify(deck));
const {rows,blocked,total,compositionError} = savedDecks;
const categories = new Map([
  ['pokemon','ポケモン'], ['goods','グッズ'], ['tool','ポケモンのどうぐ'],
  ['support','サポート'], ['stadium','スタジアム'], ['energy','エネルギー'],
  ['unclassified','分類未確認'], ['blocked','未照合']
]);
let plans = new Map();
let loaded = false;
let editingScroll = 0;
const searching = () => location.hash === '#search';
function categoryOf(card, recorded) {
  const category = ({item:'goods',supporter:'support'})[card?.category] || card?.category;
  return categories.has(category) ? category : (categories.has(recorded) ? recorded : 'unclassified');
}
function keepDraft() {
  try { sessionStorage.setItem(draftKey,JSON.stringify(current)); }
  catch { say('下書きを端末に保持できません。保存してください。'); }
}
function restoreDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey));
    if (draft?.cards && typeof draft.name === 'string') current = draft;
  } catch {}
}
function drawHeader() {
  $('header-name').textContent = current.name || '名称未設定';
  $('total').textContent = total(current) + ' / 60枚';
}
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

function deckStatus() {
  const unknown = blocked(current).length + rows(current).filter(([id]) => !cards.has(id)).length;
  if (unknown) return 'BLOCKED · 照合できないカードが' + unknown + '行あります。';
  const error = compositionError(current,cards,plans);
  if (error) return error;
  const unsupported = rows(current).filter(([id]) => !plans.has(id));
  return unsupported.length ? '保存できます · 対戦未対応のカード効果 '+unsupported.length+'種類' : '';
}

function addImage(parent, card) {
  const img = document.createElement('img');
  img.src = card?.url || "ui/card-back.svg";
  img.alt = card?.name || "";
  img.loading = 'lazy';
  img.draggable = false;
  // Prevent Android's native image menu; use the app's own preview instead.
  img.addEventListener('contextmenu',event=>event.preventDefault());
  let hold;
  let held = false;
  let activePointer = null;
  let startX = 0, startY = 0;
  let suppressNextClick = false;
  img.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse' && event.button!==0)return;
    if(activePointer!==null)return;
    activePointer=event.pointerId;
    startX=event.clientX;startY=event.clientY;
    held=false;
    hold=setTimeout(()=>{held=true;suppressNextClick=true;showPreview(card);},500);
  });
  img.addEventListener('pointermove',event=>{
    if(event.pointerId===activePointer&&Math.hypot(event.clientX-startX,event.clientY-startY)>12)clearTimeout(hold);
  });
  for(const name of ['pointerup','pointercancel','pointerleave'])
    img.addEventListener(name,()=>{clearTimeout(hold);activePointer=null;});
  img.addEventListener('click',event=>{
    if(held||suppressNextClick){event.preventDefault();event.stopPropagation();held=false;suppressNextClick=false;}
  },true);
  img.addEventListener('dragstart',event=>event.preventDefault());
  parent.append(img);
}
const previewDialog=$('card-preview');
let backdropPressed = false;
previewDialog.addEventListener('contextmenu',event=>event.preventDefault());
previewDialog.addEventListener('dragstart',event=>event.preventDefault());
previewDialog.addEventListener('pointerdown',event=>{
  backdropPressed = event.target === previewDialog;
});
previewDialog.addEventListener('click',event=>{
  if(backdropPressed && event.target===previewDialog)previewDialog.close();
  backdropPressed = false;
});
previewDialog.addEventListener('close',()=>{$('preview-image').removeAttribute('src');});
function showPreview(card){
  if(!card?.url)return;
  const dialog=$('card-preview');
  $('preview-image').src=card.url;
  $('preview-image').alt=card.name;
  $('preview-title').textContent=card.name;
  if(!dialog.open){
    backdropPressed = false;
    dialog.showModal();
  }
}

function control(text, label, action) {
  const button = document.createElement('button');
  button.textContent = text;
  button.setAttribute('aria-label',label);
  button.onclick = action;
  return button;
}

function drawDeck() {
  drawHeader();
  $('deck-name').value = current.name;
  const cover = $('deck-cover');
  cover.replaceChildren(new Option('自動',''));
  const entries = [];
  for (const [id,count] of rows(current)) {
    const card = cards.get(id) || cards.archive?.get(id);
    if (card) cover.add(new Option(card.name+' #'+id,id));
    entries.push({key:id,count,card,name:card?.name || 'カードID '+id,
      category:card?categoryOf(card,current.categories?.[id]):'blocked',
      change:delta=>change(id,delta)});
  }
  blocked(current).forEach((row,index) => entries.push({
    key:'blocked-'+index,count:row.count,name:row.name || 'カードID '+row.officialCardId,
    category:'blocked',change:()=>{
      if (--row.count===0) current.blocked.splice(index,1);
      drawDeck();
      keepDraft();
    }
  }));
  cover.value = current.coverCardId || '';
  if (!cover.value) cover.value = '';
  $('remove').disabled = !store.decks.some(deck=>deck.id===current.id);
  const overview = $('deck-overview'), list = $('deck-list');
  overview.replaceChildren();
  list.replaceChildren();
  if (!entries.length) overview.textContent = 'カードはまだありません。';
  for (const [category,title] of categories) {
    const group = entries.filter(entry=>entry.category===category);
    if (!group.length && ['unclassified','blocked'].includes(category)) continue;
    const heading = document.createElement('h2');
    heading.textContent = title+' '+group.reduce((sum,entry)=>sum+entry.count,0)+'枚';
    const section = document.createElement('div');
    section.className = 'builder-group';
    const grid = document.createElement('div');
    grid.className = 'builder-card-grid';
    section.append(heading,grid);
    list.append(section);
    for (const entry of group) {
      const {key,name,card,count} = entry;
      const tile = document.createElement('article');
      tile.className = 'builder-card';
      tile.id = 'editing-card-'+key;
      tile.tabIndex = -1;
      const thumb = control('',name+' ×'+count+'の編集へ',()=>{
        tile.focus({preventScroll:true});
        tile.scrollIntoView({block:'start'});
      });
      addImage(thumb,card);
      const badge = document.createElement('span');
      badge.className = 'overview-count';
      badge.textContent = '×'+count;
      thumb.append(badge);
      overview.append(thumb);
      addImage(tile,card);
      const label = document.createElement('strong');
      label.textContent = name;
      const quantity = document.createElement('div');
      quantity.className = 'builder-quantity';
      const amount = document.createElement('span');
      amount.textContent = count;
      const plus = control('＋',name+'を1枚増やす',()=>entry.change(1));
      plus.disabled = !cards.has(key);
      quantity.append(control('−',name+'を1枚減らす',()=>entry.change(-1)),amount,plus);
      tile.append(label,quantity);
      grid.append(tile);
    }
  }
  say(deckStatus());
}

function change(id,delta) {
  if (!loaded) return;
  const count = (current.cards[id] || 0) + delta;
  const next = {...current,cards:{...current.cards}};
  if (count>0) next.cards[id] = count;
  else delete next.cards[id];
  if (delta>0) {
    if (!cards.has(id)) return;
    const problem = compositionError(next,cards,plans);
    if (problem) { say(problem); return; }
  }
  current = next;
  if (searching()) {
    drawHeader();
    const amount = document.getElementById('in-deck-'+id);
    if (amount) amount.textContent = 'デッキ内 '+count+'枚';
    say(cards.get(id).name+'を追加しました。');
  } else drawDeck();
  keepDraft();
}

function drawCards() {
  const query = $('query').value.trim().toLowerCase();
  const category = $('category').value;
  const regulation = $('regulation').value;
  const matches = [...cards.values()].filter(card =>
    (!regulation || (regulation === 'basic' ? card.basicEnergy : card.regulationMark === regulation)) &&
    (!category || categoryOf(card,current.categories?.[card.id])===category) &&
    (card.name.toLowerCase().includes(query) || card.id.includes(query)));
  $('catalog-info').textContent = matches.length + '種類';
  $('more').hidden = matches.length<=limit;
  const grid = $('cards');
  grid.replaceChildren();
  for (const card of matches.slice(0,limit)) {
    const tile = document.createElement('div');
    tile.className = 'builder-card';
    addImage(tile,card);
    const label = document.createElement('strong');
    label.textContent = card.name;
    const print = document.createElement('small');
    print.textContent = [card.regulationMark || '基本エネルギー',card.pack,card.number,'#'+card.id].filter(Boolean).join(' ');
    const amount = document.createElement('small');
    amount.id = 'in-deck-'+card.id;
    amount.textContent = 'デッキ内 '+(current.cards[card.id]||0)+'枚';
    const add = control('＋ 追加',card.name+'を追加',() => change(card.id,1));
    add.className = 'add-card';
    add.disabled = !loaded;
    const effect = document.createElement('small');
    effect.textContent = plans.has(card.id) ? '対戦対応' : '対戦未対応';
    tile.append(label,print,effect,amount,add);
    grid.append(tile);
  }
}

function persist(decks, storeSnapshot) {
  try {
    if (!storageReady) throw Error('保存形式が不正です');
    const next = {...storeSnapshot,decks};
    localStorage.setItem(KEY,JSON.stringify(next));
    try { sessionStorage.removeItem(draftKey); } catch {}
    location.href = './';
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
  const deck = {id,name:imported.name || '取り込んだデッキ',cards:{},categories:{},blocked:[],sourceDeckCode:code};
  for (const row of checked.cards) {
    if (row.identityStatus === 'CONFIRMED') {
      deck.categories[row.officialCardId] = categoryOf(null,row.category);
      deck.cards[row.officialCardId] = (deck.cards[row.officialCardId] || 0) + row.count;
    } else deck.blocked.push(row);
  }
  current = deck;
}

$('deck-cover').onchange = event => { current.coverCardId = event.target.value; keepDraft(); };
$('deck-name').oninput = event => { current.name = event.target.value; drawHeader(); keepDraft(); };
$('query').oninput = $('category').onchange = $('regulation').onchange = () => { limit = 48; drawCards(); };
$('more').onclick = () => { limit += 48; drawCards(); };
$('category').add(new Option('すべて',''));
for(const [key,label] of categories) if(key!=='blocked') $('category').add(new Option(label,key));
$('save').onclick = () => {
  current.name = current.name.trim() || '名称未設定';
  try {
    const latest = savedDecks.read();
    const decks = latest.decks.filter(deck=>deck.id!==current.id);
    const index = latest.decks.findIndex(deck=>deck.id===current.id);
    decks.splice(index<0?decks.length:index,0,copy(current));
    persist(decks,latest);
  } catch { say('保存データを更新できませんでした。'); }
};
$('duplicate').onclick = () => {
  current = copy(current);
  current.id = crypto.randomUUID();
  current.name = current.name.slice(0,56) + ' コピー';
  drawDeck();
  keepDraft();
  say('複製しました。「保存」で一覧に追加します。');
};
$('remove').onclick = () => {
  if (!confirm('保存デッキを削除しますか？')) return;
  try { const latest=savedDecks.read(); persist(latest.decks.filter(deck=>deck.id!==current.id),latest); }
  catch { say('保存データを更新できませんでした。'); }
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

function route() {
  const search = searching();
  $('screen-name').textContent = search ? 'カード検索・追加' : 'デッキ編集';
  $('builder-back').textContent = search ? '‹ デッキ編集' : '‹ デッキ一覧';
  $('builder-back').href = search ? '#' : './';
  $('editor-screen').hidden = search;
  $('search-screen').hidden = !search;
  if (!loaded) return;
  if (search) { say(''); drawCards(); window.scrollTo(0,0); }
  else { drawDeck(); window.scrollTo(0,editingScroll); }
}
$('editor-screen').querySelector('a[href="#search"]').onclick = event => {
  event.preventDefault();
  if (!loaded) return;
  editingScroll = window.scrollY;
  history.pushState({deckSearch:true},'', '#search');
  route();
};
$('builder-back').onclick = event => {
  if (!searching() || !history.state?.deckSearch) return;
  event.preventDefault();
  history.back();
};
window.addEventListener('hashchange',route);
route();
$('catalog-info').textContent = 'カード台帳を読み込んでいます…';
savedDecks.loadCatalog().then(catalog => {
  cards = catalog.cards;
  plans = catalog.plans;
  loadImport();
  restoreDraft();
  loaded = true;
  $('deck-name').disabled = $('save').disabled = false;
  drawHeader();
  route();
}).catch(error => { say(error.message); });
})();
