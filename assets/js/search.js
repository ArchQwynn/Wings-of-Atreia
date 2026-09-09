
async function loadSearchIndex() {
  const base = document.body.dataset.base || "";
  try {
    const res = await fetch(base + "assets/js/search-index.json");
    return await res.json();
  } catch (e) {
    console.error("Could not load search index:", e);
    return [];
  }
}

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

document.addEventListener("DOMContentLoaded", async () => {
  const index = await loadSearchIndex();
  const input = document.querySelector("[data-site-search]");
  const results = document.querySelector("[data-search-results]");
  if (!input || !results) return;

  const base = document.body.dataset.base || "";

  function render() {
    const q = normalize(input.value);
    if (!q) {
      results.classList.remove("active");
      results.innerHTML = "";
      return;
    }

    const matches = index.filter(item =>
      normalize(item.title + " " + item.desc).includes(q)
    ).slice(0, 8);

    results.innerHTML = matches.length
      ? matches.map(item => `
        <a class="search-result" href="${base}${item.url}">
          <strong>${item.title}</strong>
          <small>${item.desc}</small>
        </a>`).join("")
      : `<div class="search-result"><strong>No results yet.</strong><small>More indexed rules will be added as the site grows.</small></div>`;

    results.classList.add("active");
  }

  input.addEventListener("input", render);
});
