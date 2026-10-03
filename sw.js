const CACHE_VERSION = "woa-pwa-20261004-01";
const RUNTIME_CACHE = "woa-runtime-20261004-01";
const PRECACHE = [
  "index.html", "offline.html", "manifest.webmanifest",
  "assets/css/style-v20260914-6.css", "assets/js/search-v20260914-6.js", "assets/js/search-index.json",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png", "about.html", "companion/index.html",
  "companion/assets/companion-v20260916-1.css", "companion/assets/companion-v20260916-1.js", "changelog.html",
  "classes/aethertech.html", "classes/assassin.html", "classes/chanter.html", "classes/cleric.html", "classes/gladiator.html", "classes/gunslinger.html", "classes/index.html", "classes/ranger.html", "classes/songweaver.html", "classes/sorcerer.html", "classes/spiritmaster.html", "classes/templar.html",
  "rules/advancement.html", "rules/aether-spellcasting.html", "rules/backgrounds.html", "rules/beginner-guide.html", "rules/character-creation.html", "rules/combat.html", "rules/compendium.html", "rules/core-resolution.html", "rules/daeva-points-ultimates.html", "rules/downloads.html", "rules/equipment.html", "rules/exploration.html", "rules/faq.html", "rules/feats-boons.html", "rules/flight.html", "rules/glossary.html", "rules/index.html", "rules/legions-warfronts.html", "rules/professions-economy.html", "rules/quick-reference.html", "rules/status.html",
  "spells/index.html", "start-here.html", "world/factions.html", "world/gazetteer.html", "world/history.html", "world/index.html"
];

function scopedUrl(path){return new URL(path,self.registration.scope).href;}
async function cachedMatch(request){return caches.match(request,{ignoreSearch:true});}
function normalizedNavigationUrl(request){const u=new URL(request.url), scope=new URL(self.registration.scope).pathname;let rel=u.pathname.startsWith(scope)?u.pathname.slice(scope.length):u.pathname.replace(/^\//,"");if(!rel)rel="index.html";else if(rel.endsWith("/"))rel+="index.html";return scopedUrl(rel);}

self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE_VERSION);for(const path of PRECACHE){const req=new Request(scopedUrl(path),{cache:"reload"});const res=await fetch(req);if(!res.ok)throw new Error(`WoA offline precache failed for ${path}`);await cache.put(req,res.clone());}await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith("woa-")&&!([CACHE_VERSION,RUNTIME_CACHE].includes(n))).map(n=>caches.delete(n)));await self.clients.claim();})()));

async function networkFirst(request,navigation=false){const runtime=await caches.open(RUNTIME_CACHE);try{const res=await fetch(request);if(res.ok)await runtime.put(request,res.clone());return res;}catch(_){const exact=await cachedMatch(request);if(exact)return exact;if(navigation){const normalized=await cachedMatch(normalizedNavigationUrl(request));if(normalized)return normalized;}return undefined;}}
async function cacheFirst(request){const cached=await cachedMatch(request);if(cached)return cached;try{const res=await fetch(request);if(res.ok){const runtime=await caches.open(RUNTIME_CACHE);await runtime.put(request,res.clone());}return res;}catch(_){return cached;}}

self.addEventListener("fetch",event=>{const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);if(url.origin!==self.location.origin)return;const html=request.mode==="navigate"||(request.headers.get("accept")||"").includes("text/html");if(html){event.respondWith((async()=>{const res=await networkFirst(request,true);return res||(await cachedMatch(scopedUrl("offline.html")))||Response.error();})());return;}if(request.destination==="script"||request.destination==="style"){event.respondWith(networkFirst(request));return;}if(request.destination==="image"||request.destination==="font"){event.respondWith(cacheFirst(request));}});

self.addEventListener("message",event=>{if(!event.data)return;if(event.data.type==="WOA_FORCE_REFRESH"){event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith("woa-")).map(n=>caches.delete(n)));await self.skipWaiting();})());return;}if(event.data.type!=="WOA_CACHE_STATUS")return;event.waitUntil((async()=>{let cached=0;try{const cache=await caches.open(CACHE_VERSION);const keys=await cache.keys();const expected=new Set(PRECACHE.map(scopedUrl));cached=keys.reduce((n,r)=>n+(expected.has(r.url)?1:0),0);}catch(_){}const payload={type:"WOA_CACHE_STATUS",ready:cached===PRECACHE.length,cached,total:PRECACHE.length,version:CACHE_VERSION,updated:"4 Oct 2026"};if(event.ports&&event.ports[0])event.ports[0].postMessage(payload);else if(event.source)event.source.postMessage(payload);})());});
