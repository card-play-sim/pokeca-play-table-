'use strict';
// Convert Node TAP failure logs into stable, fail-closed grouped tasks.
// Logs alone are not official card evidence: every generated task stays BLOCKED.
const fs=require('node:fs'),path=require('node:path');
const [logFile,outFile,testPath='tests/reference-effects.test.cjs']=process.argv.slice(2);
if(!logFile||!outFile||!/^tests\/[\w./-]+\.test\.cjs$/.test(testPath)||testPath.includes('..'))throw Error('USAGE: node scripts/parse-effect-regression-log.cjs log.txt failures.json [tests/test.test.cjs]');
const log=fs.readFileSync(logFile,'utf8');
const failures=[];
const lines=log.split(/\r?\n/);
for(let i=0;i<lines.length;i++){
 const m=lines[i].match(/^\s*not ok\s+\d+\s+-\s+(.+)$/)||lines[i].match(/^FAIL reference\s+(.+)$/);
 if(!m)continue;
 const title=m[1].trim();
 const normalized=title.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70)||'UNKNOWN';
 const causeId='REGRESSION_'+normalized;
 failures.push({causeId,command:'UNCLASSIFIED',category:'unknown',test:testPath,description:title,logLine:i+1});
}
const result={schemaVersion:1,sourceLog:path.basename(logFile),failures,requiresOfficialEvidence:true};
fs.mkdirSync(path.dirname(path.resolve(outFile)),{recursive:true});
const tmp=outFile+'.tmp-'+process.pid;
try{fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,outFile);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
console.log(JSON.stringify({failures:failures.length,requiresOfficialEvidence:true}));
