'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};
vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),context);
const saved=context.window.PokecaSavedDecks;
const card={regulationMark:'J',name:'公式名',url:'https://www.pokemon-card.com/image.jpg',pack:'M',number:'001/100',category:'goods'};
const plan={officialCardId:'12345',name:card.name,imageSourceUrl:card.url,set:card.pack,cardNumber:card.number,category:'item',regulationMark:'J'};
const original=new Map([['12345',card],['12346',{...card,regulationMark:'H'}],['12347',{...card,regulationMark:'I'}],['12348',{...card,regulationMark:null}]]);
const audit=plans=>JSON.parse(JSON.stringify(saved.auditIJCoverage(original,plans)));
assert.deepEqual(audit(new Map([['12345',plan]])),{I:{total:1,connected:0,missing:1},J:{total:1,connected:1,missing:0}});
for(const change of [{officialCardId:'54321'},{name:'誤名称'},{imageSourceUrl:'https://example.invalid/'},{set:'別版'},{cardNumber:'002/100'},{category:'tool'},{regulationMark:'I'}]){
  assert.equal(audit(new Map([['12345',{...plan,...change}]])).J.connected,0);
}
assert.equal(audit(new Map([['12345',{...plan,set:'OFFICIAL_PAGE_REFERENCE',cardNumber:'',source:{kind:'saved-official-extension'}}]])).J.connected,1);
console.log('I/J audit: exact ID, name, image, category, print and regulation boundaries PASS');
