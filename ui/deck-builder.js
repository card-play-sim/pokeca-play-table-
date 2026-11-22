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
const selectedPrints = new Map();
let refreshSearchCounts = () => {};

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
  let activePointer = null;
  let startX = 0, startY = 0;
  let suppressNextClick = false;
  img.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse' && event.button!==0)return;
    if(activePointer!==null)return;
    suppressNextClick=false;
    activePointer=event.pointerId;
    startX=event.clientX;startY=event.clientY;
    hold=setTimeout(()=>{suppressNextClick=true;showPreview(card);},500);
    // The preview can receive the release instead of the thumbnail.
    const endPress=release=>{
      if(release.pointerId!==activePointer)return;
      clearTimeout(hold);
      activePointer=null;
      window.removeEventListener('pointerup',endPress,true);
      window.removeEventListener('pointercancel',endPress,true);
    };
    window.addEventListener('pointerup',endPress,true);
    window.addEventListener('pointercancel',endPress,true);
  });
  img.addEventListener('pointermove',event=>{
    if(event.pointerId===activePointer&&Math.hypot(event.clientX-startX,event.clientY-startY)>12){
      clearTimeout(hold);
    }
  });
  img.addEventListener('click',event=>{
    if(suppressNextClick && event.detail){event.preventDefault();event.stopPropagation();suppressNextClick=false;}
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
    card:row.imageUrl?.startsWith('https://www.pokemon-card.com/assets/images/card_images/') ?
      {id:String(row.officialCardId),name:row.name,url:row.imageUrl,category:row.category} : null,
    reason:row.reason,category:'blocked',change:()=>{
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
      if (entry.reason) {
        const note = document.createElement('small');
        note.textContent = entry.reason === 'OUT_OF_REGULATION' ?
          '対象外のレギュレーション（この版は使用不可）' :
          entry.reason === 'OFFICIAL_PRINT_UNVERIFIED' ?
          '画像確認済み・印刷版の照合待ち' : '公式カードの照合待ち';
        tile.append(note);
      }
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
    drawDeck();
    refreshSearchCounts();
    say(cards.get(id).name+'を追加しました。');
  } else drawDeck();
  keepDraft();
}

function showPrintChooser(variants, select) {
  const dialog = $('print-chooser');
  const grid = $('chooser-cards');
  $('chooser-title').textContent = variants[0].name + ' · 絵柄・収録版を選ぶ';
  grid.replaceChildren();
  for (const variant of variants) {
    const tile = document.createElement('article');
    tile.className = 'builder-card';
    const imageButton = control('',variant.name+' #'+variant.id+'を選択',()=>{
      select(variant);
      dialog.close();
    });
    imageButton.className = 'search-card-tap';
    addImage(imageButton,variant);
    const meta = document.createElement('small');
    meta.textContent = [variant.regulationMark || '基本エネルギー',variant.pack,variant.number,'#'+variant.id].filter(Boolean).join(' ');
    const effect = document.createElement('small');
    effect.textContent = plans.has(variant.id) ? '対戦対応' : '対戦未対応';
    const choose = control('この版を選ぶ',variant.name+' #'+variant.id+'を選ぶ',()=>{
      select(variant);
      dialog.close();
    });
    tile.append(imageButton,meta,effect,choose);
    grid.append(tile);
  }
  dialog.showModal();
}

function drawCards() {
  const query = $('query').value.trim().toLowerCase();
  const category = $('category').value;
  const regulation = $('regulation').value;
  const matches = [...cards.values()].filter(card =>
    (!regulation || (regulation === 'basic' ? card.basicEnergy : card.regulationMark === regulation)) &&
    (!category || categoryOf(card,current.categories?.[card.id])===category) &&
    (card.name.toLowerCase().includes(query) || card.id.includes(query)));
  const categoryOrder = [...categories.keys()];
  const japanese = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});
  matches.sort((a,b) =>
    categoryOrder.indexOf(categoryOf(a)) - categoryOrder.indexOf(categoryOf(b)) ||
    japanese.compare(a.name,b.name) ||
    japanese.compare(a.pack || '',b.pack || '') ||
    japanese.compare(a.number || '',b.number || '') ||
    japanese.compare(a.id,b.id));
  // A visible result is a name/category, not a single printing. Never remove
  // official print IDs: the chooser keeps every illustration, reprint and effect.
  const groups = new Map();
  for (const card of matches) {
    const key = categoryOf(card) + '\u0000' + card.name;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(card);
  }
  $('catalog-info').textContent = groups.size + '種類（公式印刷版 '+matches.length+'件）';
  $('more').hidden = groups.size<=limit;
  const grid = $('cards');
  grid.replaceChildren();
  const counters = [];
  for (const [key,variants] of [...groups].slice(0,limit)) {
    let card = variants.find(variant => variant.id === selectedPrints.get(key)) ||
      variants.find(variant => (current.cards[variant.id] || 0) > 0) ||
      variants.find(variant => plans.has(variant.id)) || variants[0];
    const tile = document.createElement('article');
    tile.className = 'builder-card';
    const imageButton = control('',card.name+'を1枚追加',()=>change(card.id,1));
    imageButton.className = 'search-card-tap';
    const label = document.createElement('strong');
    label.textContent = card.name;
    const print = document.createElement('small');
    const effect = document.createElement('small');
    const amount = document.createElement('small');
    const combined = document.createElement('small');
    const add = control('＋ 追加',card.name+'を追加',()=>change(card.id,1));
    add.className = 'add-card';
    add.disabled = !loaded;
    const updateCount = () => {
      const sameNameCount = Object.entries(current.cards).reduce((sum,[id,count]) => {
        const entry = cards.get(id);
        return sum + (entry && entry.name===card.name && entry.category===card.category ? count : 0);
      },0);
      amount.textContent = 'デッキ内 '+(current.cards[card.id]||0)+'枚';
      combined.textContent = '同名合計 '+sameNameCount+'枚';
    };
    const selectPrint = selected => {
      card = selected;
      selectedPrints.set(key,selected.id);
      amount.id = 'in-deck-'+card.id;
      imageButton.replaceChildren();
      addImage(imageButton,card);
      imageButton.setAttribute('aria-label',card.name+' #'+card.id+'を1枚追加');
      print.textContent = [card.regulationMark || '基本エネルギー',card.pack,card.number,'#'+card.id].filter(Boolean).join(' ');
      effect.textContent = plans.has(card.id) ? '対戦対応' : '対戦未対応';
      updateCount();
    };
    tile.append(imageButton,label,print,effect,amount,combined,add);
    if (variants.length>1) {
      const chooser = control('絵柄・収録版 '+variants.length+'種',card.name+'の絵柄・収録版を選ぶ',()=>showPrintChooser(variants,selectPrint));
      chooser.className = 'print-chooser-open';
      tile.append(chooser);
    }
    selectPrint(card);
    counters.push(updateCount);
    grid.append(tile);
  }
  refreshSearchCounts = () => counters.forEach(update => update());
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

