const CACHE='vocab-adventure-v12-16-60';
const ASSETS=['/','/index.html','/app.css','/app.js','/lib/learning-model.js','/lib/daily-practice.js','/lib/authored-policy.js','/lib/sentence-use-template.js','/lib/local-delivery.js','/lib/study-history.js','/lib/study-rounds.js','/manifest.webmanifest','/version.json','/icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
async function networkFirst(request,fallback){
 try{const r=await fetch(request,{cache:'no-store'});if(r&&r.ok){const c=await caches.open(CACHE);c.put(request,r.clone())}return r}
 catch{return (await caches.match(request))||(fallback?await caches.match(fallback):Response.error())}
}
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 const core=u.pathname==='/'||u.pathname==='/index.html'||u.pathname==='/app.js'||u.pathname==='/lib/learning-model.js'||u.pathname==='/lib/daily-practice.js'||u.pathname==='/lib/authored-policy.js'||u.pathname==='/lib/sentence-use-template.js'||u.pathname==='/lib/local-delivery.js'||u.pathname==='/lib/study-history.js'||u.pathname==='/lib/study-rounds.js'||u.pathname==='/app.css'||u.pathname==='/version.json'||e.request.mode==='navigate';
 if(core){e.respondWith(networkFirst(e.request,e.request.mode==='navigate'?'/index.html':undefined));return}
 e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(async r=>{if(r&&r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone())}return r})));
});
