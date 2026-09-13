async function loadSearchIndex() {
  const base = document.body.dataset.base || "";
  try {
    const res = await fetch(base + "assets/js/search-index.json?v=20260914-3", { cache: "no-store" });
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
      navigator.serviceWorker.register(base + "sw.js").catch(err => {
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

/* Wings of Atreia offline bundle status */
(function initWoAOfflineStatus() {
  if (!("serviceWorker" in navigator)) return;

  const style = document.createElement("style");
  style.textContent = `
    .woa-offline-status{position:fixed;right:16px;bottom:16px;z-index:9998;max-width:min(340px,calc(100vw - 32px));font:600 13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .woa-offline-status button{width:100%;text-align:left;border:1px solid rgba(214,176,83,.45);background:rgba(8,19,31,.96);color:#f4ead2;border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer}
    .woa-offline-status button:hover,.woa-offline-status button:focus{border-color:#d6b053;outline:none}
    .woa-offline-status .row{display:flex;align-items:center;gap:8px}
    .woa-offline-status .dot{width:9px;height:9px;border-radius:50%;background:#9aa6b2;flex:0 0 auto}
    .woa-offline-status.ready .dot{background:#65c98b}
    .woa-offline-status.preparing .dot{background:#d6b053}
    .woa-offline-status.error .dot{background:#d06a6a}
    .woa-offline-status .detail{display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12);font-weight:400;color:#c9d3dc}
    .woa-offline-status.open .detail{display:block}
    .woa-offline-status .detail strong{color:#f4ead2}
    @media (max-width:640px){.woa-offline-status{right:10px;bottom:10px;max-width:calc(100vw - 20px)}}
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "woa-offline-status preparing";
  wrap.innerHTML = `
    <button type="button" aria-expanded="false" aria-label="Show offline reference status">
      <div class="row"><span class="dot" aria-hidden="true"></span><span class="label">Offline Reference: Checking…</span></div>
      <div class="detail"></div>
    </button>`;
  document.body.appendChild(wrap);

  const button = wrap.querySelector("button");
  const label = wrap.querySelector(".label");
  const detail = wrap.querySelector(".detail");
  button.addEventListener("click", () => {
    const open = wrap.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });

  function render(status) {
    wrap.classList.remove("ready", "preparing", "error");
    const online = navigator.onLine;

    if (status?.ready) {
      wrap.classList.add("ready");
      label.textContent = online ? "Offline Reference: Ready" : "Offline Reference: Ready · Offline";
      detail.innerHTML = `<strong>Cached pages & assets:</strong> ${status.cached} / ${status.total}<br><strong>Offline bundle:</strong> Complete<br><strong>Bundle version:</strong> ${status.version}<br><strong>Bundle updated:</strong> ${status.updated}`;
    } else if (status?.cached >= 0) {
      wrap.classList.add("preparing");
      label.textContent = "Offline Reference: Preparing…";
      detail.innerHTML = `<strong>Cached pages & assets:</strong> ${status.cached} / ${status.total}<br>Keep this page open while the full WoA reference bundle finishes downloading.`;
    } else {
      wrap.classList.add("error");
      label.textContent = online ? "Offline Reference: Not ready" : "Offline Reference: Status unavailable";
      detail.innerHTML = online
        ? "The offline bundle has not finished installing yet. Keep the site open online, then reload once installation completes."
        : "Reconnect briefly so WoA can finish preparing the offline reference bundle.";
    }
  }

  async function requestStatus() {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = navigator.serviceWorker.controller || registration?.active || registration?.waiting || registration?.installing;
    if (!worker) return render(null);

    const channel = new MessageChannel();
    const timeout = setTimeout(() => render(null), 2500);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      render(event.data || null);
    };
    worker.postMessage({ type: "WOA_CACHE_STATUS" }, [channel.port2]);
  }

  window.addEventListener("online", requestStatus);
  window.addEventListener("offline", requestStatus);
  navigator.serviceWorker.addEventListener("controllerchange", () => setTimeout(requestStatus, 250));
  window.addEventListener("load", () => setTimeout(requestStatus, 700));
  setTimeout(requestStatus, 1200);
})();
