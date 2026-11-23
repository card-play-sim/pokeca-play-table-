'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const id='42945';
const classification=read('data/deck-building/catalog.json').records.find(r=>String(r.officialCardId)===id);
const base=read('data/reference-effects/plans.json').records;
const compiled=read('data/effect-extensions/compiled.json').records;
const intake=read('data/effect-extensions/intake.json').records;
const checkpoint=read('data/official-effect-intake/checkpoint.json').records;
const {verifiedBasicException}=require('../scripts/list-card-auto-connect-ids.cjs');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('ui/deck-code-import.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),context);
const importer=context.window.PokecaDeckCodeImport;
const deckApi=context.window.PokecaSavedDecks;
const cards=importer.catalogFrom(read('data/official-image-registry.json'),
 read('data/reference-effects/catalog.json'),read('data/deck-building/catalog.json'),
 read('data/deck-building/m7-official-image-extension.json'),
 read('data/deck-building/official-import-verified-extension.json'));
const card=cards.get(id),archive=cards.archive.get(id);
const record=[...base,...compiled].find(r=>String(r.officialCardId)===id);
const allIntake=[...intake,...checkpoint].find(r=>String(r.officialCardId)===id);
const plans=deckApi.plansFrom({records:base},{records:compiled});
console.log('USER_BASIC_ENERGY_42945_DIAGNOSTIC '+JSON.stringify({
 catalog:classification&&{name:classification.name,category:classification.category,basicEnergy:classification.basicEnergy,
 legality:classification.legality,regulationMark:classification.regulationMark,source:classification.source,
 verifiedException:verifiedBasicException(classification)},
 importedCard:card,archiveCard:archive,
 compiled:record&&{officialCardId:record.officialCardId,category:record.category,
 mechanic:record.mainPlan?.mechanic,source:record.source},
 inIntake:allIntake&&{officialCardId:allIntake.officialCardId,source:allIntake.source,category:allIntake.category,mainPlan:allIntake.mainPlan},
 connection:deckApi.connectionError(id,card,plans.get(id)),
 canonicalFire:base.find(r=>r.officialCardId==='49460')?.mainPlan?.mechanic,
 counts:{base:base.length,compiled:compiled.length,intake:intake.length,checkpoint:checkpoint.length},
}));
assert(card&&card.name==='基本炎エネルギー','official 42945 not in deck builder');
assert(classification&&classification.basicEnergy===true,'basic-energy classification missing');
assert(verifiedBasicException(classification),'official basic-energy exception is not verified');
assert(record&&record.officialCardId===id&&record.mainPlan?.mechanic==='BASIC_ENERGY',
 'real physical print 42945 must have the common official BASIC_ENERGY engine plan');
assert.equal(deckApi.connectionError(id,card,plans.get(id)),'',
 'a valid basic-energy print may not be blocked in a saved 60-card deck');
const sw=fs.readFileSync('sw.js','utf8');
const releaseMatch=sw.match(/const FILES=(\{[\s\S]*?\});\nconst absolute/);
assert(releaseMatch,'PWA complete release manifest must exist');
const hashes=JSON.parse(releaseMatch[1]);
const crypto=require('node:crypto');
const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
assert.equal(hashes['./data/effect-extensions/compiled.json'],hash('data/effect-extensions/compiled.json'),
 'offline PWA must cache the official 42945 BASIC_ENERGY plan');
assert.equal(hashes['./ui/saved-decks.js?build=258'],hash('ui/saved-decks.js'),
 'offline PWA must cache the corresponding saved-deck readiness logic');
