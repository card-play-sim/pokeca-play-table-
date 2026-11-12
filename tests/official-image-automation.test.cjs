'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {run,preserved}=require('../scripts/automate-official-images.cjs');
const {atomic,hash,collect,parseSearch}=require('../scripts/collect-official-image-evidence.cjs');
const {persist}=require('../scripts/persist-official-image-results.cjs');
const root=path.resolve(__dirname,'..'),branch='feature/official-image-registry-automation';
const original=JSON.parse(fs.readFileSync(path.join(root,'data/official-image-registry.json')));
const originalCount=original.cards.length;
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const candidate=(id='60001')=>({officialCardId:id,name:'TEST '+id,set:'TEST',cardNumber:'001/100',officialDetailsUrl:'https://www.pokemon-card.com/card-search/details.php/card/'+id});
const image=c=>'https://www.pokemon-card.com/assets/images/card_images/large/TEST/0'+c.officialCardId+'_P_TEST.jpg';
const html=(c,change={})=>{const x={...c,...change};return '<html><h1 class="Heading1 mt20">'+x.name+'</h1><div class="LeftBox"><img class="fit" src="'+image(x)+'"><div class="subtext"><img class="img-regulation" alt="'+x.set+'">'+x.cardNumber+'</div></div></html>';};
const response=body=>({ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=>body});
const fixtures=[];
function fixture(candidates=[candidate(),candidate('60002')]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-automation-'));fixtures.push(dir);
 for(const folder of ['data','engine','ui'])fs.mkdirSync(path.join(dir,folder));
 fs.copyFileSync(path.join(root,'data/fixed-test-decks.json'),path.join(dir,'data/fixed-test-decks.json'));
 atomic(path.join(dir,'data/official-image-registry.json'),original);
 atomic(path.join(dir,'data/fixed-deck-official-image-candidates.json'),{candidates});
 atomic(path.join(dir,'data/official-image-candidates-reviewed.json'),{cards:[]});
 atomic(path.join(dir,'data/formal-1945-read-only.json'),{cards:Array.from({length:1945},(_,i)=>({id:i}))});
 fs.writeFileSync(path.join(dir,'engine/readonly.txt'),'READ ONLY engine');
 return dir;
}
const opts=root=>({root,interval:0});
const git=(dir,...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
function gitFixture(dir){
 git(dir,'init','-q','-b',branch);git(dir,'config','user.email','test@example.invalid');git(dir,'config','user.name','Pipeline Test');
 git(dir,'add','.');git(dir,'commit','-qm','baseline');
 const remote=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-remote-'));fixtures.push(remote);
 git(remote,'init','--bare','-q');git(dir,'remote','add','origin',remote);git(dir,'push','-q','-u','origin',branch);
 return remote;
}
(async()=>{
 try{
  const dir=fixture(),remote=gitFixture(dir);let calls=0;
  const fetcher=async url=>{
   assert(!url.includes('/assets/'),'image bytes are never fetched');
   if(calls===1){
    const registry=read(path.join(dir,'data/official-image-registry.json'));
    assert(registry.cards.some(c=>c.officialCardId==='60001'));
    assert.equal(read(path.join(dir,'data/image-automation/receipts/60001.json')).status,'REGISTERED_READBACK_VERIFIED');
    assert.equal(read(path.join(dir,'data/image-automation/progress.json')).nextCursor,1);
   }
   calls++;return response(html(candidate(url.match(/card\/(\d+)/)[1])));
  };
  const first=await run({...opts(dir),fetcher});
  assert.equal(first.registrationPass,true);assert.equal(first.productionPass,false);assert.equal(calls,2);
  assert.equal(first.imageReferencesAdded,2);assert.equal(first.existingRecordsPreserved,true);assert.equal(first.protectedUnchanged,true);
  const registry=read(path.join(dir,'data/official-image-registry.json'));assert.equal(registry.cards.length,originalCount+2);
  for(const old of original.cards)assert(preserved(old,registry.cards.find(c=>c.officialCardId===old.officialCardId)));
  const before=fs.readFileSync(path.join(dir,'data/official-image-registry.json'));
  const again=await run({...opts(dir),fetcher:async()=>{throw Error('unexpected second fetch');}});
  assert.equal(again.registrationPass,true);assert.equal(again.replayed,2);assert.equal(again.imageReferencesAdded,0);
  assert.deepEqual(fs.readFileSync(path.join(dir,'data/official-image-registry.json')),before);
  let refreshedCalls=0;
  const refresh=await run({...opts(dir),refresh:true,fetcher:async url=>{refreshedCalls++;return response(html(candidate(url.match(/card\/(\d+)/)[1]))+'<!-- later observation -->');}});
  assert.equal(refresh.registrationPass,true);assert.equal(refreshedCalls,2);
  assert.deepEqual(fs.readFileSync(path.join(dir,'data/official-image-registry.json')),before,'refresh retains original evidence hashes and all registry fields');
  assert.equal(fs.readdirSync(path.join(dir,'data/image-automation/records/history')).length,2,'previous HTML evidence is archived, never discarded');
  // Real git transaction against a local bare remote verifies stage/commit/fast-forward push and persistence.
  const pushed=persist({root:dir});assert.equal(pushed.pushed,true);
  assert.equal(git(remote,'rev-parse','refs/heads/'+branch),pushed.commit);
  assert(git(remote,'show',pushed.commit+':data/official-image-registry.json').includes('60002'));
  assert(git(dir,'log','-1','--format=%s').includes('[skip ci]'));
  assert.equal(persist({root:dir}).committed,false,'unchanged rerun does not commit');
  // Receipt corruption cannot be published even if the old report claimed success.
  atomic(path.join(dir,'data/image-automation/receipts/60001.json'),{...read(path.join(dir,'data/image-automation/receipts/60001.json')),recordSha256:'0'.repeat(64)});
  assert.throws(()=>persist({root:dir}),/EVIDENCE_MISMATCH/);
  console.log('PASS end-to-end: sequential fetch/checkpoint/register/readback/receipt -> git commit/push, original 27 preserved, repeat is idempotent');

  // Print mismatch is isolated, audited and never converted to successful registration.
  const bad=fixture();const badRemote=gitFixture(bad);const blocked=await run({...opts(bad),fetcher:async url=>response(html(candidate(url.match(/card\/(\d+)/)[1]),url.includes('60001')?{set:'WRONG'}:{}))});
  assert.equal(blocked.registrationPass,false);assert.equal(blocked.safeToPersist,true);assert.equal(blocked.holds[0].reason,'PRINT_MISMATCH');
  assert.equal(read(path.join(bad,'data/official-image-registry.json')).cards.length,originalCount+1);
  assert.equal(blocked.nextCursor,0);assert(fs.readdirSync(path.join(bad,'data/image-automation/quarantine')).length>0);
  const savedBlocked=persist({root:bad});assert.equal(savedBlocked.registrationPass,false);assert.equal(savedBlocked.pushed,true);
  assert.equal(JSON.parse(git(badRemote,'show',savedBlocked.commit+':data/image-automation/latest.json')).registrationPass,false,'GitHub audit cannot turn a collection failure into success');
  const blockedRepeat=await run({...opts(bad),fetcher:async()=>{throw Error('cached hold must not refetch');}});
  assert.equal(blockedRepeat.registrationPass,false);
  // A failing HTTP request opens the circuit before requesting the next candidate.
  const http=fixture();let httpCalls=0;const fail=await run({...opts(http),fetcher:async()=>{httpCalls++;return {ok:false,status:429,headers:{get:()=> 'text/html'}};}});
  assert.equal(httpCalls,1);assert.equal(fail.registrationPass,false);assert.equal(fail.holds[1].reason,'SAFE_STOP');
  assert.equal(read(path.join(http,'data/official-image-registry.json')).cards.length,originalCount);

  const budget=fixture();let budgetCalls=0;
  const limited=await run({...opts(budget),maxRequests:1,fetcher:async url=>{budgetCalls++;return response(html(candidate(url.match(/card\/(\d+)/)[1])));}});
  assert.equal(budgetCalls,1);assert.equal(limited.registrationPass,false);assert.equal(limited.nextCursor,1);assert.equal(limited.holds[0].reason,'DEFERRED');
  const budgetResume=await run({...opts(budget),maxRequests:1,fetcher:async url=>response(html(candidate(url.match(/card\/(\d+)/)[1])))});
  assert.equal(budgetResume.registrationPass,true);
  const protectedRoot=fixture();let protectedCalls=0;
  const protection=await run({...opts(protectedRoot),fetcher:async()=>{protectedCalls++;fs.writeFileSync(path.join(protectedRoot,'engine/readonly.txt'),'changed externally');return response(html(candidate()));}});
  assert.equal(protection.registrationPass,false);assert.equal(protection.safeToPersist,false);assert.equal(protection.protectedUnchanged,false);assert.equal(protectedCalls,1);
  // Identity conflict and IO failure stop immediately, keeping the next record unrequested.
  const conflict=fixture();atomic(path.join(conflict,'data/official-image-registry.json'),{...original,cards:[...original.cards,{officialCardId:'60001',name:'TEST 60001',set:'OTHER',cardNumber:'001/100',imageSourceUrl:image(candidate())}]});
  let conflictCalls=0;const collision=await run({...opts(conflict),fetcher:async()=>{conflictCalls++;return response(html(candidate()));}});
  assert.equal(conflictCalls,1);assert.equal(collision.registrationPass,false);assert.equal(collision.safeToPersist,false);assert.match(collision.error,/CONFLICT/);
  const io=fixture();let ioCalls=0;const diskFail=await run({...opts(io),fetcher:async()=>{ioCalls++;return response(html(candidate()));},write:(file,value)=>{if(file.endsWith('receipts/60001.json'))throw Error('SIMULATED_DISK_FAILURE');atomic(file,value);}});
  assert.equal(ioCalls,1);assert.equal(diskFail.registrationPass,false);assert.equal(diskFail.safeToPersist,false);assert.match(diskFail.error,/DISK_FAILURE/);
  // Resume after a crash between registry write and receipt write completes the record without duplicate fetch.
  const recovered=await run({...opts(io),fetcher:async url=>response(html(candidate(url.match(/card\/(\d+)/)[1])))});
  assert.equal(recovered.registrationPass,true);assert.equal(recovered.replayed,1);assert.equal(read(path.join(io,'data/official-image-registry.json')).cards.length,originalCount+2);

  const tamper=fixture([candidate()]);await run({...opts(tamper),fetcher:async()=>response(html(candidate()))});
  const file=path.join(tamper,'data/image-automation/records/60001.json'),saved=read(file);
  saved.record.set='WRONG';saved.recordSha256=hash(JSON.stringify(saved.record));atomic(file,saved);
  const rejected=await run({...opts(tamper),fetcher:async()=>{throw Error('must not fetch');}});
  assert.equal(rejected.registrationPass,false);assert.match(rejected.error,/RECORD_MISMATCH/);

  // Explicit observed search links are checked before details; offsite links and script text do not qualify.
  assert.equal(parseSearch('<a href="https://evil.invalid/card-search/details.php/card/60001">x</a>','60001').found,false);
  assert.equal(parseSearch('<script>"/card-search/details.php/card/60001"</script>','60001').found,false);
  const search=fixture([{...candidate(),officialSearchUrl:'https://www.pokemon-card.com/card-search/index.php?keyword=TEST'}]);let searchCalls=[];
  const searched=await run({...opts(search),fetcher:async url=>{searchCalls.push(url);return response(url.includes('index.php')?'<a href="/card-search/details.php/card/60001">TEST</a>':html(candidate()));}});
  assert.equal(searched.registrationPass,true);assert.equal(searchCalls.length,2);
  const searchAgain=await run({...opts(search),fetcher:async()=>{throw Error('search replay must not fetch');}});assert.equal(searchAgain.registrationPass,true);

  // More than 5,000 explicit candidates, bounded work and a persisted cursor; no deck-name restriction.
  const many=fixture(Array.from({length:5001},(_,i)=>candidate(String(70000+i))));let manyCalls=0;
  const fetchMany=async url=>{manyCalls++;return response(html(candidate(url.match(/card\/(\d+)/)[1])));};
  const batch=await run({...opts(many),batchSize:2,fetcher:fetchMany});
  assert.equal(manyCalls,2);assert.equal(batch.registrationPass,false);assert.equal(batch.safeToPersist,true);assert.equal(batch.nextCursor,2);assert.equal(batch.remaining,4999);
  const next=await run({...opts(many),batchSize:2,fetcher:fetchMany});assert.equal(next.startCursor,2);assert.equal(next.nextCursor,4);assert.equal(manyCalls,4);
  const diverged=fixture([candidate()]),divergedRemote=gitFixture(diverged);
  await run({...opts(diverged),fetcher:async()=>response(html(candidate()))});
  const other=fs.mkdtempSync(path.join(os.tmpdir(),'pokeca-other-writer-'));fixtures.push(other);
  git(other,'clone','-q','-b',branch,divergedRemote,'.');git(other,'config','user.email','other@example.invalid');git(other,'config','user.name','Other Writer');
  git(other,'commit','--allow-empty','-qm','concurrent update');git(other,'push','-q','origin',branch);
  const remoteHead=git(divergedRemote,'rev-parse','refs/heads/'+branch);
  assert.throws(()=>persist({root:diverged}),/git push/);
  assert.equal(git(divergedRemote,'rev-parse','refs/heads/'+branch),remoteHead,'publication never force-overwrites concurrent GitHub updates');
  const locked=fixture();fs.mkdirSync(path.join(locked,'data/image-automation'),{recursive:true});fs.mkdirSync(path.join(locked,'data/image-automation/.lock'));
  await assert.rejects(run({...opts(locked),fetcher:fetchMany}),/LOCKED/);
  console.log('PASS failure safety: quarantine, 429 circuit, ID/print conflict, disk failure recovery, tamper replay, search evidence, 5001-candidate bounded resume, exclusive writer');
 }finally{for(const folder of fixtures)fs.rmSync(folder,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
