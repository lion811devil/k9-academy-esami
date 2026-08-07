const STATIC_CACHE='k9-static-v1';
const BRANDING_CACHE='k9-branding-v1';
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(STATIC_CACHE).then(c=>c.addAll(['./','./index.html','./manifest.json'])).catch(()=>{}))});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.pathname.endsWith('/icons/app-icon-192.png')||url.pathname.endsWith('/icons/app-icon-512.png')){
   event.respondWith(caches.open(BRANDING_CACHE).then(c=>c.match(event.request)).then(r=>r||fetch(event.request)).catch(()=>fetch(event.request)));
   return;
 }
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')))}
});
