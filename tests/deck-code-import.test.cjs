const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const code=fs.readFileSync('ui/deck-code-import.js','utf8');const ctx={};vm.runInNewContext(code,ctx);const api=ctx.PokecaDeckCodeImport;const deckCode='ABC123-DEF456-GHI789';assert.equal(api.validCode(deckCode),true);assert.equal(api.validCode('bad'),false);const sample='ポケモン (4)\nピカチュウ | 4枚\nエネルギー (56)\n基本雷エネルギー | 56枚';const result=api.parse(sample,deckCode);assert.equal(result.total,60);assert.equal(result.playable,false);assert.equal(result.identityStatus,'UNVERIFIED');assert.equal(result.cards.length,2);assert.throws(()=>api.parse('ポケモン (4)\nピカチュウ | 4枚',deckCode),/60枚/);assert.throws(()=>api.parse(sample,'invalid'),/形式/);assert.throws(()=>api.parse(sample+'x'.repeat(1000001),deckCode),/不正/);console.log('deck-code-import basic checks PASS (synthetic fixture, not official page verification)');
const blocked=api.reconcile(result,[],{});assert.equal(blocked.playable,false);assert.equal(blocked.blockedCount,2);assert.equal(blocked.cards[0].reason,'OFFICIAL_PRINT_NOT_FOUND');const print={name:'ピカチュウ',officialCardId:'123',effectStatus:'verified',engineReadable:true};const ambiguous=api.reconcile(result,[print,print],{});assert.equal(ambiguous.cards[0].reason,'AMBIGUOUS_PRINT');const noImage=api.reconcile(result,[print],{});assert.equal(noImage.cards[0].reason,'IMAGE_MISSING_OR_CONFLICT');const noEffect=api.reconcile(result,[{...print,effectStatus:'unverified'}],{'123':{name:'ピカチュウ',imageSourceUrl:'https://example.test/card.jpg'}});assert.equal(noEffect.cards[0].reason,'ENGINE_EFFECT_UNVERIFIED');console.log('deck-code strict reconciliation checks PASS');

const officialLayout='デッキコード[kbvV5V-TEZjLI-dVfVVk]のデッキレシピから構築\nポケモン (4)\n---\n[Input]  | ケーシィ\nM1S\n036/063\n | 4\n | 削除\nグッズ (4)\n---\n[Input]  | なかよしポフィン  | 4\n | 削除\nエネルギー (52)\n---\n[Input]  | 基本超エネルギー  | 52\n | 削除';const officialParsed=api.parse(officialLayout,'kbvV5V-TEZjLI-dVfVVk');assert.equal(officialParsed.total,60);assert.equal(officialParsed.cards[0].pack,'M1S');assert.equal(officialParsed.cards[0].number,'036/063');assert.equal(officialParsed.cards[0].count,4);assert.throws(()=>api.parse(officialLayout.replace('エネルギー (52)','エネルギー (51)'),'kbvV5V-TEZjLI-dVfVVk'),/分類別枚数/);console.log('official page-layout excerpt parser PASS');


const registry = JSON.parse(fs.readFileSync('data/official-image-registry.json','utf8'));
const formal = JSON.parse(fs.readFileSync('data/reference-effects/catalog.json','utf8'));
const catalog = api.catalogFrom(registry, formal, JSON.parse(fs.readFileSync('data/deck-building/catalog.json','utf8')));
assert.ok(catalog.size > 1000);
assert.equal(catalog.get('47832').name,'ケーシィ');
// Captured hidden fields from the official construction page for this code.
const officialFields = {
  "saveDeckID": "kbvV5V-TEZjLI-dVfVVk",
  "deck_pke": "47832_4_1-47833_4_1-48457_3_1-47086_3_1-46791_2_1-48582_2_1-47301_1_1-47177_1_1-45915_1_1",
  "deck_gds": "47877_3_1-48273_2_1-48299_3_1-49703_4_1-50069_1_1-48670_1_1-50156_1_1",
  "deck_tool": "47101_3_1",
  "deck_tech": "",
  "deck_sup": "48694_4_1-50428_4_1-50449_2_1",
  "deck_sta": "48514_3_1",
  "deck_ene": "49712_4_1-46293_1_1-50749_2_1-47218_1_1"
};
const exact = api.parseFields(officialFields,officialFields.saveDeckID);
const verified = api.matchCatalog(exact,catalog);
assert.equal(verified.cards[0].officialCardId,'47832');
assert.equal(verified.cards[0].identityStatus,'CONFIRMED');
assert.ok(verified.cards[0].imageUrl.startsWith('https://www.pokemon-card.com/'));
assert.equal(verified.playable,false);
const unknown = {...officialFields,deck_pke:officialFields.deck_pke.replace('47832','999999999')};
const unresolved = api.matchCatalog(api.parseFields(unknown,unknown.saveDeckID),catalog);
assert.equal(unresolved.cards[0].identityStatus,'BLOCKED');
assert.throws(() => api.parseFields(officialFields,deckCode),/一致/);
assert.throws(() => api.parseFields({...officialFields,deck_tool:''},officialFields.saveDeckID),/60枚/);
assert.throws(() => api.parseFields({...officialFields,deck_tool:'47101_0_1'},officialFields.saveDeckID),/不正/);
assert.equal(api.matchCatalog(officialParsed,catalog).cards[0].officialCardId,'47832');
assert.equal(api.matchCatalog(result,catalog).cards[0].identityStatus,'BLOCKED');
const storage = new Map();
const browserStorage = {getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
api.saveImport(browserStorage,verified);
api.saveImport(browserStorage,unresolved);
assert.equal(api.readImports(browserStorage).length,1);
assert.equal(api.readImports(browserStorage)[0].cards[0].identityStatus,'BLOCKED');
console.log('Official print, registry and saved imports PASS');
