const CACHE_VERSION = "woa-pwa-20260914-2";
const RUNTIME_CACHE = "woa-runtime-20260914-2";
const PRECACHE = [
  "index.html",
  "offline.html",
  "manifest.webmanifest",
  "assets/css/style.css",
  "assets/js/search.js",
  "assets/js/search-index.json",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "about.html",
  "classes/aethertech.html",
  "classes/assassin.html",
  "classes/chanter.html",
  "classes/cleric.html",
  "classes/gladiator.html",
  "classes/gunslinger.html",
  "classes/index.html",
  "classes/ranger.html",
  "classes/songweaver.html",
  "classes/sorcerer.html",
  "classes/spiritmaster.html",
  "classes/templar.html",
  "rules/advancement.html",
  "rules/aether-spellcasting.html",
  "rules/backgrounds.html",
  "rules/beginner-guide.html",
  "rules/character-creation.html",
  "rules/combat.html",
  "rules/compendium.html",
  "rules/core-resolution.html",
  "rules/daeva-points-ultimates.html",
  "rules/downloads.html",
  "rules/equipment.html",
  "rules/exploration.html",
  "rules/faq.html",
  "rules/feats-boons.html",
  "rules/flight.html",
  "rules/glossary.html",
  "rules/index.html",
  "rules/legions-warfronts.html",
  "rules/professions-economy.html",
  "rules/quick-reference.html",
  "rules/status.html",
  "spells/absolute-zero.html",
  "spells/abyssal-torrent.html",
  "spells/aegis-field.html",
  "spells/aegis-symphony.html",
  "spells/aether-dispel.html",
  "spells/aether-lock.html",
  "spells/aether-step.html",
  "spells/aetheric-refrain.html",
  "spells/anthem-of-renewal.html",
  "spells/arcane-barrier.html",
  "spells/battle-hymn.html",
  "spells/breaking-rhythm.html",
  "spells/burning-brand.html",
  "spells/cacophony.html",
  "spells/chain-lightning.html",
  "spells/chanter.html",
  "spells/chorus-of-mending.html",
  "spells/circle-of-purity.html",
  "spells/cleanse-affliction.html",
  "spells/cleansing-grace.html",
  "spells/cleric.html",
  "spells/conductors-dominion.html",
  "spells/consecrated-ground.html",
  "spells/counterpoint.html",
  "spells/crushing-dirge.html",
  "spells/curse-of-silence.html",
  "spells/cyclone-field.html",
  "spells/dirge-note.html",
  "spells/discordant-chorus.html",
  "spells/discordant-note.html",
  "spells/discordant-pulse.html",
  "spells/divine-bastion.html",
  "spells/divine-intervention.html",
  "spells/drowning-hex.html",
  "spells/earthen-shackles.html",
  "spells/echo-step.html",
  "spells/echoing-blow.html",
  "spells/elegy-of-withering.html",
  "spells/final-requiem.html",
  "spells/fire-wall.html",
  "spells/flame-bolt.html",
  "spells/flame-burst.html",
  "spells/fracturing-chorus.html",
  "spells/frost-lance.html",
  "spells/frozen-ground.html",
  "spells/fusion-veil.html",
  "spells/gale-burst.html",
  "spells/gale-sigil.html",
  "spells/grand-harmony.html",
  "spells/gravity-snare.html",
  "spells/greater-restoration-light.html",
  "spells/guarded-cadence.html",
  "spells/guardian-chant.html",
  "spells/guardian-halo.html",
  "spells/guarding-cadence.html",
  "spells/harmonic-barrier.html",
  "spells/harmonic-lift.html",
  "spells/harmonic-recovery.html",
  "spells/healing-light.html",
  "spells/heavenly-verdict.html",
  "spells/hex-of-frailty.html",
  "spells/ice-prison.html",
  "spells/index.html",
  "spells/inferno.html",
  "spells/judgment-beam.html",
  "spells/judgment-seal.html",
  "spells/maelstrom.html",
  "spells/marching-hymn.html",
  "spells/mending-note.html",
  "spells/miracle-of-life.html",
  "spells/mirror-fold.html",
  "spells/off-key-step.html",
  "spells/perfect-equation.html",
  "spells/perfect-harmony.html",
  "spells/prayer-of-resolve.html",
  "spells/protective-chorus.html",
  "spells/protective-link.html",
  "spells/purifying-spark.html",
  "spells/radiant-bolt.html",
  "spells/refrain-relay.html",
  "spells/resonant-shelter.html",
  "spells/resonant-strike.html",
  "spells/resonant-wave.html",
  "spells/restoring-wave.html",
  "spells/sacred-ward.html",
  "spells/sanctified-restoration.html",
  "spells/shared-aether-pulse.html",
  "spells/shielding-note.html",
  "spells/silencing-refrain.html",
  "spells/song-of-renewal.html",
  "spells/songweaver.html",
  "spells/soothing-verse.html",
  "spells/sorcerer.html",
  "spells/soul-rupture.html",
  "spells/spark-javelin.html",
  "spells/spatial-collapse.html",
  "spells/spirit-bolt.html",
  "spells/spirit-conflagration.html",
  "spells/spirit-erosion.html",
  "spells/spirit-flame.html",
  "spells/spirit-mend.html",
  "spells/spirit-tempest.html",
  "spells/spiritmaster.html",
  "spells/stone-mark.html",
  "spells/tempest-crown.html",
  "spells/thunder-cage.html",
  "spells/titanic-binding.html",
  "spells/twin-aether-burst.html",
  "spells/unbroken-chorus.html",
  "spells/vacuum-curse.html",
  "spells/water-sigil.html",
  "spells/wind-blade.html",
  "start-here.html",
  "world/factions.html",
  "world/gazetteer.html",
  "world/history.html",
  "world/index.html"
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function cachedMatch(requestOrUrl) {
  return caches.match(requestOrUrl, { ignoreSearch: true });
}

function normalizedNavigationUrl(request) {
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  let relative = url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length)
    : url.pathname.replace(/^\//, "");

  if (!relative) relative = "index.html";
  else if (relative.endsWith("/")) relative += "index.html";

  return scopedUrl(relative);
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // The offline bundle is all-or-nothing. A new service worker only installs
    // after every player-facing page and core asset has been downloaded.
    for (const path of PRECACHE) {
      const request = new Request(scopedUrl(path), { cache: "reload" });
      const response = await fetch(request);
      if (!response || !response.ok) {
        throw new Error(`WoA offline precache failed for ${path}`);
      }
      await cache.put(request, response.clone());
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith("woa-") && ![CACHE_VERSION, RUNTIME_CACHE].includes(name))
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request, { navigation = false } = {}) {
  const runtime = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) await runtime.put(request, response.clone());
    return response;
  } catch (_) {
    const exact = await cachedMatch(request);
    if (exact) return exact;

    if (navigation) {
      const normalized = await cachedMatch(normalizedNavigationUrl(request));
      if (normalized) return normalized;
    }

    return undefined;
  }
}

async function cacheFirst(request) {
  const cached = await cachedMatch(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const runtime = await caches.open(RUNTIME_CACHE);
      await runtime.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return cached;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const acceptsHtml = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
  const isFreshReference = url.pathname.endsWith("search-index.json") || url.pathname.endsWith("manifest.webmanifest");

  if (acceptsHtml) {
    event.respondWith((async () => {
      const response = await networkFirst(request, { navigation: true });
      if (response) return response;
      return (await cachedMatch(scopedUrl("offline.html"))) || Response.error();
    })());
    return;
  }

  // Reference data prefers the network when online, but its precached copy is
  // available immediately offline, including when a cache-busting query string
  // is present.
  if (isFreshReference) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
  }
});
