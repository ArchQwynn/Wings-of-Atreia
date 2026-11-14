async function loadSearchIndex() {
  const base = document.body.dataset.base || "";
  try {
    const res = await fetch(base + "assets/js/search-index.json?v=20260914-5", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Could not load search index:", e);
    return [];
  }
}

function normalize(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9+\-']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scoreItem(item, query) {
  const q = normalize(query);
  const terms = q.split(" ").filter(Boolean);
  if (!terms.length) return -1;

  const title = normalize(item.title);
  const desc = normalize(item.desc);
  const text = normalize(item.text || "");
  const haystack = `${title} ${desc} ${text}`;

  if (!terms.every(term => haystack.includes(term))) return -1;

  let score = 0;
  if (title === q) score += 120;
  if (title.startsWith(q)) score += 80;
  if (title.includes(q)) score += 60;
  if (desc.includes(q)) score += 32;
  if (text.includes(q)) score += 18;

  for (const term of terms) {
    if (title === term) score += 28;
    else if (title.startsWith(term)) score += 20;
    else if (title.includes(term)) score += 14;
    if (desc.includes(term)) score += 6;
    if (text.includes(term)) score += 2;
  }

  if (item.kind === "section") score += 4;
  if (item.kind === "landing") score += 2;
  return score;
}

function getCategory(item) {
  const url = (item.url || "").toLowerCase();
  if (url.includes("start-here")) return "New Player";
  if (url.startsWith("spells/") || url.includes("/spells/")) return "Spell";
  if (url.startsWith("classes/") || url.includes("/classes/")) return "Class";
  if (url.includes("rules/faq")) return "FAQ";
  if (url.includes("rules/glossary")) return "Glossary";
  if (url.includes("rules/compendium")) return "Rules Index";
  if (url.startsWith("rules/") || url.includes("/rules/")) return "Rule";
  if (url.includes("world/history")) return "Lore";
  if (url.startsWith("world/") || url.includes("/world/")) return "World";
  if (url.includes("about")) return "About";
  return "Reference";
}

function queryTerms(query) {
  return normalize(query).split(" ").filter(Boolean).sort((a, b) => b.length - a.length);
}

function highlight(value, query) {
  const safe = escapeHtml(value || "");
  const terms = queryTerms(query);
  if (!terms.length) return safe;

  // Highlight against the already-escaped display text, using case-insensitive literal matches.
  const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rx = new RegExp(`(${escapedTerms.join("|")})`, "gi");
  return safe.replace(rx, "<mark>$1</mark>");
}

function cleanText(value) {
  return (value || "").toString().replace(/\s+/g, " ").trim();
}

function makeExcerpt(item, query, maxLength = 190) {
  const terms = queryTerms(query);
  const desc = cleanText(item.desc);
  const text = cleanText(item.text);

  let source = desc || text || "Open this Wings of Atreia reference entry.";
  const normalizedSource = normalize(source);
  const descMatches = terms.some(term => normalizedSource.includes(term));

  // If the short description does not actually show why this result matched,
  // pull an excerpt from the indexed page/section text instead.
  if (!descMatches && text) source = text;

  if (source.length <= maxLength) return source;

  const lower = source.toLowerCase();
  let matchAt = -1;
  for (const term of terms) {
    const at = lower.indexOf(term.toLowerCase());
    if (at >= 0 && (matchAt < 0 || at < matchAt)) matchAt = at;
  }

  if (matchAt < 0) return `${source.slice(0, maxLength - 1).trim()}…`;

  const half = Math.floor(maxLength / 2);
  let start = Math.max(0, matchAt - half);
  let end = Math.min(source.length, start + maxLength);
  if (end === source.length) start = Math.max(0, end - maxLength);

  // Prefer word boundaries so excerpts do not begin/end in the middle of words.
  if (start > 0) {
    const space = source.indexOf(" ", start);
    if (space > start && space < start + 25) start = space + 1;
  }
  if (end < source.length) {
    const space = source.lastIndexOf(" ", end);
    if (space > start) end = space;
  }

  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.querySelector("[data-site-search]");
  if (!input) return;

  const searchBox = input.closest(".search-box");
  let results = document.querySelector("[data-search-results]");
  if (!results) {
    results = document.createElement("div");
    results.className = "search-results";
    results.setAttribute("data-search-results", "");
  }
  if (searchBox && results.parentElement !== searchBox) searchBox.appendChild(results);

  const index = await loadSearchIndex();
  const base = document.body.dataset.base || "";
  let activeIndex = -1;

  function closeResults() {
    results.classList.remove("active");
    results.innerHTML = "";
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function setActive(indexToSet) {
    const links = [...results.querySelectorAll("a.search-result")];
    if (!links.length) return;
    activeIndex = Math.max(0, Math.min(indexToSet, links.length - 1));
    links.forEach((link, i) => link.classList.toggle("is-active", i === activeIndex));
    links[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function render() {
    const rawQuery = input.value;
    const q = normalize(rawQuery);
    if (!q) {
      closeResults();
      return;
    }

    const allMatches = index
      .map(item => ({ item, score: scoreItem(item, q) }))
      .filter(result => result.score >= 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

    const matches = allMatches.slice(0, 10);

    if (matches.length) {
      const countLabel = allMatches.length > 10
        ? `Showing top 10 of ${allMatches.length} matches`
        : `${allMatches.length} match${allMatches.length === 1 ? "" : "es"}`;

      results.innerHTML = `
        <div class="search-summary">${escapeHtml(countLabel)}</div>
        ${matches.map(({ item }) => {
          const category = getCategory(item);
          const excerpt = makeExcerpt(item, rawQuery);
          const sectionLabel = item.kind === "section" ? " · Section" : "";
          return `
          <a class="search-result" href="${base}${escapeHtml(item.url)}">
            <span class="search-result-meta"><span class="search-category">${escapeHtml(category)}</span>${escapeHtml(sectionLabel)}</span>
            <strong>${highlight(item.title, rawQuery)}</strong>
            <small>${highlight(excerpt, rawQuery)}</small>
          </a>`;
        }).join("")}`;
    } else {
      results.innerHTML = `<div class="search-result search-empty"><strong>No matching entry.</strong><small>Try a spell name, class, region, condition, rule term, or a shorter phrase.</small></div>`;
    }

    activeIndex = -1;
    results.classList.add("active");
    input.setAttribute("aria-expanded", "true");
  }

  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-haspopup", "listbox");
  input.addEventListener("input", render);
  input.addEventListener("focus", () => { if (normalize(input.value)) render(); });
  input.addEventListener("keydown", event => {
    const links = [...results.querySelectorAll("a.search-result")];
    if (event.key === "Escape") {
      closeResults();
      input.blur();
    } else if (event.key === "ArrowDown" && links.length) {
      event.preventDefault();
      setActive(activeIndex < 0 ? 0 : activeIndex + 1);
    } else if (event.key === "ArrowUp" && links.length) {
      event.preventDefault();
      setActive(activeIndex < 0 ? links.length - 1 : activeIndex - 1);
    } else if (event.key === "Enter") {
      const target = activeIndex >= 0 ? links[activeIndex] : links[0];
      if (target) window.location.href = target.href;
    }
  });

  document.addEventListener("click", event => {
    if (!searchBox || !searchBox.contains(event.target)) closeResults();
  });
});

/* Wings of Atreia Progressive Web App support */
(function initWoAPWA() {
  const base = document.body?.dataset?.base || "";

  function ensureHeadLink(rel, href, extra = {}) {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    Object.entries(extra).forEach(([key, value]) => link.setAttribute(key, value));
    document.head.appendChild(link);
  }

  ensureHeadLink("manifest", base + "manifest.webmanifest");
  ensureHeadLink("apple-touch-icon", base + "assets/icons/icon-192.png");

  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#08131f";
    document.head.appendChild(meta);
  }

  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
    const meta = document.createElement("meta");
    meta.name = "apple-mobile-web-app-capable";
    meta.content = "yes";
    document.head.appendChild(meta);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(base + "sw.js?v=20260914-5", { updateViaCache: "none" }).then(registration => registration.update()).catch(err => {
        console.warn("WoA offline service worker could not be registered:", err);
      });
    });
  }

  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (document.querySelector(".pwa-install-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pwa-install-button";
    button.textContent = "Install WoA";
    button.setAttribute("aria-label", "Install Wings of Atreia for offline use");
    button.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch (_) {}
      deferredInstallPrompt = null;
      button.remove();
    });
    document.body.appendChild(button);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    document.querySelector(".pwa-install-button")?.remove();
  });
})();

