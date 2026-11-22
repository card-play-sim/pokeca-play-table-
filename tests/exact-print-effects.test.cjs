'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {norm,mainText}=require('../engine/reference-effect-plans.cjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const base=read('data/reference-effects/plans.json');
const intake=read('data/effect-extensions/intake.json');
const compiled=read('data/effect-extensions/compiled.json');
const expected=[
 {id:'49573',reference:'50846',name:'ポケパッド',mechanic:'POKEPAD',category:'item',uiCategory:'goods',pack:'MC',number:'662/742',mark:'J',image:'https://www.pokemon-card.com/assets/images/card_images/large/MC/049573_T_POKEPADDO.jpg'},
 {id:'47288',reference:'50853',name:'ボスの指令',mechanic:'BOSS',category:'supporter',uiCategory:'support',pack:'SVOD',number:'017/018',mark:'G',image:'https://www.pokemon-card.com/assets/images/card_images/large/SVOD/047288_T_BOSUNOSHIREI.jpg'}
];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sandbox={window:{},localStorage:{getItem:()=>null}};
vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),sandbox,{filename:'saved-decks.js'});
const {plansFrom,connectionError}=sandbox.window.PokecaSavedDecks;
const plans=plansFrom(base,compiled);
for(const e of expected){
 const row=intake.records.find(r=>String(r.officialCardId)===e.id);
 const rec=compiled.records.find(r=>String(r.officialCardId)===e.id);
 const reference=base.records.find(r=>String(r.officialCardId)===e.reference);
 assert(row&&rec&&reference,'missing exact official print/effect: '+e.id);
 assert(!base.records.some(r=>String(r.officialCardId)===e.id),'do not replace protected base print');
 assert.equal(row.officialPageUrl,'https://www.pokemon-card.com/card-search/details.php/card/'+e.id);
 assert.equal(row.name,e.name);
 assert.equal(row.deckName,e.name);
 assert.equal(row.category,e.category);
 assert.equal(row.imageSourceUrl,e.image);
 assert.equal(row.deckPrintAdopted,false);
 assert.equal(row.source.path,'data/effect-extensions/evidence/'+e.id+'.json');
 assert.equal(row.source.kind,'saved-official-extension');
 const proof=read(row.source.path);
 assert.equal(proof.url,row.officialPageUrl);
 assert.equal(hash(proof.html),proof.htmlSha256);
 assert.equal(row.source.sha256,proof.htmlSha256);
 assert.equal(row.source.htmlSha256,proof.htmlSha256);
 assert.equal(hash(row.text),row.source.textSha256);
 assert(proof.html.includes('<meta property="og:url" content="'+row.officialPageUrl+'"'));
 // Semantics must be text-identical to the already-tested shared mechanic;
 // similar name or art alone must never connect a print.
 assert.equal(norm(mainText(row.text)),norm(mainText(reference.text)),'printed effect differs from shared reference '+e.id);
 assert.equal(rec.mainPlan.mechanic,e.mechanic);
 assert.deepEqual(rec.mainPlan,reference.mainPlan);
 assert.equal(String(rec.officialCardId),e.id);
 assert.equal(plans.get(e.id),rec);
 const card={name:e.name,url:e.image,category:e.uiCategory,pack:e.pack,number:e.number,regulationMark:e.mark};
 assert.equal(connectionError(e.id,card,rec),'','exact verified print rejected by deck gate '+e.id);
 assert.equal(connectionError(e.id,{...card,url:'https://example.invalid/other.jpg'},rec),'PRINT_IDENTITY_CONFLICT');
 assert.equal(connectionError('999999',card,undefined),'NO_EFFECT_PLAN');
}
console.log('PASS two exact official import printings, immutable SHA evidence, shared gameplay plans and strict deck gate');
