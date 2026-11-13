'use strict';
module.exports=function(fixed){const manifest=JSON.parse(JSON.stringify(fixed));for(const [i,deck]of manifest.decks.entries()){
 deck.id='extension-reference-'+i;deck.name='固定外公式参照デッキ '+(i+1);
 for(const [name,category,id]of [['ネモ','supporter',i?'45437':'44513'],['きずぐすり','item','45430'],['きずぐすり','item','46584'],['ポケモンキャッチャー','item','45433'],['ポケモンキャッチャー','item','46591']]){
  const source=deck.cards.find(c=>c.category===category&&c.count&&!c.referenceOfficialCardId);if(!source)throw Error('FIXTURE_CARD_UNAVAILABLE');source.count--;deck.cards.push({name,category,count:1,referenceOfficialCardId:id});
 }
 deck.cards=deck.cards.filter(c=>c.count);
}return manifest;};
