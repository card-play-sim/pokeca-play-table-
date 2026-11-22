/* Official deck recipe text parser: no identity inference. */
(function(root){'use strict';
const groups={'ポケモン':'pokemon','グッズ':'goods','ポケモンのどうぐ':'tool','サポート':'support','スタジアム':'stadium','エネルギー':'energy'};
const validCode=x=>/^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/.test(x);
function parse(text,code){
 if(!validCode(code))throw Error('デッキコード形式が不正です');
 if(typeof text!=='string'||text.length>1000000)throw Error('レシピ文字列が不正です');
 const lines=text.replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
 const embeddedCode = lines.join('\n').match(/デッキコード\s*\[([^\]]+)\]/);
 if(embeddedCode && embeddedCode[1]!==code)throw Error('入力したコードとレシピが一致しません');
 const rows=[],declared={};let group='',pending=null,pack=null,number=null;
 const flush=count=>{
  if(!pending||!Number.isInteger(count)||count<1||count>60)throw Error('カード枚数が不正です');
  rows.push({name:pending,category:group,pack,number,count});
  pending=null;pack=null;number=null;
 };
 for(const line of lines){
  const header=line.match(/^(ポケモンのどうぐ|ポケモン|グッズ|サポート|スタジアム|エネルギー)\s*[（(](\d+)[)）]/);
  if(header){if(pending)throw Error('公式レシピのカード枚数が欠落しています');group=groups[header[1]];declared[group]=Number(header[2]);continue}
  if(!group||/^(削除|調整用カード|すべてを|選択されたカード|デッキ登録|レギュレーションチェック|リスト表示|画像表示|現在のデッキ内)/.test(line)||/^[-─]+$/.test(line))continue;
  if(pending){const quantity=line.match(/^[|｜]\s*(\d+)\s*(?:枚)?(?:\s*[|｜].*)?$/)||line.match(/^(\d+)\s*枚?$/);if(quantity){flush(Number(quantity[1]));continue}}
  const compact=line.match(/^(.+?)\s*[|｜]\s*(\d+)\s*(?:枚)?$/);
  if(compact&&!line.startsWith('[Input]')){if(pending)throw Error('公式レシピのカード枚数が欠落しています');pending=compact[1].trim();flush(Number(compact[2]));continue}
  const nameLine=line.match(/^(?:\[Input\]\s*)?[|｜]\s*(.+?)(?:\s*[|｜]\s*(\d+)\s*(?:枚)?\s*)?$/);
  if(nameLine&&nameLine[1]!=='削除'){
   if(pending)throw Error('公式レシピのカード枚数が欠落しています');
   pending=nameLine[1].trim();if(nameLine[2])flush(Number(nameLine[2]));continue;
  }
  if(pending){
   const countLine=line.match(/^[|｜]\s*(\d+)\s*(?:枚)?(?:\s*[|｜].*)?$/)||line.match(/^(\d+)\s*枚?$/);
   if(countLine){flush(Number(countLine[1]));continue}
   if(!pack&&/^[A-Za-z][A-Za-z0-9-]{0,12}$/.test(line)){pack=line;continue}
   if(!number&&/^\d{1,4}\s*\/\s*(?:\d{1,4}|[A-Za-z]-P)$/.test(line)){number=line;continue}
  }
 }
 if(pending)throw Error('公式レシピのカード枚数が欠落しています');
 const total=rows.reduce((a,r)=>a+r.count,0);
 if(total!==60)throw Error('60枚の公式レシピを解析できませんでした（解析 '+total+'枚）。不完全な情報は保存しません');
 for(const [category,count] of Object.entries(declared)){
  if(rows.filter(r=>r.category===category).reduce((n,r)=>n+r.count,0)!==count)throw Error('公式レシピの分類別枚数が不一致: '+category);
 }
 return {schemaVersion:1,source:'official-recipe-text',deckCode:code,total,cards:rows,identityStatus:'UNVERIFIED',playable:false};
}

const fields = {deck_pke:'pokemon', deck_gds:'goods', deck_tool:'tool',
 deck_tech:'tool', deck_sup:'support', deck_sta:'stadium', deck_ene:'energy'};
const IMPORT_KEY = 'pokeca.official-deck-imports.v1';
function parseFields(values, code) {
 if (!validCode(code) || values.saveDeckID !== code) throw Error('入力したコードと公式レシピが一致しません');
 const cards = [];
 for (const [field, category] of Object.entries(fields)) {
  if (typeof values[field] !== 'string') throw Error('公式レシピの項目が不足しています');
  if (!values[field]) continue;
  for (const entry of values[field].split('-')) {
   const match = /^(\d{1,12})_([1-9]\d?)_([01])$/.exec(entry);
   if (!match) throw Error('公式レシピのカードIDまたは枚数が不正です');
   const [, officialCardId, count] = match;
   cards.push({officialCardId, category, count:Number(count)});
  }
 }
 if (cards.reduce((n,row)=>n+row.count,0)!==60) throw Error('60枚の公式レシピを解析できませんでした');
 return {schemaVersion:1,source:'official-recipe-html',deckCode:code,total:60,cards,identityStatus:'UNVERIFIED',playable:false};
}
function parseHtml(html, code) {
 if (typeof html !== 'string' || html.length > 3000000) throw Error('公式レシピHTMLのサイズが不正です');
 // Read only the official hidden fields. Never execute or insert uploaded HTML.
 const doc = new DOMParser().parseFromString(html.replace(/<[^>]*>/g, tag =>
  /^<input[\s>]/i.test(tag) ? tag : ''), 'text/html');
 const values = {};
 for (const key of ['saveDeckID', ...Object.keys(fields)]) {
  const inputs = doc.querySelectorAll('input[type="hidden"][name="'+key+'"]');
  if (inputs.length !== 1) throw Error('公式デッキ構築ページのHTMLを選んでください');
  values[key] = inputs[0].value;
 }
 return parseFields(values, code);
}
function catalogFrom(registry, formal, classification = {records:[]}, imageExtension = {cards:[]}, printExtension = {records:[]}) {
 // Additional official prints require exact official page/JPEG hash evidence.
 // Historical G prints are accepted only where an explicit hash-bound
 // current official standard-format legacy-card exception authorizes them.
 const verifiedPrints = (Array.isArray(printExtension.records) ? printExtension.records : []).filter(row =>
  row.verified === true && /^[1-9][0-9]*$/.test(String(row.officialCardId)) &&
  row.source?.url === row.officialPageUrl && /^[a-f0-9]{64}$/.test(row.source?.sha256) &&
  row.source?.identityName === row.name && row.source?.identityImageUrl === row.imageSourceUrl &&
  /^[a-f0-9]{64}$/.test(row.markEvidence?.imageSha256) &&
  row.officialPageUrl === 'https://www.pokemon-card.com/card-search/details.php/card/'+row.officialCardId &&
  /^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\//.test(row.imageSourceUrl) &&
  ['G','H','I','J'].includes(row.regulationMark));
 const classified = new Map(classification.records.map(row => [String(row.officialCardId), row]));
 const primary = [...(Array.isArray(registry.cards) ? registry.cards : Object.values(registry.imageByOfficialCardId || {})),
  ...(Array.isArray(imageExtension.cards) ? imageExtension.cards : [])];
 const ids = new Set(primary.map(row => String(row.officialCardId)));
 // The hash-bound official print may correct an older registry record with the
 // same exact numerical ID. Keep the original registry unchanged; use the
 // official page/JPEG evidence only inside the importer catalog view.
 const overrides = new Map(verifiedPrints.map(row => [String(row.officialCardId),row]));
 const rows = [...primary.map(row => overrides.get(String(row.officialCardId)) || row),
  ...verifiedPrints.filter(row => !ids.has(String(row.officialCardId)))];
 const reviewed = new Map();
 for (const row of verifiedPrints) {
  const id = String(row.officialCardId);
  // The official image and exact page digest are the authoritative identity
  // for an added print. Do not silently change the protected classification
  // JSON; replace only this read-only lookup's potentially stale record.
  classified.set(id,row);
  reviewed.set(id,row);
 }
 const formalById = new Map((Array.isArray(formal.records) ? formal.records : Object.values(formal.records || {}))
  .map(row => [String(row.officialCardId), row]));
 const duplicates = new Set();
 const cards = new Map();
 cards.archive = new Map();
 const seen = new Set();
 for (const row of rows) {
  const id = String(row.officialCardId || '');
  const url = row.imageSourceUrl;
  if (!/^\d+$/.test(id) || row.verified === false || !row.name ||
   !new RegExp('^https://www\\.pokemon-card\\.com/card-search/details\\.php/card/'+id+'(?:/|$)').test(row.officialPageUrl) ||
   !/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\//.test(url)) continue;
  if (seen.has(id)) { duplicates.add(id); continue; }
  seen.add(id);
  const reviewedPrint = reviewed.get(id);
  const archiveVerified = reviewedPrint && reviewedPrint.name === row.name &&
   reviewedPrint.imageSourceUrl === url && reviewedPrint.set === row.set &&
   reviewedPrint.cardNumber === row.cardNumber;
  cards.archive.set(id,{id,name:row.name,url,pack:row.set,number:row.cardNumber,
    category:archiveVerified ? reviewedPrint.category : 'unknown',
    regulationMark:archiveVerified ? reviewedPrint.regulationMark : undefined});
  const evidence = formalById.get(id);
  if (evidence && (evidence.name !== row.name ||
     (evidence.set && row.set && evidence.set !== row.set) ||
     (evidence.cardNumber && row.cardNumber && evidence.cardNumber !== row.cardNumber))) continue;
  const proof = classified.get(id);
  const categories = ['pokemon','goods','support','tool','stadium','energy'];
  if (!proof || !categories.includes(proof.category) ||
      !/^[a-f0-9]{64}$/.test(proof.source?.sha256) ||
      proof.source.identityName !== row.name || proof.source.identityImageUrl !== url ||
      !(proof.source.url === row.officialPageUrl || proof.source.kind === 'official-filtered-search' &&
        /^https:\/\/www\.pokemon-card\.com\/card-search\/resultAPI\.php\?/.test(proof.source.url)) ||
      !(['H','I','J'].includes(proof.regulationMark) && proof.legality === 'printed-hij' &&
         /^[a-f0-9]{64}$/.test(proof.markEvidence?.imageSha256) ||
        proof.basicEnergy === true && proof.category === 'energy' &&
         proof.source.heading === '基本エネルギー' && proof.legality === 'official-basic-energy-exception' ||
        proof.regulationMark === 'G' && proof.name === 'ボスの指令' && proof.category === 'support' &&
         proof.legality === 'official-legacy-reprint-exception' &&
         proof.exceptionEvidence?.rulePageUrl === 'https://www.pokemon-card.com/rules/regulation/' &&
         proof.exceptionEvidence?.ruleName === 'ボスの指令' &&
         /^[a-f0-9]{64}$/.test(proof.exceptionEvidence?.rulePageSha256))) continue;
  cards.set(id, {id,name:row.name,url,category:proof.category,pack:proof.pack,number:proof.number,
    regulationMark:proof.regulationMark,basicEnergy:proof.basicEnergy,aceSpec:proof.aceSpec,
    pokemonStage:proof.pokemonStage});
 }
 for (const id of duplicates) { cards.delete(id); cards.archive.delete(id); }
 return cards;
}
async function loadCatalog() {
 const read = async path => {
  const response = await fetch(path);
  if (!response.ok) throw Error('カード台帳を読み込めませんでした');
  return response.json();
 };
 const [registry, formal, classification, m7ImageExtension, officialPrintExtension] = await Promise.all([
  read('data/official-image-registry.json'), read('data/reference-effects/catalog.json'),
  read('data/deck-building/catalog.json'), read('data/deck-building/m7-official-image-extension.json'),
  read('data/deck-building/official-import-verified-extension.json')
 ]);
 const cards = catalogFrom(registry, formal, classification, m7ImageExtension, officialPrintExtension);
 if (!cards.size) throw Error('照合可能なカードがありません');
 return cards;
}
function matchCatalog(deck, cards) {
 const exactId = deck.source === 'official-recipe-html';
 const output = deck.cards.map(row => {
  const matches = exactId ? [cards.get(row.officialCardId)].filter(Boolean) :
   [...cards.values()].filter(card => row.pack && row.number &&
    card.name === row.name && card.pack === row.pack &&
    card.number === row.number.replace(/\s/g,''));
  if (matches.length !== 1) {
   const archived = exactId ? cards.archive?.get(String(row.officialCardId)) : null;
   return {...row, name:archived?.name || row.name, imageUrl:archived?.url,
    regulationMark:archived?.regulationMark,
    identityStatus:'BLOCKED',
    reason:matches.length ? 'AMBIGUOUS_PRINT' :
     archived?.regulationMark && !['H','I','J'].includes(archived.regulationMark) ?
      'OUT_OF_REGULATION' : archived ? 'OFFICIAL_PRINT_UNVERIFIED' : 'OFFICIAL_PRINT_NOT_FOUND'};
  }
  const card = matches[0];
  return {...row, name:card.name, officialCardId:card.id, imageUrl:card.url, identityStatus:'CONFIRMED'};
 });
 const blockedCount = output.filter(row=>row.identityStatus==='BLOCKED').length;
 return {...deck,cards:output,blockedCount,identityStatus:blockedCount?'BLOCKED':'CONFIRMED',playable:false};
}
function readImports(storage) {
 let saved;
 try {
  const value = storage.getItem(IMPORT_KEY);
  saved = value === null ? [] : JSON.parse(value);
 } catch (error) {
  if (error?.name === 'SecurityError') throw error;
  const problem = Error('以前の公式デッキ取り込み履歴を読み込めません。元データは変更していません。');
  problem.code = 'IMPORT_HISTORY_INVALID';
  throw problem;
 }
 if (!Array.isArray(saved)) {
  const problem = Error('公式デッキ取り込み履歴の形式が不正です。元データは変更していません。');
  problem.code = 'IMPORT_HISTORY_INVALID';
  throw problem;
 }
 return saved.filter(deck => validCode(deck?.deckCode) &&
  deck.total === 60 && Array.isArray(deck.cards) && deck.cards.every(row => row &&
  Number.isInteger(row.count) && row.count > 0) && deck.cards.reduce((n,row)=>n+row.count,0)===60);
}
// A full-size official JPEG is not stored in this history, but repeated derived
// names/URLs/validation flags from prior versions still consume device quota.
// Retain exact official print IDs and every source field needed by matchCatalog.
function compactImport(deck) {
 return {...deck,
  cards:deck.cards.map(row=>{
   const copy={...row};
   delete copy.imageUrl;
   delete copy.identityStatus;
   delete copy.reason;
   delete copy.regulationMark;
   return copy;
  }),
  blockedCount:undefined,
  identityStatus:undefined,
  playable:false
 };
}
function saveImport(storage, deck) {
 if (!validCode(deck?.deckCode) || deck.total !== 60 || !Array.isArray(deck.cards) ||
     deck.cards.reduce((n,row)=>n+row.count,0)!==60)
  throw Error('60枚の公式デッキのみ保存できます。');
 const saved = readImports(storage).filter(entry => entry.deckCode !== deck.deckCode);
 const value = JSON.stringify([...saved,deck].map(compactImport));
 storage.setItem(IMPORT_KEY,value);
 // setItem normally throws on failure, but still verify actual write-back.
 if (storage.getItem(IMPORT_KEY) !== value) throw Error('保存したデータを読み戻せませんでした。');
}
function reconcile(deck,officialRecords,imageRegistry){
 if(!deck||deck.total!==60||!Array.isArray(deck.cards))throw Error('60枚レシピが必要です');
 const records=Array.isArray(officialRecords)?officialRecords:Object.values(officialRecords||{});
 const images=imageRegistry?.imageByOfficialCardId||imageRegistry||{};
 const output=deck.cards.map(row=>{
  const candidates=records.filter(r=>r&&r.name===row.name&&(!row.pack||r.pack===row.pack||r.expansion===row.pack)&&(!row.number||r.number===row.number||r.cardNumber===row.number));
  if(candidates.length!==1)return {...row,identityStatus:'BLOCKED',reason:candidates.length?'AMBIGUOUS_PRINT':'OFFICIAL_PRINT_NOT_FOUND'};
  const record=candidates[0],id=String(record.officialCardId||'');
  if(!/^\d+$/.test(id))return {...row,identityStatus:'BLOCKED',reason:'OFFICIAL_ID_MISSING'};
  const image=images[id];
  if(!image||image.officialCardId!=null&&String(image.officialCardId)!==id||image.name&&image.name!==row.name||!(image.imageSourceUrl||image.sourceUrl))
   return {...row,officialCardId:id,identityStatus:'BLOCKED',reason:'IMAGE_MISSING_OR_CONFLICT'};
  if(record.effectStatus!=='verified'||record.engineReadable!==true)
   return {...row,officialCardId:id,imageUrl:image.imageSourceUrl||image.sourceUrl,identityStatus:'BLOCKED',reason:'ENGINE_EFFECT_UNVERIFIED'};
  return {...row,officialCardId:id,imageUrl:image.imageSourceUrl||image.sourceUrl,identityStatus:'CONFIRMED'};
 });
 const blocked=output.filter(r=>r.identityStatus!=='CONFIRMED');
 return {...deck,cards:output,identityStatus:blocked.length?'BLOCKED':'CONFIRMED',playable:blocked.length===0,blockedCount:blocked.length};
}
root.PokecaDeckCodeImport=Object.freeze({validCode,parse,parseFields,parseHtml,reconcile,catalogFrom,loadCatalog,matchCatalog,readImports,saveImport});
})(typeof window!=='undefined'?window:globalThis);
