const CACHE='k9-academy-v161-ui2';
const CORE=['./','./index.html','./manifest.json','./icons/app-icon-192.png','./icons/app-icon-512.png'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.pathname.endsWith('/supabase-config.json')){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }
  const asset=url.pathname.endsWith('/manifest.json')||url.pathname.endsWith('/icons/app-icon-192.png')||url.pathname.endsWith('/icons/app-icon-512.png');
  if(asset){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(request,copy));return response})
        .catch(()=>caches.match(request))
    );
    return;
  }
  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
  }
});

// Release 1.61 fix operazioni utenti 2

// Release 1.61 navigazione pratica
