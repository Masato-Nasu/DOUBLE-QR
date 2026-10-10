import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {build} from 'esbuild';
fs.mkdirSync('dist/vendor',{recursive:true});
fs.copyFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm','dist/vendor/zxing_reader.wasm');
await build({entryPoints:['src/app.js'],outfile:'dist/app.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof'});
const root='dist';function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const paths=files(root).filter(p=>!p.endsWith('/sw.js')&&!p.endsWith('/_headers')).sort(),hash=createHash('sha256');for(const p of paths)hash.update(fs.readFileSync(p));const version=hash.digest('hex').slice(0,12);
const assets=paths.map(p=>'./'+path.relative(root,p).replaceAll('\\','/'));
fs.writeFileSync('dist/sw.js',`// DOUBLE QR cache ${version}; contains app assets only, never keys or messages.
const CACHE='double-qr-pwa-${version}';
const ASSETS=${JSON.stringify(assets)};
const assetURLs=new Set(ASSETS.map(x=>new URL(x,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const asset of ASSETS){const url=new URL(asset,self.registration.scope);const response=await fetch(new Request(url,{cache:'reload',credentials:'same-origin'}));if(!response.ok||response.redirected)throw Error('Offline asset unavailable: '+asset);await cache.put(url,response);}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('double-qr-pwa-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 const base=new URL(self.registration.scope);const isAppNavigation=request.mode==='navigate'&&(url.pathname===base.pathname||url.pathname===base.pathname+'index.html');
 if(isAppNavigation){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(new URL('./index.html',base))||fetch(request);})());return;}
 const canonical=new URL(url.pathname,url.origin).href;if(!assetURLs.has(canonical))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(canonical)||fetch(request);})());
});
`);
console.log(JSON.stringify({cacheVersion:version,assets:assets.length,bytes:paths.reduce((s,p)=>s+fs.statSync(p).size,0)}));
