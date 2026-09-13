async function loadSearchIndex() {
  const base = document.body.dataset.base || "";
  try {
    const res = await fetch(base + "assets/js/search-index.json?v=20260914-2", { cache: "no-store" });
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

document.addEventListener("DOMContentLoaded", async () => {
  const input = document.querySelector("[data-site-search]");
  if (!input) return;

  // Make search results a real header dropdown on every page, regardless of
  // where older page templates placed the results container in the document.
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

  function closeResults() {
    results.classList.remove("active");
    results.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
  }

  function render() {
    const q = normalize(input.value);
    if (!q) {
      closeResults();
      return;
    }

    const matches = index
      .map(item => ({ item, score: scoreItem(item, q) }))
      .filter(result => result.score >= 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 10);

    results.innerHTML = matches.length
      ? matches.map(({ item }) => `
        <a class="search-result" href="${base}${escapeHtml(item.url)}">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.desc || "Open this Wings of Atreia reference entry.")}</small>
        </a>`).join("")
      : `<div class="search-result"><strong>No matching entry.</strong><small>Try a spell name, class, region, condition, rule term, or a shorter phrase.</small></div>`;

    results.classList.add("active");
    input.setAttribute("aria-expanded", "true");
  }

  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-haspopup", "listbox");
  input.addEventListener("input", render);
  input.addEventListener("focus", () => { if (normalize(input.value)) render(); });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeResults();
      input.blur();
    } else if (event.key === "Enter") {
      const first = results.querySelector("a.search-result");
      if (first) window.location.href = first.href;
    }
  });

  document.addEventListener("click", event => {
    if (!searchBox || !searchBox.contains(event.target)) closeResults();
  });
});
