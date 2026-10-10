// DOUBLE QR cache 440feda4a70e; contains app assets only, never keys or messages.
const CACHE='double-qr-pwa-440feda4a70e';
const ASSETS=["./DOUBLE-QR-v0.4-diagnostic.zip","./RESEARCH.md","./THIRD_PARTY_NOTICES.txt","./app.js","./icon.svg","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./index.html","./manifest.webmanifest","./style.css","./vendor/zxing_reader.wasm"];
const assetURLs=new Set(ASSETS.map(x=>new URL(x,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const asset of ASSETS){const url=new URL(asset,self.registration.scope);const response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));if(!response.ok||response.redirected)throw Error('Offline asset unavailable: '+asset);await cache.put(url,response);}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('double-qr-pwa-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 const base=new URL(self.registration.scope);const isAppNavigation=request.mode==='navigate'&&(url.pathname===base.pathname||url.pathname===base.pathname+'index.html');
 if(isAppNavigation){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(new URL('./index.html',base))||fetch(request);})());return;}
 const canonical=new URL(url.pathname,url.origin).href;if(!assetURLs.has(canonical))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(canonical)||fetch(request);})());
});
