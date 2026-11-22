'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync('ui/saved-decks.js','utf8'),ctx,{filename:'saved-decks.js'});
const api=ctx.window.PokecaSavedDecks;
const cards=new Map(),plans=new Map();
const make=(id,name,category,extra={})=>({
 id:String(id),name,category,url:'https://www.pokemon-card.com/assets/images/card_images/large/TEST/'+id+'.jpg',
 pack:'TEST',number:'001/099',regulationMark:'J',...extra
});
function attach(id,card) {
 plans.set(String(id),{officialCardId:String(id),name:card.name,imageSourceUrl:card.url,
  category:card.category==='goods'?'item':card.category,regulationMark:card.regulationMark,
  set:card.pack,cardNumber:card.number,deckName:card.name,
  facts:card.category==='pokemon'?{basic:true}:undefined});
}
const p=make('48001','テストたね','pokemon');
const energy=make('48002','基本悪エネルギー','energy',{basicEnergy:true});
cards.set(p.id,p);cards.set(energy.id,energy);
attach(p.id,p);attach(energy.id,energy);
const deck={name:'おまつり',cards:{'48001':4,'48002':40},blocked:[]};
for(let i=0;i<16;i++){
 const id=String(49000+i),name='公式テストカード'+i,card=make(id,name,'goods');
 cards.set(id,card);deck.cards[id]=1;
}
assert.equal(api.total(deck),60);
const diagnosed=api.diagnoseDeck(deck,cards,plans);
assert.equal(diagnosed.issues.length,16,'all 16 unavailable printing IDs are shown');
assert.equal(diagnosed.deckReady,false);
assert.equal(diagnosed.issues.every(item=>item.reason==='NO_EFFECT_PLAN'),true);
const report=api.diagnosticText(deck,cards,plans);
assert.match(report,/未対応・未照合: 16種類/);
assert.match(report,/公式テストカード0 ×1 \[ID 49000\] \/ 公式効果の接続待ち/);
assert.match(report,/全カード構成（公式印刷版IDと枚数）:/);
assert.match(report,/おまつり/);
assert(report.includes('\n'),'copy report must use newlines');
assert.throws(()=>api.matchEntries(deck,cards,plans),/BLOCKED/);
const fake=make('49000','公式テストカード0','goods');
const conflicting={...fake,imageSourceUrl:'https://wrong.invalid/other.jpg',officialCardId:fake.id,set:fake.pack,cardNumber:fake.number,category:'item'};
plans.set(fake.id,conflicting);
let reason=api.diagnoseDeck(deck,cards,plans).issues.find(item=>item.id===fake.id);
assert.equal(reason.reason,'PRINT_IDENTITY_CONFLICT','display mismatch even when an effect plan exists');
assert.match(api.diagnosticText(deck,cards,plans),/印刷版・公式画像の照合不一致/);
attach(fake.id,fake);
for(let i=1;i<16;i++){const id=String(49000+i);attach(id,cards.get(id));}
assert.equal(api.diagnoseDeck(deck,cards,plans).deckReady,true);
assert.equal(api.matchEntries(deck,cards,plans).reduce((n,item)=>n+item.count,0),60);
const bad={...deck,blocked:[{officialCardId:'50749',name:'追加未照合',count:2}],cards:{...deck.cards,'48002':38}};
assert.equal(api.diagnoseDeck(bad,cards,plans).issues.length,1);
assert.equal(api.diagnoseDeck(bad,cards,plans).issues[0].id,'50749');
assert.equal(api.diagnoseDeck(bad,cards,plans).deckReady,false);
assert.match(api.diagnosticText(bad,cards,plans),/追加未照合 ×2 \[ID 50749\]/);
console.log('PASS deck blocker diagnostics 16 IDs, official image mismatch, opt-in report, and exact 60-card match gate');
