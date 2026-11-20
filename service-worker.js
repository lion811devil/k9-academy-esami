const PREFIX='k9-academy-';
const CACHE=PREFIX+'v2211-bank-mobile-20261120';
const CORE=['./','./index.html','./manifest.json','./assets/css/app.css','./assets/js/app.js','./icons/app-icon-192.png','./icons/app-icon-512.png'];
const scope=new URL(self.registration.scope);
const urls=new Set(CORE.map(path=>new URL(path,scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 if(url.pathname===new URL('./supabase-config.json',scope).pathname){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 const canonical=new URL(url.pathname,scope.origin).href;
 if(!urls.has(canonical))return;
 const isEntry=canonical===new URL('./',scope).href||canonical===new URL('./index.html',scope).href;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{const response=await fetch(request,{cache:'no-store'});if(response.ok&&!response.redirected)await cache.put(canonical,response.clone());return response;}
   catch(error){const saved=await cache.match(canonical);if(saved)return saved;if(isEntry)return new Response('Connessione non disponibile. Riprova online.',{status:503});throw error;}
 })());
});
