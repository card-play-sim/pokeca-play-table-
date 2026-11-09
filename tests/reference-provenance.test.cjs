'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const catalog=JSON.parse(fs.readFileSync('data/reference-effects/plans.json'));
for(const r of catalog.records){
 if(r.source.kind==='saved-official-html'){
  const raw=fs.readFileSync(r.source.path),saved=JSON.parse(raw);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),r.source.sha256);
  assert.equal(crypto.createHash('sha256').update(saved.html).digest('hex'),r.source.htmlSha256);
  assert.equal(saved.candidate.officialCardId,r.officialCardId);
 }
}
const ctx={window:{}};for(const file of ['official-image-validation','card-image-resolver'])vm.runInNewContext(fs.readFileSync('ui/'+file+'.js','utf8'),ctx);
const resolver=ctx.window.PokecaImageResolver;
resolver.register(Object.fromEntries(JSON.parse(fs.readFileSync('data/official-image-registry.json')).cards.map(r=>[r.officialCardId,r])));
resolver.registerPreviews(JSON.parse(fs.readFileSync('data/fixed-deck-preview-bindings.json')));
for(const r of catalog.records){
 const card={name:r.deckName,validationReference:{officialCardId:r.officialCardId,officialName:r.name,set:r.set,cardNumber:r.cardNumber,imageSourceUrl:r.imageSourceUrl,adopted:false}};
 const found=resolver.resolveDisplay(card);assert.equal(found.url,r.imageSourceUrl,r.officialCardId);assert.equal(found.adopted,false);
 for(const field of ['officialCardId','officialName','set','cardNumber','imageSourceUrl']){const bad=JSON.parse(JSON.stringify(card));bad.validationReference[field]='WRONG';assert.equal(resolver.resolveDisplay(bad).url,'',field);}
 assert.equal(resolver.resolveDisplay({...card,officialCardId:r.officialCardId}).url,'');
}
for(const script of ['scripts/sync-reference-effects.cjs','scripts/sync-ai-policy.cjs'])assert.equal(spawnSync(process.execPath,[script,'--check'],{encoding:'utf8'}).status,0,script);
console.log('PASS 89 source fingerprints, exact reference image tuples, contradictory print rejection and generated bundle checks');
