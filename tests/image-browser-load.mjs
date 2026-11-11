import fs from 'node:fs';
import { chromium } from 'playwright';
const registry=JSON.parse(fs.readFileSync('data/official-image-registry.json','utf8'));
const cards=registry.cards;
const publishedUrl=process.env.POKECA_TEST_URL;
const expectedBuild=fs.readFileSync('index.html','utf8').match(/name="pokeca-build" content="(\d+)"/)?.[1];
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(publishedUrl||'about:blank',{waitUntil:'domcontentloaded'});
  const gallery=[];
  if(publishedUrl){
    await page.waitForFunction(build=>document.querySelector('meta[name="pokeca-build"]')?.content===build&&window.PokecaImageRegistryStatus?.state==='ready',expectedBuild);
    await page.locator('#menu-open').click();
    await page.getByRole('button',{name:'公式カード画像一覧',exact:true}).click();
    const additions=cards.filter(card=>card.namePreviewEligible===false);
    for(const card of [additions[0],additions.at(-1)].filter(Boolean)){
      await page.locator('#official-image-query').fill(card.officialCardId);
      const img=page.locator(`[data-official-card-id="${card.officialCardId}"] img:not([hidden])`);
      const loaded=await img.evaluate(async (node,url)=>{
        try{await node.decode();}catch{return false;}
        return node.currentSrc===url&&node.naturalWidth>0&&node.naturalHeight>0&&node.getBoundingClientRect().width>0;
      },card.imageSourceUrl);
      gallery.push({officialCardId:card.officialCardId,loaded});
    }
    await page.locator('#sheet-close').click();
  }
  const results=[];
  fs.mkdirSync('artifacts',{recursive:true});
  function saveReport(){
    const loaded=results.filter(result=>result.status==='loaded').length;
    const report={publishedUrl:publishedUrl||null,expectedBuild,tested:results.length,expected:cards.length,loaded,
      failed:results.length-loaded,untested:cards.length-results.length,gallery,javascriptErrors:errors,results};
    fs.writeFileSync('artifacts/image-browser-load-report.json',JSON.stringify(report,null,2)+'\n');
    return report;
  }
  for(let offset=0;offset<cards.length;offset+=8){
    const items=cards.slice(offset,offset+8);
    const measured=await page.evaluate(async ({items,throughApp})=>Promise.all(items.map(card=>new Promise(resolve=>{
      const url=throughApp?window.PokecaImageResolver.resolve(card):card.imageSourceUrl;
      if(url!==card.imageSourceUrl){resolve({id:card.officialCardId,status:'resolver-mismatch'});return;}
      const img=new Image();
      const finish=(status,width=0)=>{
        clearTimeout(timer);
        img.onload=null;
        img.onerror=null;
        if(status==='timeout')img.removeAttribute('src');
        resolve({id:card.officialCardId,status,width});
      };
      const timer=setTimeout(()=>finish('timeout'),15000);
      img.onload=()=>finish(img.naturalWidth>0&&img.naturalHeight>0?'loaded':'empty',img.naturalWidth);
      img.onerror=()=>finish('image-load-error');
      img.src=url;
    }))),{items,throughApp:!!publishedUrl});
    results.push(...measured);
    if(results.length%48===0)saveReport();
  }
  const failures=results.filter(r=>r.status!=='loaded');
  const {results:individual,...summary}=saveReport();
  console.log(JSON.stringify({...summary,failures}));
  if(failures.length||errors.length||gallery.some(row=>!row.loaded))process.exitCode=1;
} finally {
  await browser.close();
}
