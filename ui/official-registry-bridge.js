/* Official ID image metadata bridge. No image display without verified permission. */
(function(root){
'use strict';
function createBridge(registry){
if(!registry||!registry.cardsByOfficialId||typeof registry.cardsByOfficialId!=='object')throw Error('Invalid registry');
const records=registry.cardsByOfficialId;
function lookup(card){
const print=card?.evolutionCards?.length?card.evolutionCards[card.evolutionCards.length-1]:card;
const id=print?.officialCardId??print?.catalogCardId;
if(id==null||!/^\d+$/.test(String(id)))return null;
const record=records[String(id)];
return record&&String(record.officialCardId)===String(id)?record:null;
}
function imageURL(card){
const record=lookup(card);
if(!record||record.simulator?.renderAllowed!==true||record.rights?.externalReference!=='confirmed'||record.acquisition?.status!=='reference_only')return '';
return typeof record.sourceUrl==='string'&&/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\//.test(record.sourceUrl)?record.sourceUrl:'';
}
return Object.freeze({lookup,imageURL,cardInfo(card){const r=lookup(card);return r?Object.freeze({officialCardId:r.officialCardId,name:r.name,cardNumber:r.cardNumber,regulationMark:r.regulationMark,cardType:r.cardType,pokemonStage:r.pokemonStage,imageApproved:!!imageURL(card)}):null;}});
}
root.PokecaCardImageBridge=Object.freeze({createBridge});
})(typeof window!=='undefined'?window:globalThis);
