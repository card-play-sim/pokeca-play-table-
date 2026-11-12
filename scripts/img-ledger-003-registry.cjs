#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const file=process.argv[2],manifest=process.argv[3],out=process.argv[4];
if(!file||!manifest||!out){console.error('Usage: node scripts/img-ledger-003-registry.cjs IMAGE_JSON HIJ_MANIFEST_JSON OUT_JSON');process.exit(2)}
const bytes=p=>fs.readFileSync(p),sha=p=>crypto.createHash('sha256').update(bytes(p)).digest('hex');
const registry=JSON.parse(bytes(file)),m=JSON.parse(bytes(manifest));const rows=registry.cards;
if(!Array.isArray(rows))throw Error('registry.cards absent');
const errors=[],idIndex=new Map(),urlIndex=new Map(),marks={H:0,I:0,J:0,OTHER:0,UNSET:0};
function issue(type,i,id,detail){errors.push({type,index:i,officialCardId:id??null,detail})}
rows.forEach((r,i)=>{
 const id=r.officialCardId;
 if(typeof id!=='string'||!/^[0-9]+$/.test(id))issue('INVALID_ID',i,id,'expected exact numeric string');
 else if(idIndex.has(id))issue('DUPLICATE_ID',i,id,{firstIndex:idIndex.get(id)});
 else idIndex.set(id,i);
 const url=r.imageSourceUrl;
 if(typeof url!=='string'||!url)issue('MISSING_URL',i,id);
 else {if(urlIndex.has(url))issue('DUPLICATE_URL',i,id,{firstIndex:urlIndex.get(url)});else urlIndex.set(url,i);
 if(!url.startsWith('https://www.pokemon-card.com/assets/images/card_images/'))issue('UNEXPECTED_IMAGE_ORIGIN',i,id,url)}
 const page=r.officialPageUrl;
 if(typeof page==='string'){const p=page.match(/\/card\/(\d+)/);if(p&&p[1]!==id)issue('OFFICIAL_PAGE_ID_MISMATCH',i,id,p[1])}
 const mark=r.regulationMark;
 if(['H','I','J'].includes(mark))marks[mark]++;else marks[mark?'OTHER':'UNSET']++;
});
const expected=m.hijByPrintedMark||{};const hijExpected=m.hijTotal;
const declaredHIJ=marks.H+marks.I+marks.J;
if(rows.length!==m.recoveryRegistryTotal)issue('REGISTRY_COUNT_MISMATCH',-1,null,{actual:rows.length,expected:m.recoveryRegistryTotal});
if(declaredHIJ!==hijExpected)issue('HIJ_DECLARED_COUNT_MISMATCH',-1,null,{actual:declaredHIJ,expected:hijExpected});
for(const k of ['H','I','J'])if(marks[k]!==expected[k])issue('HIJ_MARK_COUNT_MISMATCH',-1,null,{mark:k,actual:marks[k],expected:expected[k]});
const report={schemaVersion:1,scope:'IMG-LEDGER-003-registry-independent',inputHashes:{registry:{sha256:sha(file),expectedSha256:m.recoveryRegistrySha256},manifest:{sha256:sha(manifest)}},counts:{registry:rows.length,uniqueIds:idIndex.size,uniqueUrls:urlIndex.size,marks,declaredHIJ,expectedHIJ:hijExpected,issues:errors.length},issues:errors,blocked:{formal1945Join:'FORMAL_ORIGINAL_NOT_PROVISIONED',appBrowserValidation:'NOT_RUN_IN_THIS_JOB'},note:'Does not claim formal catalog join or physical browser rendering'};
if(report.inputHashes.registry.sha256!==m.recoveryRegistrySha256)issue('REGISTRY_SHA_MISMATCH',-1,null,{actual:report.inputHashes.registry.sha256,expected:m.recoveryRegistrySha256});
report.counts.issues=errors.length;
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.counts));if(errors.length)process.exitCode=1;
