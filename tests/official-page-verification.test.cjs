'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'official-page-verification-'));
const verifier=path.resolve(__dirname,'../scripts/verify-official-effect-pages.cjs');
const input=path.join(dir,'registry.json'),output=path.join(dir,'report.json');
const effect='山札を2枚引く。';
const record={officialCardId:'45152',officialPageUrl:'https://www.pokemon-card.com/card-search/details.php/card/45152',category:'pokemon',effectKind:'ability',effectText:effect,officialTextSha256:crypto.createHash('sha256').update(effect).digest('hex')};
function run(html,rows,expectedCode){
 fs.writeFileSync(input,JSON.stringify(rows));
 const bootstrap='global.fetch=async(url)=>({ok:true,url,status:200,text:async()=>'+JSON.stringify(html)+'});process.argv=[process.execPath,'+JSON.stringify(verifier)+','+JSON.stringify(input)+','+JSON.stringify(output)+'];require('+JSON.stringify(verifier)+');';
 const p=cp.spawnSync(process.execPath,['-e',bootstrap],{encoding:'utf8'});
 assert.equal(p.status,expectedCode,p.stderr+' '+p.stdout);
 return JSON.parse(fs.readFileSync(output,'utf8'));
}
try{
 let result=run('<html><script>偽の効果</script><div>山札を2枚引く。</div></html>',[record],0);
 assert.equal(result.verified,1);
 result=run('<html><div>山札を2枚引く。</div></html>',[record,{...record,effectIndex:1,effectName:'別の特性'}],0);
 assert.equal(result.uniquePages,1,'MULTIPLE_EFFECTS_ON_ONE_PRINT_MUST_SHARE_ONE_PAGE_FETCH');
 assert.equal(result.verified,2);
 result=run('<html><script>山札を2枚引く。</script><div>別の効果</div></html>',[record],2);
 assert.equal(result.blocked,1,'SCRIPT_CONTENT_MUST_NOT_COUNT_AS_EVIDENCE');
 result=run('<html><div>山札を2枚引く。</div></html>',[{...record,officialTextSha256:'0'.repeat(64)}],2);
 assert.equal(result.blocked,1,'SELF_REPORTED_HASH_MUST_MATCH_TEXT');
 result=run('<html><div>山札を2枚引く。</div></html>',[{...record,officialPageUrl:'https://evil.example/card/45152'}],2);
 assert.equal(result.blocked,1,'UNTRUSTED_SOURCE_MUST_FAIL');
 console.log('OFFICIAL_PAGE_VERIFICATION PASS');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
