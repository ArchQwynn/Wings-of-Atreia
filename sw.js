const CACHE_VERSION="woa-pwa-20261120-2139";
const RUNTIME_CACHE="woa-runtime-20261120-2139";
const CORE=["index.html","offline.html","manifest.webmanifest","assets/css/style-v20260914-6.css","assets/js/search-v20260914-6.js","assets/js/search-index.json","assets/icons/icon-192.png","assets/icons/icon-512.png","about.html","companion/index.html","companion/assets/companion-v20260916-1.css","companion/assets/companion-v20260916-1.js","changelog.html","start-here.html","rules/index.html","rules/status.html","world/index.html","vtt-prototype/index.html","vtt-prototype/style.css","vtt-prototype/app.js","classes/browser.html","classes/class-data/aethertech.html","classes/class-data/assassin.html","classes/class-data/chanter.html","classes/class-data/cleric.html","classes/class-data/gladiator.html","classes/class-data/gunslinger.html","classes/class-data/ranger.html","classes/class-data/songweaver.html","classes/class-data/sorcerer.html","classes/class-data/spiritmaster.html","classes/class-data/templar.html"];
let PRECACHE=[];
function scopedUrl(path){return new URL(path,self.registration.scope).href;}
async function cachedMatch(request){return caches.match(request,{ignoreSearch:true});}
function normalizePath(path){if(!path)return "index.html";try{const u=new URL(path,self.registration.scope);let rel=u.pathname.replace(new URL(self.registration.scope).pathname,"").replace(/^\//,"");if(!rel)rel="index.html";if(rel.endsWith("/"))rel+="index.html";return rel;}catch(_){return String(path).replace(/^\.\//,"").replace(/^\//,"");}}
const RETIRED_OFFLINE_PATHS=new Set(["classes/placeholder.html","classes/how-to-play/aethertech.html","classes/how-to-play/assassin.html","classes/how-to-play/chanter.html","classes/how-to-play/cleric.html","classes/how-to-play/gladiator.html","classes/how-to-play/gunslinger.html","classes/how-to-play/ranger.html","classes/how-to-play/songweaver.html","classes/how-to-play/sorcerer.html","classes/how-to-play/spiritmaster.html","classes/how-to-play/templar.html","rules/downloads.html","rules/beginner-guide.html"]);\nasync function buildPrecache(){const paths=new Set(CORE);try{const res=await fetch(scopedUrl("assets/js/search-index.json"),{cache:"reload"});if(res.ok){const data=await res.json();for(const item of Array.isArray(data)?data:[]){if(item&&item.url){const path=normalizePath(item.url);if(!RETIRED_OFFLINE_PATHS.has(path))paths.add(path);}}}}catch(_){ }PRECACHE=[...paths].filter(path=>!RETIRED_OFFLINE_PATHS.has(normalizePath(path)));}
async function networkFirst(request,navigation=false){const runtime=await caches.open(RUNTIME_CACHE);try{const res=await fetch(request,{cache:"reload"});if(res.ok)await runtime.put(request,res.clone());return res;}catch(_){const exact=await cachedMatch(request);if(exact)return exact;if(navigation){const u=new URL(request.url);let rel=u.pathname.replace(new URL(self.registration.scope).pathname,"").replace(/^\//,"");if(!rel)rel="index.html";if(rel.endsWith("/"))rel+="index.html";const normalized=await cachedMatch(scopedUrl(rel));if(normalized)return normalized;}return undefined;}}
async function cacheFirst(request){const cached=await cachedMatch(request);if(cached)return cached;try{const res=await fetch(request);if(res.ok){const runtime=await caches.open(RUNTIME_CACHE);await runtime.put(request,res.clone());}return res;}catch(_){return cached;}}
self.addEventListener("install",event=>event.waitUntil((async()=>{await buildPrecache();const cache=await caches.open(CACHE_VERSION);for(const path of PRECACHE){const req=new Request(scopedUrl(path),{cache:"reload"});const res=await fetch(req);if(!res.ok)throw new Error(`WoA offline precache failed for ${path}`);await cache.put(req,res.clone());}await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith("woa-")&&!([CACHE_VERSION,RUNTIME_CACHE].includes(n))).map(n=>caches.delete(n)));await self.clients.claim();})()));
self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;const html=request.mode==="navigate"||(request.headers.get("accept")||"").includes("text/html");if(html){event.respondWith((async()=>{const res=await networkFirst(request,true);return res||(await cachedMatch(scopedUrl("offline.html")))||Response.error();})());return;}if(request.destination==="image"||request.destination==="font"){event.respondWith(cacheFirst(request));return;}/* Also handle fetch() requests with an empty destination, such as the Class Browser class-data HTML fragments. */event.respondWith(networkFirst(request));});
self.addEventListener("message",event=>{
  if(!event.data)return;
  const type=event.data.type;
  if(type==="WOA_FORCE_REFRESH"){
    event.waitUntil((async()=>{
      const names=await caches.keys();
      await Promise.all(names.filter(n=>n.startsWith("woa-")).map(n=>caches.delete(n)));
      await self.skipWaiting();
    })());
    return;
  }
  if(type==="WOA_CACHE_STATUS"){
    event.waitUntil((async()=>{
      await buildPrecache();
      let cached=0;
      try{
        const cache=await caches.open(CACHE_VERSION);
        const keys=await cache.keys();
        const expected=new Set(PRECACHE.map(scopedUrl));
        cached=keys.reduce((n,r)=>n+(expected.has(r.url)?1:0),0);
      }catch(_){}
      const payload={type:"WOA_CACHE_STATUS",ready:cached===PRECACHE.length&&PRECACHE.length>0,cached,total:PRECACHE.length,version:CACHE_VERSION,updated:"15 Nov 2026"};
      if(event.ports&&event.ports[0])event.ports[0].postMessage(payload);
      else if(event.source)event.source.postMessage(payload);
    })());
    return;
  }
  if(type==="WOA_DOWNLOAD_OFFLINE"){
    event.waitUntil((async()=>{
      const port=event.ports&&event.ports[0];
      const send=data=>{if(port)port.postMessage(data);};
      try{
        await buildPrecache();
        if(!PRECACHE.length)throw new Error("The offline file list is empty.");
        const cache=await caches.open(CACHE_VERSION);
        if(event.data.force)await cache.keys().then(keys=>Promise.all(keys.map(key=>cache.delete(key))));
        let completed=0;
        send({type:"WOA_DOWNLOAD_PROGRESS",cached:0,total:PRECACHE.length,message:event.data.force?"Starting full offline download…":"Checking and downloading offline files…"});
        for(const path of PRECACHE){
          const request=new Request(scopedUrl(path),{cache:"reload"});
          const cachedResponse=await cache.match(request);
          let unchanged=false;
          if(!event.data.force&&cachedResponse){
            try{
              const head=await fetch(new Request(scopedUrl(path),{method:"HEAD",cache:"no-store"}));
              if(head.ok){
                const oldTag=cachedResponse.headers.get("ETag");
                const newTag=head.headers.get("ETag");
                const oldModified=cachedResponse.headers.get("Last-Modified");
                const newModified=head.headers.get("Last-Modified");
                const oldLength=cachedResponse.headers.get("Content-Length");
                const newLength=head.headers.get("Content-Length");
                unchanged=Boolean((oldTag&&newTag&&oldTag===newTag)||(oldModified&&newModified&&oldModified===newModified&&(!oldLength||!newLength||oldLength===newLength)));
              }
            }catch(_){}
          }
          if(!unchanged){
            const response=await fetch(request);
            if(!response.ok)throw new Error("Could not download "+path+" (HTTP "+response.status+").");
            await cache.put(request,response.clone());
          }
          completed++;
          send({type:"WOA_DOWNLOAD_PROGRESS",cached:completed,total:PRECACHE.length,message:(unchanged?"Verified ":"Downloaded ")+path});
        }
        const keys=await cache.keys();
        const expected=new Set(PRECACHE.map(scopedUrl));
        const verified=keys.reduce((n,r)=>n+(expected.has(r.url)?1:0),0);
        const status={ready:verified===PRECACHE.length&&PRECACHE.length>0,cached:verified,total:PRECACHE.length,version:CACHE_VERSION,updated:"15 Nov 2026"};
        if(!status.ready)throw new Error("Only "+verified+" of "+PRECACHE.length+" required files could be verified in the offline cache.");
        send({type:"WOA_DOWNLOAD_COMPLETE",status});
      }catch(error){
        send({type:"WOA_DOWNLOAD_ERROR",message:error&&error.message?error.message:"Offline download failed."});
      }
    })());
  }
});
