/* Wings of Atreia Search — cache-busted build */
(() => {
  const input = document.querySelector('[data-search-input]') || document.querySelector('#searchInput') || document.querySelector('input[type="search"]');
  const results = document.querySelector('[data-search-results]') || document.querySelector('#searchResults');
  if (!input) return;
  const base = '/Wings-of-Atreia/';
  let index = [];
  const normalize = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function loadIndex() {
    try {
      const r = await fetch(`${base}assets/js/search-index.json?v=20261001-2`, {cache:'no-store'});
      index = await r.json();
    } catch (e) { index = []; console.error('WoA search index failed to load', e); }
  }
  function score(item, q) {
    const n = normalize(q), title = normalize(item.title), desc = normalize(item.desc), text = normalize(item.text);
    let s = 0;
    if (title === n) s += 1000;
    if (title.includes(n)) s += 500;
    if (desc.includes(n)) s += 100;
    if (text.includes(n)) s += 50;
    return s;
  }
  function allMatches(q) {
    const n = normalize(q); if (!n) return [];
    return index.map(item => ({item, score:score(item,q)})).filter(x => x.score > 0)
      .sort((a,b) => b.score-a.score || String(a.item.title).localeCompare(String(b.item.title)));
  }
  function renderPreview(q) {
    if (!results) return;
    const matches = allMatches(q).slice(0,10);
    results.innerHTML = matches.length ? matches.map(({item}) => `<a class="search-result" href="${esc(item.url)}"><strong>${esc(item.title)}</strong><span>${esc(item.desc || '')}</span></a>`).join('') : '<div class="search-empty">No results found.</div>';
  }
  input.addEventListener('input', () => renderPreview(input.value.trim()));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const q = input.value.trim();
      if (q) window.location.assign(`${base}search-results.html?q=${encodeURIComponent(q)}`);
    }
  });
  loadIndex().then(() => { if (input.value.trim()) renderPreview(input.value.trim()); });
})();