// Re-evaluate exact official IDs after a catalog update without changing a
// print to a different illustration or bypassing any engine-effect BLOCKED.
function refreshBlockedPrints() {
  if (!Array.isArray(current.blocked) || !current.blocked.length) return;
  const unresolved = [];
  let changed = false;
  for (const row of current.blocked) {
    const exact = api.matchCatalog({source:'official-recipe-html',cards:[row]},cards).cards[0];
    if (exact.identityStatus === 'CONFIRMED') {
      const id = String(exact.officialCardId);
      current.cards[id] = (current.cards[id] || 0) + row.count;
      current.categories = current.categories || {};
      current.categories[id] = categoryOf(null,row.category);
      changed = true;
    } else {
      unresolved.push(exact);
      if (exact.imageUrl !== row.imageUrl || exact.reason !== row.reason) changed = true;
    }
  }
  current.blocked = unresolved;
  if (changed) keepDraft();
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
  $('editor-screen').hidden = false;
  $('search-screen').hidden = !search;
  document.body.classList.toggle('deck-search-open',search);
  if (!loaded) return;
  if (search) { say(''); drawDeck(); drawCards(); }
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
$('close-picker').onclick = event => {
  event.preventDefault();
  if (history.state?.deckSearch) history.back();
  else { history.replaceState(null,'',location.pathname+location.search); route(); }
};
window.addEventListener('hashchange',route);
route();
$('catalog-info').textContent = 'カード台帳を読み込んでいます…';
savedDecks.loadCatalog().then(catalog => {
  cards = catalog.cards;
  plans = catalog.plans;
  loadImport();
  restoreDraft();
  refreshBlockedPrints();
  loaded = true;
  $('deck-name').disabled = $('save').disabled = false;
  drawHeader();
  route();
}).catch(error => { say(error.message); });
})();
