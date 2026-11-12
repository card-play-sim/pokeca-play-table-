'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const file='.github/workflows/shared-effect-safe-autorepair.yml';
const yaml=fs.readFileSync(file,'utf8'),lines=yaml.split('\n');
assert.match(yaml,/\bon:\s*\n\s+push:/,'push trigger required');
assert.match(yaml,/\s+pull_request:/,'PR trigger required');
assert.match(yaml,/contents:\s*write/,'repair push permission required');
assert.match(yaml,/concurrency:/,'concurrency guard required');
assert.match(yaml,/cancel-in-progress:\s*false/,'no cancellation during push');
const blocks=[];
for(let i=0;i<lines.length;i++){
 if(lines[i].trim()!=='run: |')continue;
 const indent=lines[i].length-lines[i].trimStart().length;
 const body=[];
 for(let j=i+1;j<lines.length;j++){
  const line=lines[j],spaces=line.length-line.trimStart().length;
  if(line.trim()&&spaces<=indent)break;
  body.push(line.trim()?line.slice(indent+2):'');
 }
 const shell=body.join('\n');
 const result=spawnSync('bash',['-n'],{input:shell,encoding:'utf8'});
 assert.equal(result.status,0,'bash syntax at workflow line '+(i+1)+': '+result.stderr);
 blocks.push(shell);
}
assert(blocks.length>=3,'missing repair shell blocks');
const commit=blocks.find(s=>s.includes('AUTO_REPAIR_PUSH_SUCCESS'));
assert(commit,'missing push confirmation');
assert.match(commit,/for attempt in 0 1 2;/,'bounded retries required');
assert.doesNotMatch(commit,/--force|force-with-lease/,'force push forbidden');
const allow=commit.match(/allowed='([^']+)'/);
assert(allow,'missing allowlist');
const regex=new RegExp(allow[1]);
for(const p of ['ui/engine.bundle.js','data/reference-effects/plans.json'])assert(regex.test(p),'must allow '+p);
for(const p of ['sw.js','data/formal-1945.json','ui/engine.bundle.js.bak','data/reference-effects/plansXjson'])assert(!regex.test(p),'must reject '+p);
console.log('PASS shared-effect workflow: triggers, permissions, concurrency, bash -n x'+blocks.length+', allowlist, bounded retries');
