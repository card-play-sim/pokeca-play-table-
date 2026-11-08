import fs from 'node:fs';
import { chromium } from 'playwright';
const registry=JSON.parse(fs.readFileSync('data/official-image-registry.json','utf8'));
const sample=registry.cards.slice(0,5);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.goto('about:blank');
 const results=await page.evaluate(async cards=>Promise.all(cards.map(c=>new Promise(resolve=>{
   const img=new Image();
   const timer=setTimeout(()=>resolve({id:c.officialCardId,status:'timeout'}),12000);
   img.onload=()=>{clearTimeout(timer);resolve({id:c.officialCardId,status:img.naturalWidth>0?'loaded':'empty',width:img.naturalWidth});};
   img.onerror=()=>{clearTimeout(timer);resolve({id:c.officialCardId,status:'error'});};
   img.src=c.imageSourceUrl;
 }))),sample);
 console.log(JSON.stringify({tested:sample.length,results},null,2));
 if(results.some(r=>r.status!=='loaded'))process.exitCode=1;
}finally{await browser.close();}
