import fs from 'node:fs';
import { chromium } from 'playwright';
const registry=JSON.parse(fs.readFileSync(process.env.IMAGE_REGISTRY_PATH||'data/official-image-registry.json','utf8'));
const cards=registry.cards;
const publishedUrl=process.env.POKECA_TEST_URL;
const expectedBuild=fs.readFileSync('index.html','utf8').match(/name="pokeca-build" content="(\d+)"/)?.[1];
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:393,height:851},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(publishedUrl||'about:blank',{waitUntil:'domcontentloaded'});
  let galleryPages=0;
  const gallery=[];
  if(publishedUrl){
    await page.waitForFunction(build=>document.querySelector('meta[name="pokeca-build"]')?.content===build&&window.PokecaImageRegistryStatus?.state==='ready',expectedBuild);
    await page.locator('#menu-open').click();
    await page.getByRole('button',{name:'公式カード画像一覧',exact:true}).click();
    const additions=cards.filter(card=>card.namePreviewEligible===false);
    for(const card of [additions[0],additions.at(-1)].filter(Boolean)){
      await page.locator('#official-image-query').fill(card.officialCardId);
      const img=page.locator(`[data-official-card-id="${card.officialCardId}"] img[data-image-mode]`);
      const loaded=await img.evaluate(async (node,url)=>{
        try{await node.decode();}catch{return false;}
        return !node.hidden&&node.currentSrc===url&&node.naturalWidth>0&&node.getBoundingClientRect().width>0;
      },card.imageSourceUrl);
      await page.locator('#official-image-query').fill(card.name);
      const nameResults=page.locator('#official-image-results [data-official-card-id]');
      const expectedNameIds=new Set(cards.filter(row=>row.name.includes(card.name)).map(row=>row.officialCardId));
      const seenNameIds=new Set();
      const nextNamePage=page.getByRole('button',{name:'次のページ',exact:true});
      let validNameResults=true;
      for(let pageNumber=0;pageNumber<Math.ceil(expectedNameIds.size/24);pageNumber++){
        const ids=await nameResults.evaluateAll(nodes=>nodes.map(node=>node.dataset.officialCardId));
        for(const id of ids){
          if(!expectedNameIds.has(id)||seenNameIds.has(id))validNameResults=false;
          seenNameIds.add(id);
        }
        if(!await nextNamePage.isEnabled())break;
        if(seenNameIds.size>=expectedNameIds.size){
          validNameResults=false;
          break;
        }
        await nextNamePage.click();
      }
      const nameSearch=validNameResults&&seenNameIds.size===expectedNameIds.size&&seenNameIds.has(card.officialCardId);
      gallery.push({officialCardId:card.officialCardId,loaded,nameSearch});
    }
    await page.locator('#official-image-query').fill('');
  }
  const results=[];
  fs.mkdirSync('artifacts',{recursive:true});
  function saveReport(){
    const loaded=results.filter(result=>result.status==='loaded').length;
    const report={publishedUrl:publishedUrl||null,expectedBuild,tested:results.length,expected:cards.length,loaded,
      failed:results.length-loaded,untested:cards.length-results.length,gallery,galleryPages,javascriptErrors:errors,results};
    fs.writeFileSync(process.env.IMAGE_BROWSER_REPORT_PATH||'artifacts/image-browser-load-report.json',JSON.stringify(report,null,2)+'\n');
    return report;
  }
  if(publishedUrl){
    const expected=new Map(cards.map(card=>[card.officialCardId,card.imageSourceUrl]));
    const seen=new Set();
    const next=page.getByRole('button',{name:'次のページ',exact:true});
    const grid=page.locator('#official-image-results [data-official-card-id]');
    await grid.first().waitFor({state:'visible'});
    do{
      const rows=await grid.evaluateAll(async nodes=>Promise.all(nodes.map(async node=>{
        const id=node.dataset.officialCardId;
        const img=node.querySelector('img[data-image-mode]');
        if(!img)return {id,status:'missing-official-element'};
        let timer;
        try{
          const decoded=await Promise.race([
            img.decode().then(()=>true,()=>false),
            new Promise(resolve=>{timer=setTimeout(()=>resolve(null),20000);})
          ]);
          const loaded=decoded&&!img.hidden&&img.naturalWidth>0&&img.naturalHeight>0&&img.getBoundingClientRect().width>0;
          return {id,source:img.currentSrc,status:loaded?'loaded':decoded===null?'timeout':'image-load-error',width:img.naturalWidth};
        }finally{clearTimeout(timer);}
      })));
      if(!rows.length)throw Error('EMPTY_GALLERY_PAGE');
      for(const row of rows){
        const {id,source,...result}=row;
        if(!expected.has(id)||seen.has(id))throw Error('UNEXPECTED_GALLERY_ID '+id);
        if(result.status==='loaded'&&source!==expected.get(id))result.status='wrong-image-url';
        seen.add(id);
        results.push({id,...result});
      }
      galleryPages++;
      saveReport();
      if(!await next.isEnabled())break;
      if(seen.size>=cards.length)throw Error('UNEXPECTED_GALLERY_CONTINUATION');
      await next.click();
    }while(true);
  }else{
    for(let offset=0;offset<cards.length;offset+=8){
      const items=cards.slice(offset,offset+8);
      const measured=await page.evaluate(async items=>Promise.all(items.map(card=>new Promise(resolve=>{
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
        img.src=card.imageSourceUrl;
      }))),items);
      results.push(...measured);
      if(results.length%48===0)saveReport();
    }
  }
  const failures=results.filter(r=>r.status!=='loaded');
  const {results:individual,...summary}=saveReport();
  console.log(JSON.stringify({...summary,failures}));
  if(summary.untested||failures.length||errors.length||gallery.some(row=>!row.loaded||!row.nameSearch))process.exitCode=1;
} finally {
  await browser.close();
}
