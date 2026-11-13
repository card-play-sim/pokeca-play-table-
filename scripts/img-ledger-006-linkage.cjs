#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const [candidateFile,appFile,previewFile,manifestFile,out]=process.argv.slice(2);
if(!out)throw Error('Usage: node scripts/img-ledger-006-linkage.cjs candidate.json deployed.json previews.json manifest.json report.json');
const read=p=>fs.readFileSync(p),sha=p=>crypto.createHash('sha256').update(read(p)).digest('hex'),json=p=>JSON.parse(read(p));
const candidate=json(candidateFile),deployed=json(appFile),preview=json(previewFile),manifest=json(manifestFile);
const issues=[],unverified=[],previewDifferences=[],candidateIds=new Map(),deployedIds=new Map();
function index(source,map){for(const row of source.cards||[]){const id=String(row.officialCardId);map.set(id,row)}}
index(candidate,candidateIds);index(deployed,deployedIds);
for(const [id,row] of deployedIds){const next=candidateIds.get(id);if(!next)issues.push({type:'DEPLOYED_ID_ABSENT_FROM_CANDIDATE',id});else if(next.imageSourceUrl!==row.imageSourceUrl)issues.push({type:'DEPLOYED_IMAGE_URL_DIFFERS',id})}
for(const [id,row] of candidateIds)if(!deployedIds.has(id))unverified.push({type:'CANDIDATE_NOT_DEPLOYED',id});
let previewCount=0,previewMissing=0;
for(const binding of preview.bindings||[]){const p=binding.preview;if(!p)continue;previewCount++;const id=String(p.officialCardId),c=candidateIds.get(id);if(!c||c.imageSourceUrl!==p.imageSourceUrl){previewMissing++;previewDifferences.push({type:'PROVISIONAL_PREVIEW_NOT_MATCHED_TO_CANDIDATE',id,deckName:binding.deckName})}}
const confirmed=Object.entries(manifest.hijByPrintedMark||{}).reduce((n,[,v])=>n+v,0);
if(confirmed!==manifest.hijTotal)issues.push({type:'HIJ_MANIFEST_SUM_INCONSISTENT',actual:confirmed,expected:manifest.hijTotal});
if(manifest.hijRegisteredInRecoveryCandidate!==manifest.hijTotal||manifest.hijMissingFromRecoveryCandidate?.length)issues.push({type:'HIJ_MANIFEST_COVERAGE_INCONSISTENT'});
const report={schemaVersion:1,scope:'IMG-LEDGER-006-static-app-linkage',inputSha256:{candidate:sha(candidateFile),deployed:sha(appFile),preview:sha(previewFile),manifest:sha(manifestFile)},counts:{candidate:candidateIds.size,deployed:deployedIds.size,deployedIdsWithCandidate:deployedIds.size-issues.filter(x=>x.type==='DEPLOYED_ID_ABSENT_FROM_CANDIDATE').length,candidateNotDeployed:unverified.length,previewBindings:previewCount,previewMismatch:previewMissing,hijManifestTotal:manifest.hijTotal,hijByMark:manifest.hijByPrintedMark,errors:issues.length},issues,unverified,previewDifferences,limitations:['Candidate v247 is not published; absent candidate IDs are not assumed app errors','H/I/J manifest totals are self-consistency checks, not independent official per-ID proof','Static URL join does not establish browser image loading or official catalog join'],blocked:{formalOriginal:'NOT_PROVISIONED',officialHIJPerId:'NOT_PROVIDED'}};
if(report.inputSha256.candidate!==manifest.recoveryRegistrySha256){issues.push({type:'CANDIDATE_HASH_MISMATCH'});report.counts.errors=issues.length}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.counts));if(issues.length)process.exitCode=1;
