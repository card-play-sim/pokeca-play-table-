const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const code=fs.readFileSync('ui/deck-code-import.js','utf8');const ctx={};vm.runInNewContext(code,ctx);const api=ctx.PokecaDeckCodeImport;const deckCode='ABC123-DEF456-GHI789';assert.equal(api.validCode(deckCode),true);assert.equal(api.validCode('bad'),false);const sample='ポケモン (4)\nピカチュウ | 4枚\nエネルギー (56)\n基本雷エネルギー | 56枚';const result=api.parse(sample,deckCode);assert.equal(result.total,60);assert.equal(result.playable,false);assert.equal(result.identityStatus,'UNVERIFIED');assert.equal(result.cards.length,2);assert.throws(()=>api.parse('ポケモン (4)\nピカチュウ | 4枚',deckCode),/60枚/);assert.throws(()=>api.parse(sample,'invalid'),/形式/);assert.throws(()=>api.parse(sample+'x'.repeat(1000001),deckCode),/不正/);console.log('deck-code-import basic checks PASS (synthetic fixture, not official page verification)');
const blocked=api.reconcile(result,[],{});assert.equal(blocked.playable,false);assert.equal(blocked.blockedCount,2);assert.equal(blocked.cards[0].reason,'OFFICIAL_PRINT_NOT_FOUND');const print={name:'ピカチュウ',officialCardId:'123',effectStatus:'verified',engineReadable:true};const ambiguous=api.reconcile(result,[print,print],{});assert.equal(ambiguous.cards[0].reason,'AMBIGUOUS_PRINT');const noImage=api.reconcile(result,[print],{});assert.equal(noImage.cards[0].reason,'IMAGE_MISSING_OR_CONFLICT');const noEffect=api.reconcile(result,[{...print,effectStatus:'unverified'}],{'123':{name:'ピカチュウ',imageSourceUrl:'https://example.test/card.jpg'}});assert.equal(noEffect.cards[0].reason,'ENGINE_EFFECT_UNVERIFIED');console.log('deck-code strict reconciliation checks PASS');

const officialLayout='デッキコード[kbvV5V-TEZjLI-dVfVVk]のデッキレシピから構築\nポケモン (4)\n---\n[Input]  | ケーシィ\nM1S\n036/063\n | 4\n | 削除\nグッズ (4)\n---\n[Input]  | なかよしポフィン  | 4\n | 削除\nエネルギー (52)\n---\n[Input]  | 基本超エネルギー  | 52\n | 削除';const officialParsed=api.parse(officialLayout,'kbvV5V-TEZjLI-dVfVVk');assert.equal(officialParsed.total,60);assert.equal(officialParsed.cards[0].pack,'M1S');assert.equal(officialParsed.cards[0].number,'036/063');assert.equal(officialParsed.cards[0].count,4);assert.throws(()=>api.parse(officialLayout.replace('エネルギー (52)','エネルギー (51)'),'kbvV5V-TEZjLI-dVfVVk'),/分類別枚数/);console.log('official page-layout excerpt parser PASS');


const registry = JSON.parse(fs.readFileSync('data/official-image-registry.json','utf8'));
const formal = JSON.parse(fs.readFileSync('data/reference-effects/catalog.json','utf8'));
const printExtension = JSON.parse(fs.readFileSync('data/deck-building/official-import-verified-extension.json','utf8'));
assert.match(fs.readFileSync('sw.js','utf8'), /\.\/data\/deck-building\/official-import-verified-extension\.json/,'Offline PWA must cache the official-import image evidence');
const catalog = api.catalogFrom(registry, formal, JSON.parse(fs.readFileSync('data/deck-building/catalog.json','utf8')), JSON.parse(fs.readFileSync('data/deck-building/m7-official-image-extension.json','utf8')), printExtension);
if (printExtension.status === 'VERIFIED_OFFICIAL_PRINT_AND_IMAGE_HASH') {
 assert.equal(printExtension.records.length,2,'Both exact official print images must have audited JPEG hashes');
 const legacyBoss=printExtension.records.find(r=>r.officialCardId==='47288');
 assert.equal(legacyBoss?.exceptionEvidence?.rulePageUrl,'https://www.pokemon-card.com/rules/regulation/');
 assert.match(legacyBoss.exceptionEvidence.rulePageSha256,/^[a-f0-9]{64}$/,'Legacy exception must cite the actual official regulation HTML digest');
 assert.equal(catalog.get('49573')?.name,'ポケパッド','Official J Pokepad print must resolve');
 assert.equal(catalog.get('49573')?.url,'https://www.pokemon-card.com/assets/images/card_images/large/MC/049573_T_POKEPADDO.jpg');
 console.log('LEGACY_BOSS_DIAGNOSTIC',JSON.stringify({
  fromRegistry: (Array.isArray(registry.cards)?registry.cards:Object.values(registry.imageByOfficialCardId||{})).filter(x=>String(x.officialCardId)==='47288').slice(0,2),
  classified: JSON.parse(fs.readFileSync('data/deck-building/catalog.json','utf8')).records.filter(x=>String(x.officialCardId)==='47288').slice(0,2),
  fromArchive: catalog.archive.get('47288'),
  found: catalog.get('47288'),
  verifiedEvidence: printExtension.records.find(x=>x.officialCardId==='47288')
 }));
 assert.equal(catalog.get('47288')?.name,'ボスの指令','Official standard rule permits the legacy Boss print');
 assert.equal(catalog.archive.get('47288')?.name,'ボスの指令');
 assert.equal(api.matchCatalog({source:'official-recipe-html',cards:[{officialCardId:'47288',category:'support',count:3}]},catalog).cards[0].identityStatus,'CONFIRMED');
}

