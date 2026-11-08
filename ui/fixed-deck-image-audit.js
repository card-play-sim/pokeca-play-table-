/* Counts exact deck prints separately from candidate artwork and original placeholders. */
(function(root,factory){
 const rules=typeof module==='object'&&module.exports?require('./official-image-validation.js'):root.PokecaImageValidation;
 const api=factory(rules);if(typeof module==='object'&&module.exports)module.exports=api;else root.PokecaFixedDeckImageAudit=api;
})(typeof window==='object'?window:globalThis,function(rules){
 'use strict';
 function entry(card,record,observation={}){
  if(!Number.isInteger(card?.count)||card.count<1)throw Error('FIXED_CARD_COUNT');
  const identified=card.identityStatus==='CONFIRMED'&&card.officialCardId!=null&&!!card.set&&!!card.cardNumber;
  const matched=identified&&rules.matches(record,card);
  const exact=matched&&observation.sourceUrl===record.imageSourceUrl;
  const painted=observation.decoded===true&&observation.visible===true;
  const status=!identified?'IDENTITY_UNCONFIRMED':!matched?'IMAGE_REFERENCE_MISSING':!exact?'WRONG_IMAGE_SOURCE':!observation.decoded?'IMAGE_LOAD_FAILED':!observation.visible?'IMAGE_NOT_VISIBLE':'OFFICIAL_IMAGE_DISPLAYED';
  return {name:card.name,count:card.count,officialCardId:card.officialCardId??null,set:card.set??null,cardNumber:card.cardNumber??null,status,
   officialDisplayedCopies:exact&&painted?card.count:0,pendingCopies:exact&&painted?0:card.count,
   candidatePreview:!identified&&painted&&rules.validURL(observation.sourceUrl),sourceUrl:observation.sourceUrl?.startsWith('data:')?'ORIGINAL_PLACEHOLDER':observation.sourceUrl||null,decoded:observation.decoded===true,visible:observation.visible===true};
 }
 function summarize(rows){
  const total=rows.reduce((n,r)=>n+r.count,0),displayed=rows.reduce((n,r)=>n+r.officialDisplayedCopies,0);
  return {totalCards:total,officialDisplayedCopies:displayed,pendingCopies:total-displayed,productionPass:total===120&&rows.length===56&&new Set(rows.map(r=>r.name)).size===45&&displayed===120,
   candidatePreviewCopies:rows.filter(r=>r.candidatePreview).reduce((n,r)=>n+r.count,0),rows};
 }
 return Object.freeze({entry,summarize});
});
