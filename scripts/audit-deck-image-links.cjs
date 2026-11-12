'use strict';
// Read-only deck-to-print identity audit. Never adopt print IDs by card name.
const fs=require('node:fs'),crypto=require('node:crypto');
const [deckPath,registryPath,outputPath]=process.argv.slice(2);
if(!deckPath||!registryPath||!outputPath)throw Error('USAGE: audit-deck-image-links.cjs decks.json images.json report.json');
if(new Set([deckPath,registryPath,outputPath].map(p=>require('node:path').resolve(p))).size!==3)throw Error('PATHS_MUST_DIFFER');
const decks=JSON.parse(fs.readFileSync(deckPath,'utf8'));
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
const images=registry.imageByOfficialCardId||registry;
if(!Array.isArray(decks.decks)||!images||Array.isArray(images)||typeof images!=='object')throw Error('INVALID_INPUT_SCHEMA');
const report={schemaVersion:1,sourceSha256:{decks:crypto.createHash('sha256').update(fs.readFileSync(deckPath)).digest('hex'),images:crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex')},counts:{deckSlots:0,cardCopies:0,confirmed:0,unconfirmed:0,missingImage:0,conflicting:0},rows:[]};
for(const deck of decks.decks){
 for(const card of deck.cards||[]){
  const copies=card.count, id=card.officialCardId==null?null:String(card.officialCardId);
  if(!Number.isInteger(copies)||copies<1)throw Error('INVALID_CARD_COUNT');
  report.counts.deckSlots++;report.counts.cardCopies+=copies;
  let status='UNCONFIRMED',reason='NO_ADOPTED_PRINT_ID';
  if(id!==null){
   const image=images[id];
   if(!/^\d{4,8}$/.test(id)){status='CONFLICT';reason='INVALID_PRINT_ID';}
   else if(!image){status='MISSING_IMAGE';reason='PRINT_ID_NOT_IN_IMAGE_REGISTRY';}
   else if(image.officialCardId!=null&&String(image.officialCardId)!==id){status='CONFLICT';reason='REGISTRY_ID_MISMATCH';}
   else if(card.name&&image.name&&card.name!==image.name){status='CONFLICT';reason='NAME_MISMATCH_REQUIRES_REVIEW';}
   else if(card.set&&image.set&&card.set!==image.set){status='CONFLICT';reason='SET_MISMATCH';}
   else if(card.cardNumber&&image.cardNumber&&card.cardNumber!==image.cardNumber){status='CONFLICT';reason='NUMBER_MISMATCH';}
   else if(card.identityStatus!=='CONFIRMED'){status='UNCONFIRMED';reason='PRINT_ID_NOT_APPROVED';}
   else {status='CONFIRMED';reason='ADOPTED_ID_AND_REGISTRY_MATCH';}
  }
  report.counts[{CONFIRMED:'confirmed',UNCONFIRMED:'unconfirmed',MISSING_IMAGE:'missingImage',CONFLICT:'conflicting'}[status]]++;
  report.rows.push({deck:deck.id,name:card.name,copies,officialCardId:id,status,reason});
 }
}
fs.mkdirSync(require('node:path').dirname(require('node:path').resolve(outputPath)),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log('DECK_IMAGE_LINK_AUDIT '+JSON.stringify(report.counts));
if(report.counts.conflicting)process.exitCode=2;
