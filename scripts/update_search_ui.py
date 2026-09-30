from pathlib import Path
from datetime import datetime, timezone
import re

search = Path("assets/js/search-v20260914-6.js")
text = search.read_text(encoding="utf-8")

old = '''    } else if (event.key === "Enter") {
      const target = activeIndex >= 0 ? links[activeIndex] : links[0];
      if (target) window.location.href = target.href;
    }'''
new = '''    } else if (event.key === "Enter") {
      event.preventDefault();
      const query = input.value.trim();
      if (query) {
        window.location.href = `${base}search-results.html?q=${encodeURIComponent(query)}`;
      }
    }'''
if old not in text:
    raise SystemExit("Expected Enter handler was not found; refusing to modify search.js.")
text = text.replace(old, new, 1)
text = text.replace("search-index.json?v=20260914-5", "search-index.json?v=20261001-1", 1)
search.write_text(text, encoding="utf-8")

sw = Path("sw.js")
sw_text = sw.read_text(encoding="utf-8")
stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
sw_text, n1 = re.subn(r'const CACHE_VERSION = "[^"]+";', f'const CACHE_VERSION = "woa-pwa-{stamp}";', sw_text, count=1)
sw_text, n2 = re.subn(r'const RUNTIME_CACHE = "[^"]+";', f'const RUNTIME_CACHE = "woa-runtime-{stamp}";', sw_text, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit("Could not locate PWA cache version constants in sw.js")

if '"search-results.html"' not in sw_text:
    sw_text = sw_text.replace('  "offline.html",', '  "offline.html",\n  "search-results.html",', 1)
if '"assets/js/search-results.js?v=20261001-1"' not in sw_text:
    marker = '  "assets/js/search-results.js?v=20261001-1",'
    if '"assets/js/search-v20260914-6.js"' in sw_text:
        sw_text = sw_text.replace('  "assets/js/search-v20260914-6.js",', '  "assets/js/search-v20260914-6.js",\n' + marker, 1)
    elif 'assets/js/search-v20260914-6.js' in sw_text:
        sw_text = sw_text.replace('"assets/js/search-v20260914-6.js"', '"assets/js/search-v20260914-6.js",\n' + marker, 1)
    elif '  "assets/js/search-index.json",' in sw_text:
        sw_text = sw_text.replace('  "assets/js/search-index.json",', '  "assets/js/search-index.json",\n' + marker, 1)

sw.write_text(sw_text, encoding="utf-8")
print("Search UI and PWA cache updates prepared successfully.")