assert.equal([...catalog.values()].filter(card=>card.pack==='M7'&&card.regulationMark==='J').length,78,'All 78 verified official M7 J cards must be searchable');
assert.equal(catalog.get('50856').name,'マダツボミ');
assert.equal(catalog.get('50856').pokemonStage,0);
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


const evidenceHash='a'.repeat(64);
const mockPrint=id=>({officialCardId:id,name:id==='49573'?'ポケパッド':'ボスの指令',
 category:id==='49573'?'goods':'support',set:id==='49573'?'MC':'SVOD',
 cardNumber:id==='49573'?'662/742':'017/018',
 verified:true,regulationMark:id==='49573'?'J':'G',
 legality:id==='49573'?'printed-hij':'official-legacy-reprint-exception',
 exceptionEvidence:id==='47288'?{rulePageUrl:'https://www.pokemon-card.com/rules/regulation/',rulePageSha256:evidenceHash,ruleName:'ボスの指令'}:undefined,
 officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/'+id,
 imageSourceUrl:id==='49573'?
 'https://www.pokemon-card.com/assets/images/card_images/large/MC/049573_T_POKEPADDO.jpg':
 'https://www.pokemon-card.com/assets/images/card_images/large/SVOD/047288_T_BOSUNOSHIREI.jpg',
 markEvidence:{imageSha256:evidenceHash},source:{sha256:evidenceHash,
  url:'https://www.pokemon-card.com/card-search/details.php/card/'+id,
  identityName:id==='49573'?'ポケパッド':'ボスの指令',
  identityImageUrl:id==='49573'?
   'https://www.pokemon-card.com/assets/images/card_images/large/MC/049573_T_POKEPADDO.jpg':
   'https://www.pokemon-card.com/assets/images/card_images/large/SVOD/047288_T_BOSUNOSHIREI.jpg'}});
const verifiedReprints = api.catalogFrom({cards:[]},{records:[]},{records:[]},{cards:[]},
 {records:[mockPrint('49573'),mockPrint('47288')]});
assert.equal(verifiedReprints.get('49573')?.regulationMark,'J');
assert.equal(verifiedReprints.get('47288')?.name,'ボスの指令');
assert.equal(verifiedReprints.archive.get('47288')?.regulationMark,'G');
const gImported = api.matchCatalog({source:'official-recipe-html',cards:[{officialCardId:'47288',count:3,category:'support'}]},verifiedReprints);
assert.equal(gImported.cards[0].name,'ボスの指令');
assert.equal(gImported.cards[0].identityStatus,'CONFIRMED');
assert.ok(gImported.cards[0].imageUrl.endsWith('047288_T_BOSUNOSHIREI.jpg'));
const badPrint = mockPrint('49573');
badPrint.source.identityName='another card';
const rejected = api.catalogFrom({cards:[]},{records:[]},{records:[]},{cards:[]},{records:[badPrint]});
assert.equal(rejected.get('49573'),undefined,'Mismatched official proof cannot silently unlock a print');
console.log('Exact official import reprint images and G scope separation PASS');

const unapprovedG=mockPrint('47288');
unapprovedG.legality='archival-out-of-scope';
delete unapprovedG.exceptionEvidence;
const illegal=api.catalogFrom({cards:[]},{records:[]},{records:[]},{cards:[]},{records:[unapprovedG]});
assert.equal(illegal.get('47288'),undefined,'G is never permitted without named official reprint exception evidence');
console.log('Official legacy Boss exception requires named official regulation rule proof');

/* Android import save failure recovery: persisted exact-print records must
 * not be silently lost or blocked by oversized redundant artwork URLs. */
