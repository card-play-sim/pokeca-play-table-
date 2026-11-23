#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const id=v=>typeof v==='string'&&/^[0-9]+$/.test(v)?v:null;
const arr=(obj,label)=>{if(Array.isArray(obj))return obj;for(const k of ['cards','records','entries'])if(Array.isArray(obj?.[k]))return obj[k];throw Error(label+' array missing')};
function audit(imageFile,formalFile,options={}){
 const images=arr(read(imageFile),'image'), formal=arr(read(formalFile),'formal');
 const issues=[], add=(type,side,index,value,detail)=>issues.push({type,side,index,officialCardId:value??null,detail});
 const index=(rows,side)=>{const map=new Map();rows.forEach((x,i)=>{const raw=x.officialCardId??x.official_card_id;const k=id(raw);if(!k)add('INVALID_OFFICIAL_ID',side,i,raw,'numeric string required; no coercion');else {if(map.has(k))add('DUPLICATE_OFFICIAL_ID',side,i,k,{firstIndex:map.get(k).index});else map.set(k,{record:x,index:i});}});return map};
 const im=index(images,'image'),fm=index(formal,'formal');
 images.forEach((x,i)=>{if(!x.imageSourceUrl||typeof x.imageSourceUrl!=='string')add('IMAGE_URL_MISSING','image',i,x.officialCardId);if(x.officialPageUrl&&id(x.officialCardId)){const match=x.officialPageUrl.match(/\/card\/(\d+)/);if(match&&match[1]!==x.officialCardId)add('PAGE_ID_MISMATCH','image',i,x.officialCardId,{pageId:match[1]})}});
 let matched=0;for(const [k,v] of im){if(fm.has(k))matched++;else add('IMAGE_ONLY','image',v.index,k,'different populations; not automatically an error')}
 for(const [k,v] of fm)if(!im.has(k))add('FORMAL_ONLY','formal',v.index,k,'image absent for formal ID');
 const preview=options.previewFile&&fs.existsSync(options.previewFile)?arr(read(options.previewFile),'preview'):null;
 if(preview)preview.forEach((x,i)=>{const p=x.preview||x;if(p.officialCardId&&!im.has(String(p.officialCardId)))add('APP_PREVIEW_ID_NOT_IN_IMAGE','preview',i,p.officialCardId)});
 const counts={images:images.length,formal:formal.length,matched,imageOnly:im.size-matched,formalOnly:fm.size-matched,issuesByType:{}};
 for(const x of issues)counts.issuesByType[x.type]=(counts.issuesByType[x.type]||0)+1;
 const report={schemaVersion:1,scope:'IMG-LEDGER-002',inputHashes:{image:{path:imageFile,sha256:sha(imageFile)},formal:{path:formalFile,sha256:sha(formalFile)}},counts,issues,limitations:['Formal and image populations differ; IMAGE_ONLY is not an automatic error','Browser rendering and H/I/J mark evidence require separate verification']};
 if(preview)report.inputHashes.preview={path:options.previewFile,sha256:sha(options.previewFile)};
 return report;
}
if(require.main===module){const [imageFile,formalFile,outFile,previewFile]=process.argv.slice(2);if(!imageFile||!formalFile||!outFile){console.error('Usage: node scripts/img-ledger-002-audit.cjs IMAGE_JSON FORMAL_JSON OUTPUT_JSON [PREVIEW_JSON]');process.exit(2)}try{const report=audit(imageFile,formalFile,{previewFile});fs.mkdirSync(path.dirname(outFile),{recursive:true});fs.writeFileSync(outFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.counts));if(report.counts.images!==6248||report.counts.formal!==1945)process.exitCode=3}catch(e){console.error(e.stack);process.exitCode=2}}
module.exports={audit};
