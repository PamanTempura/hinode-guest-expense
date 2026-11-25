const BASE = new URL(self.registration.scope);
const PREFIX = 'hinode-pages:' + BASE.pathname + ':';
const CACHE = PREFIX + '3051b64bc7a49b91';
const url = p => new URL(p, BASE).href;
const FILES = ["./", "index.html", "static/app.js", "static/icon-192.png", "static/icon-512.png", "static/manifest.json", "static/style.css", "static/vendor/assets.json", "static/vendor/exceljs.js", "static/vendor/ind.traineddata.gz", "static/vendor/jspdf.js", "static/vendor/jszip.js", "static/vendor/tesseract-core-lstm.wasm", "static/vendor/tesseract-core-lstm.wasm.js", "static/vendor/tesseract-core-simd-lstm.wasm", "static/vendor/tesseract-core-simd-lstm.wasm.js", "static/vendor/tesseract-core-simd.wasm", "static/vendor/tesseract-core-simd.wasm.js", "static/vendor/tesseract-core.wasm", "static/vendor/tesseract-core.wasm.js", "static/vendor/tesseract.js", "static/vendor/worker.min.js"];
self.addEventListener('install', e => e.waitUntil((async()=>{
  const c = await caches.open(CACHE);
  try { await c.addAll(FILES.map(p=>new Request(url(p),{cache:'reload'}))); }
  catch(err){ await caches.delete(CACHE); throw err; }
  await self.skipWaiting();
})()));
self.addEventListener('activate', e=>e.waitUntil((async()=>{
  for(const k of await caches.keys()) if(k.startsWith(PREFIX)&&k!==CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==BASE.origin||!u.pathname.startsWith(BASE.pathname))return;
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const hit=await c.match(e.request,{ignoreSearch:true});if(hit)return hit;
    try{return await fetch(e.request);}catch(err){if(e.request.mode==='navigate'){const home=await c.match(url('index.html'));if(home)return home;}throw err;}
  })());
});
