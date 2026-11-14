'use strict';
module.exports=function(fixed,records){
 const manifest=JSON.parse(JSON.stringify(fixed)),category=c=>({goods:'item',support:'supporter'}[c]||c);
 for(const [i,deck]of manifest.decks.entries()){
  deck.id='control-009-reference-'+i;deck.name='共通効果拡張検証 '+(i+1);
  for(const row of records){
   const source=deck.cards.find(c=>category(c.category)===(row.category==='stadium'?'item':row.category)&&c.count&&!c.referenceOfficialCardId)||deck.cards.find(c=>['item','supporter'].includes(category(c.category))&&c.count&&!c.referenceOfficialCardId);if(!source)throw Error('FIXTURE_CATEGORY_UNAVAILABLE:'+row.category);
   source.count--;deck.cards.push({name:row.name,category:row.category,count:1,referenceOfficialCardId:row.officialCardId});
  }
  deck.cards=deck.cards.filter(c=>c.count);
 }
 return manifest;
};
