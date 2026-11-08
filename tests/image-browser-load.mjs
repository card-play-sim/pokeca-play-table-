import fs from 'node:fs';
import { chromium } from 'playwright';
const registry=JSON.parse(fs.readFileSync('data/official-image-registry.json','utf8'));
const cards=registry.cards;
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.goto('about:blank');
  const results=await page.evaluate(async items=>{
    const output=[];
    for(let i=0;i<items.length;i+=5){
      const batch=items.slice(i,i+5);
      const measured=await Promise.all(batch.map(card=>new Promise(resolve=>{
        const img=new Image();
        let settled=false;
        const finish=(status,width=0)=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          resolve({id:card.officialCardId,status,width});
        };
        const timer=setTimeout(()=>finish('timeout'),12000);
        img.onload=()=>finish(img.naturalWidth>0?'loaded':'empty',img.naturalWidth);
        img.onerror=()=>finish('error');
        img.src=card.imageSourceUrl;
      })));
      output.push(...measured);
    }
    return output;
  },cards);
  const failures=results.filter(r=>r.status!=='loaded');
  console.log(JSON.stringify({tested:results.length,loaded:results.length-failures.length,failed:failures.length,results},null,2));
  if(failures.length)process.exitCode=1;
} finally {
  await browser.close();
}
