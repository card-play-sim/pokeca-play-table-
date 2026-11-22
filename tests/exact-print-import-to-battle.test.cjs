'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const context={window:{},localStorage:{getItem:()=>null}};
vm.runInNewContext(fs.readFileSync('ui/deck-code-import.js','utf8'),context,{filename:'deck-code-import.js'});
vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),context,{filename:'saved-decks.js'});
const api=context.window.PokecaDeckCodeImport,gate=context.window.PokecaSavedDecks;
const catalog=api.catalogFrom(read('data/official-image-registry.json'),read('data/reference-effects/catalog.json'),
 read('data/deck-building/catalog.json'),read('data/deck-building/m7-official-image-extension.json'),
 read('data/deck-building/official-import-verified-extension.json'));
const plans=gate.plansFrom(read('data/reference-effects/plans.json'),read('data/effect-extensions/compiled.json'));
// This is a synthetic but legal 60-card official-format recipe. No card substitutions
// are allowed: the exact print IDs must survive parsing, catalog lookup and match entry creation.
const deckCode='ABC123-DEF456-GHI789';
const fields={saveDeckID:deckCode,deck_pke:'47847_4_1',deck_gds:'49573_4_1',
 deck_tool:'',deck_tech:'',deck_sup:'47288_3_1',deck_sta:'',deck_ene:'49460_49_1'};
const parsed=api.parseFields(fields,deckCode);
assert.equal(parsed.total,60);
const reconciled=api.matchCatalog(parsed,catalog);
assert.equal(reconciled.identityStatus,'CONFIRMED',JSON.stringify(reconciled.cards.filter(x=>x.identityStatus!=='CONFIRMED')));
const byId=new Map(reconciled.cards.map(r=>[String(r.officialCardId),r]));
for(const [id,count] of [['47847',4],['49573',4],['47288',3],['49460',49]]){
 assert.equal(byId.get(id)?.count,count,'exact official recipe ID and count '+id);
 const meta=catalog.get(id),record=plans.get(id);
 assert(meta&&record,'catalog and effect plan required '+id);
 assert.equal(meta.name,record.name,'no same-name-only lookup '+id);
 assert.equal(meta.url,record.imageSourceUrl,'official print image must match verified effect '+id);
 assert.equal(gate.connectionError(id,meta,record),'','effect plan must match imported image '+id);
}
assert.equal(plans.get('49573').mainPlan.mechanic,'POKEPAD');
assert.equal(plans.get('47288').mainPlan.mechanic,'BOSS');
const deck={name:'official-import-exact-prints',cards:Object.fromEntries(byId.entries().map(([id,row])=>[id,row.count])),blocked:[]};
assert.equal(gate.total(deck),60);
const entries=gate.matchEntries(deck,catalog,plans);
assert.equal(entries.reduce((n,e)=>n+e.count,0),60);
assert.equal(entries.find(e=>e.referenceOfficialCardId==='49573').count,4);
assert.equal(entries.find(e=>e.referenceOfficialCardId==='47288').count,3);
assert(entries.some(e=>e.category==='pokemon'),'valid Basic Pokémon is required');
const fake={...catalog.get('47288'),url:'https://example.invalid/fake.jpg'};
assert.equal(gate.connectionError('47288',fake,plans.get('47288')),'PRINT_IDENTITY_CONFLICT');
console.log('PASS official-form recipe -> 60-card catalog -> two exact print effects -> match entries (plus image-conflict rejection)');
