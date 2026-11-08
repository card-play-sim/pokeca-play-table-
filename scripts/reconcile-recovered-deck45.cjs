#!/usr/bin/env node
'use strict';
// Read-only reconciliation of recovered review facts. Never edits the deck, DB, registry or engine.
const fs=require('node:fs'),path=require('node:path');
const rules=require('../ui/official-image-validation.js');
function reconcile(manifest,registry,facts,nameAudit={rows:[]},inventory={expectedOriginalFiles:[]}){
 if(manifest.decks?.length!==2||facts.deckReview.decisions?.length!==45)throw Error('RECOVERY_SCOPE_MISMATCH');
 const names=new Map(),byId=rules.index(registry.cards),review=new Map();
 for(const decision of facts.deckReview.decisions){if(review.has(decision.cardName))throw Error('DUPLICATE_REVIEW_NAME');review.set(decision.cardName,decision);}
 for(const [deckIndex,deck] of manifest.decks.entries()){
  if(deck.cards.reduce((n,c)=>n+c.count,0)!==60)throw Error('DECK_COUNT_MISMATCH');
  for(const card of deck.cards){const row=names.get(card.name)||{name:card.name,copies:0,deckA:0,deckB:0};row.copies+=card.count;row[deckIndex?'deckB':'deckA']+=card.count;names.set(card.name,row);}
 }
 if(names.size!==45||review.size!==45)throw Error('REVIEW_NAME_SET_MISMATCH');
 const rows=[...names.values()].map(row=>{
  const decision=review.get(row.name);if(!decision||decision.deckA!==row.deckA||decision.deckB!==row.deckB)throw Error('REVIEW_DECK_BINDING_MISMATCH_'+row.name);
  const candidate=facts.deckReview.candidates.find(c=>c.cardName===row.name);
  const match=candidate?.candidateCardNumber?.match(/^([A-Za-z0-9_-]+) (\d+\/[A-Za-z0-9/-]+)$/);
  if(candidate&&!match)throw Error('RECOVERED_CARD_NUMBER_SCHEMA_'+row.name);
  const tuple=candidate?{officialCardId:String(candidate.candidateOfficialCardId),name:row.name,set:match[1],cardNumber:match[2]}:null;
  const exactReference=tuple?byId.get(tuple.officialCardId):null;
  const referenceMatch=tuple&&exactReference?rules.matches(exactReference,tuple):null;
  const eligible=!!tuple&&facts.deckReview.productionAllowed===true&&decision.productionReady===true&&candidate.deckPrintingConfirmed===true&&
   String(decision.selectedOfficialCardId)===tuple.officialCardId&&String(candidate.selectedOfficialCardId)===tuple.officialCardId&&referenceMatch===true;
  const deckBound=eligible&&manifest.decks.flatMap(d=>d.cards).filter(c=>c.name===row.name).every(c=>c.identityStatus==='CONFIRMED'&&String(c.officialCardId)===tuple.officialCardId&&c.set===tuple.set&&c.cardNumber===tuple.cardNumber);
  const sourceNameMatched=nameAudit.rows?.find(r=>r.name===row.name)?.sourceNameMatched;
  return {...row,priorDecision:decision.identityStatus,selectedOfficialCardId:decision.selectedOfficialCardId??null,
   recoveredCandidate:tuple?{...tuple,deckPrintingConfirmed:candidate.deckPrintingConfirmed,selectedOfficialCardId:candidate.selectedOfficialCardId??null,registeredReferenceMatches:referenceMatch,evidence:facts.sourceRefs.deck45Staging}:null,
   verifiedReferencePrints:registry.cards.filter(c=>c.name===row.name&&c.set&&c.cardNumber&&c.detailSha256).map(c=>({officialCardId:c.officialCardId,set:c.set,cardNumber:c.cardNumber,imageSourceUrl:c.imageSourceUrl,officialPageUrl:c.officialPageUrl,detailSha256:c.detailSha256,deckAdopted:false})),
   status:deckBound?'CONFIRMED_IN_DECK_AND_EVIDENCE':eligible?'REQUIRES_EXISTING_REGISTRATION_AND_DECK_ADOPTION':'HOLD_NOT_SELECTED_IN_RECOVERED_REVIEW',confirmedCopies:deckBound?row.copies:0,
   requiredEvidence:{deckSelection:{name:row.name,deckA:row.deckA,deckB:row.deckB,fields:['selectedOfficialCardId','set','cardNumber','source deck/edition binding','explicit selection approval']},
    candidateOfficialEvidence:tuple&&referenceMatch!==true?{officialCardId:tuple.officialCardId,set:tuple.set,cardNumber:tuple.cardNumber,required:'original catalog row plus saved official detail/image reference; a prior candidate number is insufficient'}:null,
    originalOfficialReferenceRequired:!registry.cards.some(c=>c.name===row.name&&c.set&&c.cardNumber&&c.detailSha256),
    exactOfficialNameOrApprovedCorrectionRequired:sourceNameMatched===false}};
 });
 const total=rows.reduce((n,r)=>n+r.copies,0),confirmed=rows.reduce((n,r)=>n+r.confirmedCopies,0);
 return {schemaVersion:1,totalCards:total,uniqueNames:rows.length,confirmedCopies:confirmed,pendingCopies:total-confirmed,
  priorReviewCounts:facts.deckReview.counts,recoveredCandidateCount:facts.deckReview.candidates.length,
  candidateTuplesMatchingRegisteredEvidence:rows.filter(r=>r.recoveredCandidate?.registeredReferenceMatches===true).length,
  approvedSelectionRecords:rows.filter(r=>r.status==='REQUIRES_EXISTING_REGISTRATION_AND_DECK_ADOPTION'||r.status==='CONFIRMED_IN_DECK_AND_EVIDENCE').length,
  originalFormalCatalogRecovered:inventory.expectedOriginalFiles.some(f=>f.path.endsWith('/card_catalog.json')&&f.payloadRecovered),originalImageRegistryRecovered:inventory.expectedOriginalFiles.some(f=>f.path.endsWith('/image_registry.json')&&f.payloadRecovered),baselineDeclarationRecovered:inventory.expectedOriginalFiles.some(f=>f.path==='FORMAL_BASELINE.json'&&f.payloadRecovered),
  registrationOrEngineChangesApplied:false,pass:total===120&&rows.length===45&&confirmed===120,rows};
}
if(require.main===module){
 const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const result=reconcile(read('data/fixed-test-decks.json'),read('data/official-image-registry.json'),read('data/fixed-deck-recovery/recovered-source-facts.json'),read('data/fixed-120-print-resolution.json'),read('data/fixed-deck-recovery/source-inventory.json'));
 fs.writeFileSync(path.join(root,'data/fixed-deck-recovery/deck45-reconciliation.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({confirmedCopies:result.confirmedCopies,pendingCopies:result.pendingCopies,recoveredCandidates:result.recoveredCandidateCount,registeredTupleMatches:result.candidateTuplesMatchingRegisteredEvidence,pass:result.pass}));
 if(!result.pass)process.exitCode=2;
}
module.exports={reconcile};
