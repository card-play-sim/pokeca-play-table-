'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const html=fs.readFileSync('deck-code-import.html','utf8');
const assets=['ui/deck-editor.css','ui/deck-code-import.js','ui/deck-import-page.js'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sw=fs.readFileSync('sw.js','utf8');
const match=sw.match(/const FILES=(\{[\s\S]*?\});\nconst absolute/);
assert(match,'generated PWA asset map is required');
const files=JSON.parse(match[1]);
for(const asset of assets){
 const url='./'+asset+'?savefix=20261122a';
 assert(html.includes(asset+'?savefix=20261122a'),'subpage must bypass old cached asset: '+asset);
 assert.equal(files[url],hash(fs.readFileSync(asset)),'offline release must preload exact revised asset: '+url);
}
assert(fs.readFileSync('index.html','utf8').includes('deck-code-import.html?savefix=20261122a'));
assert(fs.readFileSync('deck-builder.html','utf8').includes('deck-code-import.html?savefix=20261122a'));
const worker=fs.readFileSync('scripts/pwa-worker-template.js','utf8');
assert(worker.includes("const importPage=absolute('./deck-code-import.html')"),'offline import navigation required');
assert(worker.includes("path===editor||path===importPage"),'navigate import must use verified latest shell');
const page=fs.readFileSync('ui/deck-import-page.js','utf8');
assert(page.includes("navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'})"));
assert(page.includes('api.saveBuilderDeck(localStorage,snapshot,exactCatalog)'),'Save must create visible deck-home entry');
const home=fs.readFileSync('ui/deck-home.js','utf8');
assert(home.includes('PokecaDeckCodeImport.migrateImports(localStorage,cards)'),'old history-only 60-card imports must migrate');
assert(!page.includes('location.reload()')&&!page.includes('localStorage.clear()'),'must retain unsaved recipe and existing decks');
assert(!page.includes("端末に保存できませんでした。"),'old hidden-error phrase is forbidden');
assert(page.includes('JSON出力')&&page.includes('QuotaExceededError'),'existing backup and error diagnostics must survive');
console.log('PASS: old worker bypass, exact offline cached import assets, safe update and preserved backup');