/* Wings of Atreia session usability suite: favorites, recent pages, quick reference, sharing, mobile navigation, and accessibility */
(function initWoAUsabilitySuite() {
  const STORAGE_FAVORITES = "woa:favorites:v1";
  const STORAGE_RECENT = "woa:recent:v1";
  const MAX_RECENT = 15;

  const readJson = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };
  const base = () => {
    const body = document.body;
    if (body && body.hasAttribute("data-base")) return body.dataset.base || "";
    const path = window.location.pathname;
    const section = path.match(/\/(?:classes|rules|spells|world|companion|vtt-prototype)\//);
    return section ? path.slice(0, section.index + 1) : "/";
  };
  const pageTitle = () => (document.querySelector("main h1, .hero h1")?.textContent || document.title.split("|")[0] || "Wings of Atreia").trim();
  const currentPath = () => {
    const root = new URL(base() || "./", location.href);
    let rel = location.pathname.startsWith(root.pathname) ? location.pathname.slice(root.pathname.length) : location.pathname.replace(/^\//, "");
    if (!rel || rel.endsWith("/")) rel += "index.html";
    return rel + location.hash;
  };
  const absoluteFromRelative = rel => new URL(base() + rel, location.href).href;
  const escapeAttr = value => (value || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  function recordRecent() {
    const path = currentPath().split("#")[0];
    const item = { title: pageTitle(), url: path, at: Date.now() };
    const recent = readJson(STORAGE_RECENT).filter(entry => entry.url !== item.url);
    recent.unshift(item);
    writeJson(STORAGE_RECENT, recent.slice(0, MAX_RECENT));
  }

  function isFavorite(url = currentPath().split("#")[0]) {
    return readJson(STORAGE_FAVORITES).some(entry => entry.url === url);
  }

  function toggleFavorite(url = currentPath().split("#")[0], title = pageTitle()) {
    let favorites = readJson(STORAGE_FAVORITES);
    const exists = favorites.some(entry => entry.url === url);
    favorites = exists ? favorites.filter(entry => entry.url !== url) : [{ title, url }, ...favorites].slice(0, 50);
    writeJson(STORAGE_FAVORITES, favorites);
    document.dispatchEvent(new CustomEvent("woa:favorites-changed"));
    return !exists;
  }

  function addMobileNavigation() {
    const navWrap = document.querySelector(".nav-wrap");
    const nav = document.querySelector(".nav-links");
    if (!navWrap || !nav || document.querySelector(".mobile-nav-toggle")) return;
    nav.id = nav.id || "woa-primary-nav";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-nav-toggle";
    button.setAttribute("aria-controls", nav.id);
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = `<span aria-hidden="true">☰</span><span>Menu</span>`;
    navWrap.insertBefore(button, nav);
    button.addEventListener("click", () => {
      const open = nav.classList.toggle("mobile-open");
      button.setAttribute("aria-expanded", String(open));
      button.querySelector("span[aria-hidden]").textContent = open ? "✕" : "☰";
    });
    nav.addEventListener("click", event => {
      if (event.target.closest("a") && window.matchMedia("(max-width: 850px)").matches) {
        nav.classList.remove("mobile-open");
        button.setAttribute("aria-expanded", "false");
        button.querySelector("span[aria-hidden]").textContent = "☰";
      }
    });
  }

  function addProgressAndTop() {
    if (!document.querySelector(".reading-progress")) {
      const progress = document.createElement("div");
      progress.className = "reading-progress";
      progress.setAttribute("aria-hidden", "true");
      progress.innerHTML = `<span></span>`;
      document.body.appendChild(progress);
      const bar = progress.firstElementChild;
      const update = () => {
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        bar.style.width = `${Math.min(100, (scrollY / max) * 100)}%`;
      };
      addEventListener("scroll", update, { passive: true });
      addEventListener("resize", update, { passive: true });
      update();
    }

    if (!document.querySelector(".back-to-top")) {
      const top = document.createElement("button");
      top.type = "button";
      top.className = "back-to-top";
      top.setAttribute("aria-label", "Back to top");
      top.title = "Back to top";
      top.textContent = "↑";
      document.body.appendChild(top);
      const visibility = () => top.classList.toggle("visible", scrollY > 500);
      addEventListener("scroll", visibility, { passive: true });
      visibility();
      top.addEventListener("click", () => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0";
      document.body.appendChild(textarea); textarea.select();
      const ok = document.execCommand("copy"); textarea.remove(); return ok;
    }
  }

  function toast(message, actionLabel, action) {
    let host = document.querySelector(".woa-toast-host");
    if (!host) { host = document.createElement("div"); host.className = "woa-toast-host"; host.setAttribute("aria-live", "polite"); document.body.appendChild(host); }
    const el = document.createElement("div"); el.className = "woa-toast";
    el.innerHTML = `<span>${escapeAttr(message)}</span>`;
    if (actionLabel && action) {
      const btn = document.createElement("button"); btn.type = "button"; btn.textContent = actionLabel; btn.addEventListener("click", () => { action(); el.remove(); }); el.appendChild(btn);
    }
    host.appendChild(el);
    setTimeout(() => el.classList.add("show"), 10);
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 220); }, actionLabel ? 12000 : 3500);
  }

  function addHeadingLinks() {
    document.querySelectorAll("main h2[id], main h3[id]").forEach(heading => {
      if (heading.querySelector(".heading-link-button")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "heading-link-button";
      button.setAttribute("aria-label", `Copy link to ${heading.textContent.trim()}`);
      button.title = "Copy link to this section";
      button.textContent = "#";
      button.addEventListener("click", async event => {
        event.preventDefault();
        const url = new URL(location.href); url.hash = heading.id;
        if (await copyText(url.href)) toast("Section link copied.");
      });
      heading.appendChild(button);
    });
  }

  function addPageActions() {
    const header = document.querySelector("main .page-header, .hero");
    if (!header || header.querySelector(".page-action-bar")) return;
    const bar = document.createElement("div");
    bar.className = "page-action-bar";
    const fav = document.createElement("button");
    const share = document.createElement("button");
    [fav, share].forEach(btn => { btn.type = "button"; btn.className = "page-action-button"; });
    const refreshFav = () => { const on = isFavorite(); fav.innerHTML = `${on ? "★" : "☆"} <span>${on ? "Favorited" : "Favorite"}</span>`; fav.setAttribute("aria-pressed", String(on)); };
    refreshFav();
    fav.addEventListener("click", () => { const on = toggleFavorite(); refreshFav(); toast(on ? "Added to Favorites." : "Removed from Favorites."); });
    share.innerHTML = `↗ <span>Share</span>`;
    share.addEventListener("click", async () => {
      const data = { title: pageTitle(), text: `${pageTitle()} — Wings of Atreia`, url: location.href };
      if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e?.name === "AbortError") return; } }
      if (await copyText(location.href)) toast("Page link copied.");
    });
    bar.append(fav, share); header.appendChild(bar);
    document.addEventListener("woa:favorites-changed", refreshFav);
  }

  const quickLinks = [
    ["Quick Reference", "rules/quick-reference.html"],
    ["Combat", "rules/combat.html"],
    ["Flight", "rules/flight.html"],
    ["Conditions & Exploration", "rules/exploration.html"],
    ["Daeva Points & Ultimates", "rules/daeva-points-ultimates.html"],
    ["Equipment", "rules/equipment.html"],
    ["Rules Compendium", "rules/compendium.html"],
    ["Glossary", "rules/glossary.html"],
    ["Spell Library", "spells/index.html"],
    ["Classes", "classes/index.html"],
    ["Gazetteer", "world/gazetteer.html"],
    ["Rules Status", "rules/status.html"],
    ["Changelog", "changelog.html"]
  ];

  function renderSavedList(entries, emptyText, options = {}) {
    if (!entries.length) return `<p class="tool-empty">${escapeAttr(emptyText)}</p>`;
    const removable = Boolean(options.removable);
    return `<div class="tool-link-list">${entries.map(entry => removable
      ? `<div class="tool-link-row"><a href="${escapeAttr(absoluteFromRelative(entry.url))}"><strong>${escapeAttr(entry.title)}</strong><small>${escapeAttr(entry.url.replace(/index\.html$/, ""))}</small></a><button type="button" class="tool-remove-recent" data-remove-recent="${escapeAttr(entry.url)}" aria-label="Remove ${escapeAttr(entry.title)} from Recent" title="Remove from Recent">✕</button></div>`
      : `<a href="${escapeAttr(absoluteFromRelative(entry.url))}"><strong>${escapeAttr(entry.title)}</strong><small>${escapeAttr(entry.url.replace(/index\.html$/, ""))}</small></a>`
    ).join("")}</div>`;
  }

  function addReferenceDrawer() {
    if (document.querySelector(".woa-tools-launcher")) return;
    const launcher = document.createElement("button");
    launcher.type = "button"; launcher.className = "woa-tools-launcher"; launcher.innerHTML = `<span aria-hidden="true">☰</span><span>Reference</span>`;
    launcher.setAttribute("aria-label", "Open WoA quick reference tools");
    document.body.appendChild(launcher);

    const backdrop = document.createElement("div"); backdrop.className = "woa-drawer-backdrop"; backdrop.hidden = true;
    const drawer = document.createElement("aside"); drawer.className = "woa-tools-drawer"; drawer.setAttribute("aria-label", "Wings of Atreia reference tools"); drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
      <div class="tools-drawer-head"><div><span class="eyebrow">At-table tools</span><h2>Quick Reference</h2></div><button class="tools-close" type="button" aria-label="Close reference tools">✕</button></div>
      <div class="tools-tabs" role="tablist" aria-label="Reference tools">
        <button type="button" role="tab" data-tab="quick" aria-selected="true">Quick</button>
        <button type="button" role="tab" data-tab="favorites" aria-selected="false">Favorites</button>
        <button type="button" role="tab" data-tab="recent" aria-selected="false">Recent</button>
        <button type="button" role="tab" data-tab="offline" aria-selected="false">Offline</button>
      </div>
      <div class="tools-panel" data-panel="quick"></div>
      <div class="tools-panel" data-panel="favorites" hidden></div>
      <div class="tools-panel" data-panel="recent" hidden></div>
      <div class="tools-panel offline-tools-panel" data-panel="offline" hidden>
        <p class="offline-intro">Check for changes and download the complete offline reference bundle, including the Class Browser and all 11 class data files.</p>
        <div class="offline-status-line"><span class="offline-status-dot"></span><strong class="offline-label">Checking offline files…</strong></div>
        <div class="offline-count">Checking cached files…</div>
        <div class="offline-progress-track" role="progressbar" aria-label="Offline download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="offline-progress-fill"></div></div>
        <p class="offline-progress-text" aria-live="polite">Connect to the internet to download the offline bundle.</p>
        <div class="offline-actions">
          <button class="offline-action primary check-download" type="button">Check &amp; Download Offline Files</button>
          <button class="offline-action force-download" type="button">Force Full Download</button>
        </div>
      </div>`;
    document.body.append(backdrop, drawer);

    const quick = drawer.querySelector('[data-panel="quick"]');
    quick.innerHTML = `<div class="tool-link-list">${quickLinks.map(([label,url]) => `<a href="${escapeAttr(absoluteFromRelative(url))}"><strong>${label}</strong><small>Open reference →</small></a>`).join("")}</div>`;

    const refreshLists = () => {
      drawer.querySelector('[data-panel="favorites"]').innerHTML = renderSavedList(readJson(STORAGE_FAVORITES), "No favorites yet. Use ☆ Favorite on any reference page.");
      const recentPanel = drawer.querySelector('[data-panel="recent"]');
      const recent = readJson(STORAGE_RECENT);
      recentPanel.innerHTML = `${recent.length ? `<div class="recent-list-actions"><span>${recent.length} recent page${recent.length === 1 ? "" : "s"}</span><button type="button" class="clear-recents">Clear Recent</button></div>` : ""}${renderSavedList(recent, "No recently viewed pages yet.", { removable: true })}`;
    };
    refreshLists();
    document.addEventListener("woa:favorites-changed", refreshLists);
    drawer.querySelector('[data-panel="recent"]').addEventListener("click", event => {
      const remove = event.target.closest("[data-remove-recent]");
      if (remove) {
        const url = remove.dataset.removeRecent;
        writeJson(STORAGE_RECENT, readJson(STORAGE_RECENT).filter(entry => entry.url !== url));
        refreshLists(); toast("Removed from Recent."); return;
      }
      if (event.target.closest(".clear-recents")) {
        writeJson(STORAGE_RECENT, []); refreshLists(); toast("Recent pages cleared.");
      }
    });

    const offlinePanel = drawer.querySelector('[data-panel="offline"]');
    const offlineLabel = offlinePanel.querySelector(".offline-label");
    const offlineCount = offlinePanel.querySelector(".offline-count");
    const offlineProgress = offlinePanel.querySelector(".offline-progress-track");
    const offlineFill = offlinePanel.querySelector(".offline-progress-fill");
    const offlineText = offlinePanel.querySelector(".offline-progress-text");
    const checkButton = offlinePanel.querySelector(".check-download");
    const forceButton = offlinePanel.querySelector(".force-download");
    let offlineBusy = false;

    function setOfflineProgress(done,total,message) {
      const percent = total ? Math.round(done/total*100) : 0;
      offlineCount.textContent = `Cached files: ${done} / ${total}`;
      offlineFill.style.width = percent + "%";
      offlineProgress.setAttribute("aria-valuenow",String(percent));
      offlineText.textContent = message || percent + "% complete";
    }
    function renderOfflineStatus(status) {
      offlinePanel.classList.remove("ready","preparing","error");
      if(!status) {
        offlinePanel.classList.add("error");
        offlineLabel.textContent = navigator.onLine ? "Offline files not ready" : "Offline status unavailable";
        offlineText.textContent = navigator.onLine ? "Use Check & Download to prepare the offline files." : "Reconnect to download the offline bundle.";
        return;
      }
      if(status.ready) {
        offlinePanel.classList.add("ready");
        offlineLabel.textContent = navigator.onLine ? "Offline Ready" : "Offline Ready · No connection";
        setOfflineProgress(status.cached,status.total,"All required offline files are available on this device.");
      } else {
        offlinePanel.classList.add("preparing");
        offlineLabel.textContent = "Offline files not ready";
        setOfflineProgress(status.cached||0,status.total||0,"Some files are missing. Run Check & Download to prepare them.");
      }
    }
    async function getOfflineWorker() {
      const registration=await navigator.serviceWorker.getRegistration();
      return navigator.serviceWorker.controller||registration?.active||registration?.waiting||registration?.installing;
    }
    async function requestOfflineStatus() {
      try {
        const worker=await getOfflineWorker();
        if(!worker) return renderOfflineStatus(null);
        const channel=new MessageChannel();
        const timeout=setTimeout(()=>renderOfflineStatus(null),4000);
        channel.port1.onmessage=event=>{clearTimeout(timeout);renderOfflineStatus(event.data||null);};
        worker.postMessage({type:"WOA_CACHE_STATUS"},[channel.port2]);
      } catch(_) { renderOfflineStatus(null); }
    }
    async function downloadOfflineBundle(force) {
      if(offlineBusy)return;
      if(!navigator.onLine) {
        offlinePanel.classList.remove("ready");offlinePanel.classList.add("error");
        offlineLabel.textContent="Internet connection required";
        offlineText.textContent="Reconnect to the internet, then try again.";return;
      }
      offlineBusy=true;checkButton.disabled=true;forceButton.disabled=true;
      checkButton.textContent="Downloading…";
      offlinePanel.classList.remove("ready","error");offlinePanel.classList.add("preparing");
      offlineLabel.textContent=force?"Force full download in progress…":"Checking & downloading…";
      setOfflineProgress(0,0,"Please keep this page open while the offline files are prepared.");
      try {
        const worker=await getOfflineWorker();
        if(!worker)throw new Error("The offline service worker is not active. Reload the website while online and try again.");
        const channel=new MessageChannel();
        const timeout=setTimeout(()=>{
          offlineBusy=false;checkButton.disabled=false;forceButton.disabled=false;checkButton.textContent="Check & Download Offline Files";
          offlinePanel.classList.remove("preparing");offlinePanel.classList.add("error");
          offlineLabel.textContent="Download timed out";offlineText.textContent="Check your connection and retry.";
        },180000);
        channel.port1.onmessage=event=>{
          const data=event.data||{};
          if(data.type==="WOA_DOWNLOAD_PROGRESS") setOfflineProgress(data.cached||0,data.total||0,data.message||"Downloading…");
          if(data.type==="WOA_DOWNLOAD_COMPLETE") {
            clearTimeout(timeout);offlineBusy=false;checkButton.disabled=false;forceButton.disabled=false;checkButton.textContent="Check & Download Offline Files";
            renderOfflineStatus(data.status||data);offlineText.textContent="Offline Ready — every required file has been verified.";
          }
          if(data.type==="WOA_DOWNLOAD_ERROR") {
            clearTimeout(timeout);offlineBusy=false;checkButton.disabled=false;forceButton.disabled=false;checkButton.textContent="Check & Download Offline Files";
            offlinePanel.classList.remove("preparing","ready");offlinePanel.classList.add("error");
            offlineLabel.textContent="Download incomplete";offlineText.textContent=data.message||"A file could not be downloaded. Check your connection and retry.";
          }
        };
        worker.postMessage({type:"WOA_DOWNLOAD_OFFLINE",force:Boolean(force)},[channel.port2]);
      } catch(error) {
        offlineBusy=false;checkButton.disabled=false;forceButton.disabled=false;checkButton.textContent="Check & Download Offline Files";
        offlinePanel.classList.remove("preparing","ready");offlinePanel.classList.add("error");
        offlineLabel.textContent="Download failed";offlineText.textContent=error.message||"Could not start the offline download.";
      }
    }
    checkButton.addEventListener("click",()=>downloadOfflineBundle(false));
    forceButton.addEventListener("click",()=>downloadOfflineBundle(true));
    window.addEventListener("online",requestOfflineStatus);
    window.addEventListener("offline",requestOfflineStatus);
    navigator.serviceWorker?.addEventListener("controllerchange",()=>setTimeout(requestOfflineStatus,300));
    requestOfflineStatus();

    let previousFocus=null;
    const open=()=>{previousFocus=document.activeElement;backdrop.hidden=false;requestAnimationFrame(()=>{drawer.classList.add("open");backdrop.classList.add("open");});drawer.setAttribute("aria-hidden","false");document.body.classList.add("drawer-open");drawer.querySelector(".tools-close").focus();refreshLists();requestOfflineStatus();};
    const close=()=>{drawer.classList.remove("open");backdrop.classList.remove("open");drawer.setAttribute("aria-hidden","true");document.body.classList.remove("drawer-open");setTimeout(()=>{backdrop.hidden=true;},220);previousFocus?.focus?.();};
    launcher.addEventListener("click",open);drawer.querySelector(".tools-close").addEventListener("click",close);backdrop.addEventListener("click",close);
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&drawer.classList.contains("open"))close();});
    drawer.querySelectorAll('[role="tab"]').forEach(tab=>tab.addEventListener("click",()=>{
      drawer.querySelectorAll('[role="tab"]').forEach(t=>t.setAttribute("aria-selected",String(t===tab)));
      drawer.querySelectorAll(".tools-panel").forEach(panel=>panel.hidden=panel.dataset.panel!==tab.dataset.tab);
      if(tab.dataset.tab==="favorites"||tab.dataset.tab==="recent")refreshLists();
      if(tab.dataset.tab==="offline")requestOfflineStatus();
    }));
  }

  function addUpdateAwareness() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;
        const notify = () => toast("A newer WoA offline reference has been downloaded.", "Reload", () => location.reload());
        if (registration.waiting && navigator.serviceWorker.controller) notify();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) notify();
          });
        });
        // Check for a newer service worker when the user opens the site online.
        if (navigator.onLine) registration.update().catch(() => {});
      } catch (_) {}
    });
  }

  function accessibilityEnhancements() {
    // Add a keyboard skip link once, without editing every HTML page.
    if (!document.querySelector(".skip-link")) {
      const main = document.querySelector("main");
      if (main) {
        if (!main.id) main.id = "main-content";
        const skip = document.createElement("a"); skip.className = "skip-link"; skip.href = `#${main.id}`; skip.textContent = "Skip to main content"; document.body.prepend(skip);
      }
    }
    document.querySelectorAll("a[target='_blank']").forEach(link => { if (!link.rel) link.rel = "noopener noreferrer"; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    recordRecent();
    accessibilityEnhancements();
    addMobileNavigation();
    addProgressAndTop();
    addHeadingLinks();
    addPageActions();
    addReferenceDrawer();
    addUpdateAwareness();
  });
})();
