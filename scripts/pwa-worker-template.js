const absolute=url=>new URL(url,self.registration.scope).href;
const release=new Map(Object.keys(FILES).map(url=>[absolute(url),url]));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // Fetch and verify everything before modifying the release cache. A stale CDN
 // response leaves the previous worker active, with its complete working shell.
 const responses=[];
 for(const [url,hash] of Object.entries(FILES)){
  const response=await fetch(absolute(url),{cache:'reload'});
  if(!response.ok)throw Error('PWA_RELEASE_HTTP:'+url);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==hash)throw Error('PWA_RELEASE_HASH:'+url);
  responses.push([url,response]);
 }
 const cache=await caches.open(CACHE);
 for(const [url,response]of responses)await cache.put(absolute(url),response);
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await self.clients.claim();
 // Only this app's obsolete shell caches; never IndexedDB/localStorage or other apps.
 for(const key of await caches.keys())if(key.startsWith('pokeca-first-playable-v')&&key!==CACHE)await caches.delete(key);
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='RELEASE_INFO')event.ports[0]?.postMessage({build:BUILD,cacheName:CACHE,files:FILES});
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 const isShell=event.request.mode==='navigate'&&(url.pathname===new URL('./',self.registration.scope).pathname||url.pathname===new URL('./index.html',self.registration.scope).pathname);
 const key=isShell?absolute('./index.html'):event.request.url;
 if(!isShell&&!release.has(key))return;
 event.respondWith((async()=>{
  const response=await (await caches.open(CACHE)).match(key);
  // Never write arbitrary network responses over the verified release.
  return response||new Response('Verified app release unavailable; reconnect to update.',{status:503});
 })());
});
