(() => {
'use strict';
const api = window.PokecaDeckCodeImport;
const $ = id => document.getElementById(id);
const status = message => $('status').textContent = message;
const code = () => $('code').value.trim();
const recipeUrl = () => 'https://www.pokemon-card.com/deck/deck.html?deckID=' + encodeURIComponent(code());
let catalog;
let deck;
let request = 0;

function render(next) {
  deck = next;
  $('save').disabled = $('edit').disabled = !deck;
  $('cards').replaceChildren();
  if (!deck) return;
  for (const row of deck.cards) {
    const tile = document.createElement('div');
    tile.className = 'card';
    if (row.imageUrl) {
      const img = document.createElement('img');
      img.src = row.imageUrl;
      img.alt = row.name;
      img.loading = 'lazy';
      tile.append(img);
    }
    const label = document.createElement('strong');
    label.textContent = (row.name || 'カードID ' + row.officialCardId) + ' ×' + row.count;
    tile.append(label);
    if (row.identityStatus === 'BLOCKED') {
      const warning = document.createElement('small');
      warning.textContent = row.reason === 'OUT_OF_REGULATION' ?
        'BLOCKED · このG印刷版はH/I/J対戦の対象外' :
        row.reason === 'OFFICIAL_PRINT_UNVERIFIED' ?
        'BLOCKED · 公式画像は確認済み・印刷版の照合待ち' :
        'BLOCKED · 印刷版または画像を照合できません';
      tile.append(warning);
    }
    $('cards').append(tile);
  }
  status('60枚を解析しました。' + (deck.blockedCount ?
    '照合できないカードが' + deck.blockedCount + '行あります。編集画面で確認できます。' :
    'カードIDと公式画像を照合しました。'));
}

async function inspect(read) {
  const token = ++request;
  render(null);
  const value = code();
  if (!api.validCode(value)) return status('公式デッキコードを確認してください。');
  status('レシピを確認しています…');
  try {
    const parsed = await read(value);
    catalog ||= api.loadCatalog().catch(error => { catalog = null; throw error; });
    const next = api.matchCatalog(parsed, await catalog);
    if (token === request) render(next);
  } catch (error) {
    if (token === request) status(error.message);
  }
}

function history() {
  $('saved-decks').replaceChildren();
  for (const saved of api.readImports(localStorage)) {
    const button = document.createElement('button');
    button.textContent = (saved.name || saved.deckCode) + ' · 60枚';
    button.onclick = () => {
      $('code').value = saved.deckCode;
      $('open').href = recipeUrl();
      inspect(() => saved);
    };
    $('saved-decks').append(button);
  }
}

function save(edit) {
  if (!deck) return;
  try {
    api.saveImport(localStorage, deck);
    if (edit) location.href = 'deck-builder.html?import=' + encodeURIComponent(deck.deckCode);
    else { history(); status('端末に保存しました。'); }
  } catch {
    status('端末に保存できませんでした。');
  }
}

$('code').oninput = () => {
  ++request;
  $('open').href = recipeUrl();
  render(null);
  status('');
};
$('open').onclick = event => {
  if (!api.validCode(code())) {
    event.preventDefault();
    status('公式デッキコードを確認してください。');
  }
};
$('lookup').onsubmit = event => {
  event.preventDefault();
  const url = recipeUrl();
  inspect(async value => {
    let response;
    try {
      response = await fetch(url, {signal:AbortSignal.timeout(10000)});
    } catch {
      throw Error('公式ページを自動取得できません。公式レシピを開いてHTMLを選択してください。');
    }
    if (!response.ok) throw Error('公式レシピを取得できませんでした。コードを確認してください。');
    return api.parseHtml(await response.text(), value);
  });
};
$('html-file').onchange = () => {
  const file = $('html-file').files[0];
  if (file) inspect(async value => {
    if (file.size > 3000000) throw Error('公式レシピHTMLのサイズが不正です。');
    return api.parseHtml(await file.text(), value);
  });
  $('html-file').value = '';
};
$('import').onclick = () => inspect(value => api.parse($('recipe').value, value));
$('recipe').oninput = () => { ++request; render(null); status(''); };
$('save').onclick = () => save(false);
$('edit').onclick = () => save(true);
$('open').href = recipeUrl();
try { history(); } catch { status('取り込み履歴を読み込めませんでした。'); }
for (const id of ['code', 'lookup-submit', 'html-file', 'recipe', 'import']) {
  $(id).disabled = false;
}
})();
