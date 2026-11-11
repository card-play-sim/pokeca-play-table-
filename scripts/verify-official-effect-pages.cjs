'use strict';
// Fail-closed official-page corroboration of effect evidence. Hashes alone are self-attested.
// This checks that the claimed effect text occurs in the official card's rendered HTML text.
// It does not infer effect boundaries or approve card mechanics.
const fs=require('node:fs'),crypto=require('node:crypto');
const input=process.argv[2],report=process.argv[3];
if(!input||!report)throw Error('USAGE: node verify-official-effect-pages.cjs registry.json report.json');
const rows=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(rows))throw Error('EVIDENCE_MUST_BE_ARRAY');
const normalize=s=>String(s).normalize('NFKC').replace(/\s+/g,' ').trim();
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);|&(?:nbsp|amp|lt|gt|quot|apos|#39);/gi,m=>{
 const known={'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};
 if(known[m.toLowerCase()])return known[m.toLowerCase()];
 const match=m.match(/^&#(x[0-9a-f]+|\d+);$/i);
 if(!match)return m;
 const n=match[1][0].toLowerCase()==='x'?parseInt(match[1].slice(1),16):Number(match[1]);
 return n>0&&n<=0x10ffff?String.fromCodePoint(n):m;
});
const plain=html=>normalize(decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retrieve(url){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{headers:{'user-agent':'PokemonCardEffectEvidenceVerifier/1.0 (official text corroboration)','accept':'text/html'},signal:AbortSignal.timeout(12000),redirect:'follow'});
   if(!response.ok)throw Error('HTTP_'+response.status);
   if(new URL(response.url).hostname!=='www.pokemon-card.com')throw Error('UNTRUSTED_REDIRECT');
   return await response.text();
  }catch(e){if(attempt===2)throw e;await sleep(700*(attempt+1));}
 }
}
(async()=>{
 const byPage=new Map(),results=[];
 for(const [index,row] of rows.entries()){
  const id=String(row?.officialCardId||''),url=row?.officialPageUrl;
  const expected='https://www.pokemon-card.com/card-search/details.php/card/'+id;
  const fail=reason=>results.push({index,officialCardId:id,status:'BLOCKED',reason});
  if(!/^\d{4,8}$/.test(id)||typeof url!=='string'||!(url===expected||url.startsWith(expected+'/'))){fail('INVALID_OFFICIAL_PAGE');continue;}
  if(typeof row.effectText!=='string'||!row.effectText.trim()||sha(row.effectText.trim())!==row.officialTextSha256){fail('INVALID_EFFECT_TEXT_HASH');continue;}
  if(!byPage.has(id)){
   const canonical=expected;
   byPage.set(id,retrieve(canonical).then(plain).catch(e=>({error:String(e.message||e)})));
   if(byPage.size>1)await sleep(250);
  }
  const page=await byPage.get(id);
  if(typeof page!=='string'){fail('OFFICIAL_PAGE_FETCH_FAILED:'+page.error);continue;}
  const target=normalize(row.effectText);
  if(!page.includes(target)){fail('OFFICIAL_PAGE_TEXT_NOT_FOUND');continue;}
  results.push({index,officialCardId:id,status:'VERIFIED',officialPageUrl:expected,effectTextSha256:row.officialTextSha256});
 }
 const verified=results.filter(r=>r.status==='VERIFIED').length;
 const result={schemaVersion:1,source:input,total:rows.length,verified,blocked:results.length-verified,results};
 fs.mkdirSync(require('node:path').dirname(require('node:path').resolve(report)),{recursive:true});
 fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
 console.log('OFFICIAL_PAGE_VERIFICATION:',JSON.stringify({total:result.total,verified,blocked:result.blocked,report}));
 if(result.blocked)process.exitCode=2;
})().catch(e=>{console.error(e);process.exitCode=2;});
