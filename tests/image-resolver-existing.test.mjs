import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const registry=JSON.parse(fs.readFileSync('data/official-image-registry.json','utf8'));
const context={window:{},fetch:async url=>{
 assert.equal(url,'./data/official-image-registry.json');
 return {ok:true,json:async()=>registry};
}};
vm.runInNewContext(fs.readFileSync('ui/official-image-validation.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('ui/card-image-resolver.js','utf8'),context);
const resolver=context.window.PokecaImageResolver;
const result=await resolver.loadRegistry('./data/official-image-registry.json');
assert.equal(result.received,registry.cards.length);
assert.equal(result.registered,registry.cards.length);
for(const c of registry.cards){
 const exact=resolver.resolve({officialCardId:c.officialCardId,name:c.name});
 assert.equal(exact,c.imageSourceUrl,'exact print should resolve: '+c.officialCardId);
 assert.equal(resolver.resolve({officialCardId:c.officialCardId,name:c.name+'別'}),'');
}
const repeated=await resolver.loadRegistry('./data/official-image-registry.json');
assert.equal(repeated.registered,0,'reloading must not duplicate records');
assert.equal(repeated.total,registry.cards.length);
console.log('PASS: '+registry.cards.length+' existing verified official print references resolve exactly; reload idempotent');