const compactStore=new Map();
const constrained={
 getItem:key=>compactStore.get(key)??null,
 setItem:(key,value)=>{
  if(value.length>50000){const err=Error('quota');err.name='QuotaExceededError';throw err;}
  compactStore.set(key,value);
 }
};
const oversized={...verified,cards:verified.cards.map(row=>({
 ...row,imageUrl:'https://www.pokemon-card.com/assets/images/card_images/large/'+('X'.repeat(10000))
}))};
api.saveImport(constrained,oversized);
const stored=api.readImports(constrained)[0];
assert.equal(stored.total,60);
assert.equal(stored.deckCode,officialFields.saveDeckID);
assert.equal(stored.cards.map(row=>row.count).reduce((a,b)=>a+b,0),60);
assert.equal(stored.cards.some(row=>Object.hasOwn(row,'imageUrl')),false,'redundant image URLs must not consume quota');
assert.equal(stored.cards[0].officialCardId,verified.cards[0].officialCardId);
assert.equal(stored.cards[0].identityStatus,verified.cards[0].identityStatus);
const brokenValue='{corrupted';
const brokenStore={
 getItem:()=>brokenValue,
 setItem:()=>assert.fail('Must not overwrite corrupt imports without user consent')
};
assert.throws(()=>api.saveImport(brokenStore,verified),err=>err.code==='IMPORT_HISTORY_INVALID');
const blockedStore={getItem:()=>{const e=Error('denied');e.name='SecurityError';throw e;},setItem:()=>{}};
assert.throws(()=>api.saveImport(blockedStore,verified),err=>err.name==='SecurityError');
const deniedWrite={getItem:()=>null,setItem:()=>{const e=Error('full');e.name='QuotaExceededError';throw e;}};
assert.throws(()=>api.saveImport(deniedWrite,verified),err=>err.name==='QuotaExceededError');
const lyingStore={getItem:()=>null,setItem:()=>{}};
assert.throws(()=>api.saveImport(lyingStore,verified),/読み戻せません/);
console.log('PASS Android import save: compact history, exact print preservation, corrupt history and quota/security diagnostics');


// Official recipe Save must be visible in deck-home, not just in the separate
// official import history. It must not replace unrelated existing decks.
const deckHomeMap=new Map([['pokeca.deck-builder.v1',JSON.stringify({
 decks:[{id:'personal-1',name:'保持するデッキ',cards:{'49011':4}}],
 userSetting:'keep'
})]]);
const homeStorage={getItem:key=>deckHomeMap.get(key)??null,
 setItem:(key,value)=>deckHomeMap.set(key,value)};
const importedSave=api.saveBuilderDeck(homeStorage,verified,catalog);
assert.equal(importedSave.id,'official-'+verified.deckCode);
const homeJSON=()=>JSON.parse(homeStorage.getItem('pokeca.deck-builder.v1'));
assert.equal(homeJSON().userSetting,'keep');
assert.equal(homeJSON().decks.length,2);
assert.equal(homeJSON().decks[0].name,'保持するデッキ');
assert.equal(homeJSON().decks[1].sourceDeckCode,verified.deckCode);
assert.equal(Object.values(homeJSON().decks[1].cards).reduce((n,k)=>n+k,0)+
 homeJSON().decks[1].blocked.reduce((n,row)=>n+row.count,0),60);
assert.equal(homeJSON().decks[1].cards['47832']>0,true,'exact official print preserved');
const modifiedHome=homeJSON();
const preview=modifiedHome.decks[1];
preview.name='自分で付けた名前';
preview.coverCardId='47832';
modifiedHome.decks[1]=preview;
homeStorage.setItem('pokeca.deck-builder.v1',JSON.stringify(modifiedHome));
api.saveBuilderDeck(homeStorage,verified,catalog);
assert.equal(homeJSON().decks.length,2,'reimport must not duplicate the same deck');
assert.equal(homeJSON().decks[1].name,'自分で付けた名前');
assert.equal(homeJSON().decks[1].coverCardId,'47832');
api.saveBuilderDeck(homeStorage,unresolved,catalog);
assert.equal(homeJSON().decks[1].blocked.length>0,true,'unverified print remains BLOCKED, not silently removed');
const malformed='{bad previous deck data';
const corruptDeckStorage={getItem:()=>malformed,setItem:()=>assert.fail('Do not overwrite a corrupt deck list')};
assert.throws(()=>api.saveBuilderDeck(corruptDeckStorage,verified,catalog),e=>e.code==='DECK_LIST_INVALID');
const quotaDeckStorage={getItem:()=>null,setItem:()=>{const e=Error('quota');e.name='QuotaExceededError';throw e;}};
assert.throws(()=>api.saveBuilderDeck(quotaDeckStorage,verified,catalog),e=>e.name==='QuotaExceededError');
const lyingHome={getItem:()=>null,setItem:()=>{}};
assert.throws(()=>api.saveBuilderDeck(lyingHome,verified,catalog),/読み戻せません/);
console.log('PASS Save propagates 60-card import to deck-home, preserves other decks and denies unsafe mutations');
