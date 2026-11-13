'use strict';
// Check deployed GitHub Pages bytes, not just a successful build/deploy job.
// This does not claim a physical Android device was tested.
const fs=require('node:fs');
const crypto=require('node:crypto');
const https=require('node:https');
const assert=require('node:assert/strict');
const base='https://card-play-sim.github.io/pokeca-play-table-/';
const html=fs.readFileSync('index.html','utf8');
const build=html.match(/name="pokeca-build" content="(\d+)"/)?.[1];
assert(build,'missing PWA build');
const local=fs.readFileSync('sw.js','utf8');
const release=local.match(/const CACHE='([^']+)'/)?.[1];
assert(release,'missing local PWA release id');
const releaseFiles=JSON.parse(local.match(/const FILES=(\{[\s\S]*?\});/)[1]);
const paths=[...new Set(['index.html','sw.js','data/reference-effects/plans.json',...Object.keys(releaseFiles).map(url=>url==='./'?'':url.replace(/^\.\//,''))])];
function fetch(url){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{'Cache-Control':'no-cache','User-Agent':'pokeca-release-verifier'}},res=>{
   if(res.statusCode!==200){res.resume();return reject(Error('HTTP_'+res.statusCode+' '+url));}
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(Buffer.concat(chunks)));
  });req.setTimeout(15000,()=>req.destroy(Error('FETCH_TIMEOUT '+url)));req.on('error',reject);
 });
}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
async function verify(){
 const results=[];
 for(const path of paths){
  const remote=await fetch(base+path+(path.includes('?')?'&':'?')+'release='+encodeURIComponent(release));
  const expected=fs.readFileSync(path.split('?')[0]||'index.html');
  const same=hash(remote)===hash(expected);
  results.push({path:path||'./',localSha256:hash(expected),remoteSha256:hash(remote),match:same});
 }
 const success=results.every(r=>r.match);
 return {schemaVersion:1,kind:'published-pwa-byte-verification',build,release,
  base,success,results,androidDeviceVerified:false};
}
(async()=>{
 const attempts=Number(process.env.RELEASE_VERIFY_ATTEMPTS||1);
 const waitMs=Number(process.env.RELEASE_VERIFY_INTERVAL_MS||30000);
 assert(Number.isInteger(attempts)&&attempts>=1&&attempts<=30);
 assert(Number.isInteger(waitMs)&&waitMs>=0&&waitMs<=120000);
 let report;
 for(let i=1;i<=attempts;i++){
  try{report=await verify();}catch(e){report={schemaVersion:1,kind:'published-pwa-byte-verification',build,release,base,success:false,error:String(e),androidDeviceVerified:false};}
  report.attempt=i;
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/published-pwa-verification.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(report.success)break;
  if(i<attempts)await new Promise(resolve=>setTimeout(resolve,waitMs));
 }
 if(!report.success)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
