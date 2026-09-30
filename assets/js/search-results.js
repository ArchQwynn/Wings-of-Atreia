async function loadIndex() {
  try {
    const res = await fetch("assets/js/search-index.json?v=20261001-1", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("Could not load WoA search index:", error);
    return [];
  }
}

function normalize(value) {
  return (value || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9+\-']/g, " ").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return (value || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
  const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return safe.replace(new RegExp(`(${escapedTerms.join("|")})`, "gi"), "<mark>$1</mark>");
}

function excerpt(item, query, maxLength = 260) {
  const terms = queryTerms(query);
  let source = (item.desc || item.text || "Open this Wings of Atreia reference entry.").toString().replace(/\s+/g, " ").trim();
  if (source.length <= maxLength) return source;
  const lower = source.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const pos = lower.indexOf(term.toLowerCase());
    if (pos >= 0 && (at < 0 || pos < at)) at = pos;
  }
  if (at < 0) return `${source.slice(0, maxLength - 1).trim()}…`;
  let start = Math.max(0, at - Math.floor(maxLength / 2));
  let end = Math.min(source.length, start + maxLength);
  if (end === source.length) start = Math.max(0, end - maxLength);
  if (start > 0) { const space = source.indexOf(" ", start); if (space > start && space < start + 25) start = space + 1; }
  if (end < source.length) { const space = source.lastIndexOf(" ", end); if (space > start) end = space; }
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

function render(index, query) {
  const count = document.getElementById("search-results-count");
  const list = document.getElementById("search-results-list");
  const q = normalize(query);
  if (!q) {
    count.textContent = "Enter a search term to search the complete WoA reference index.";
    list.innerHTML = "";
    return;
  }

  const matches = index.map(item => ({ item, score: scoreItem(item, q) }))
    .filter(result => result.score >= 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  count.textContent = `${matches.length} matching ${matches.length === 1 ? "entry" : "entries"}`;
  if (!matches.length) {
    list.innerHTML = `<div class="empty"><strong>No matching entry.</strong><br>Try a class, spell, rule, region, condition, mechanic, or shorter phrase.</div>`;
    return;
  }

  list.innerHTML = matches.map(({ item }) => {
    const url = item.url || "";
    const section = item.kind === "section" ? " · Section" : "";
    return `<a class="result-item" href="${escapeHtml(url)}">
      <div class="result-meta">${escapeHtml(getCategory(item))}${escapeHtml(section)}</div>
      <div class="result-title">${highlight(item.title, query)}</div>
      <div class="result-excerpt">${highlight(excerpt(item, query), query)}</div>
    </a>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("search-results-input");
  const form = document.getElementById("search-results-form");
  const index = await loadIndex();
  const params = new URLSearchParams(window.location.search);
  const initial = params.get("q") || "";
  input.value = initial;
  render(index, initial);

  form.addEventListener("submit", event => {
    event.preventDefault();
    const query = input.value.trim();
    const url = query ? `search-results.html?q=${encodeURIComponent(query)}` : "search-results.html";
    window.history.replaceState({}, "", url);
    render(index, query);
    input.focus();
  });
});
