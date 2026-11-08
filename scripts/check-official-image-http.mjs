#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../data/official-image-registry.json');
const records=JSON.parse(fs.readFileSync(file,'utf8')).cards;
const results=[];
for(const card of records){
  const url=card.imageSourceUrl;
  let status='ERROR',mime='',bytes=0,error='';
  try{
    const response=await fetch(url,{headers:{'User-Agent':'PokecaImageRegistryVerifier/1.0'},signal:AbortSignal.timeout(12000)});
    status=response.status;mime=response.headers.get('content-type')||'';
    if(response.ok&&mime.toLowerCase().startsWith('image/')){const body=await response.arrayBuffer();bytes=body.byteLength;}
  }catch(e){error=String(e);}
  results.push({officialCardId:card.officialCardId,name:card.name,status,mime,bytes,pass:status===200&&mime.toLowerCase().startsWith('image/')&&bytes>500,error});
}
const pass=results.every(r=>r.pass);
const report={checked:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,pass,results};
fs.writeFileSync(path.join(__dirname,'../data/official-image-http-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checked:report.checked,passed:report.passed,failed:report.failed,pass},null,2));
if(!pass)process.exitCode=1;
