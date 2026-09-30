#!/usr/bin/env python3
"""Build the WoA client-side search index from the repository's HTML pages.

The generated file is consumed by assets/js/search.js.  This script deliberately
uses only Python's standard library so GitHub Actions needs no third-party
packages.
"""
from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "js" / "search-index.json"

EXCLUDED_DIRS = {".git", ".github", "node_modules", "scripts"}
EXCLUDED_FILES = {"offline.html"}
MAX_PAGE_TEXT = 12000
MAX_SECTION_TEXT = 5000


def clean(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: list[str] = []
        self.description = ""
        self.body_parts: list[str] = []
        self.headings: list[dict] = []
        self._in_title = False
        self._skip_depth = 0
        self._heading: dict | None = None
        self._heading_parts: list[str] = []
        self._heading_depth = 0
        self._section_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        tag = tag.lower()

        if tag == "meta" and attrs_dict.get("name", "").lower() == "description":
            self.description = attrs_dict.get("content", "") or ""

        if tag == "title":
            self._in_title = True
            return

        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
            return

        if self._skip_depth:
            return

        if tag in {"h1", "h2", "h3", "h4"}:
            self._finish_heading()
            self._heading = {
                "tag": tag,
                "id": attrs_dict.get("id", "") or "",
            }
            self._heading_parts = []
            self._section_parts = []
            self._heading_depth = int(tag[1])

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title":
            self._in_title = False
            return
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag in {"h1", "h2", "h3", "h4"}:
            self._finish_heading()

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title.append(data)
            return
        if self._skip_depth:
            return

        text = clean(data)
        if not text:
            return

        self.body_parts.append(text)
        if self._heading is not None:
            self._heading_parts.append(text)
        else:
            self._section_parts.append(text)

    def _finish_heading(self) -> None:
        if not self._heading:
            return
        title = clean(" ".join(self._heading_parts))
        if title:
            self.headings.append({
                "title": title,
                "id": self._heading.get("id", ""),
            })
        self._heading = None
        self._heading_parts = []


def parse_page(path: Path) -> tuple[PageParser, str]:
    parser = PageParser()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser, clean(" ".join(parser.body_parts))


def relative_url(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return rel


def section_entries(path: Path, parser: PageParser, page_url: str) -> list[dict]:
    entries: list[dict] = []
    if not parser.headings:
        return entries

    source = ROOT / path
    raw = source.read_text(encoding="utf-8", errors="replace")
    # Section text is intentionally extracted from visible text in the whole
    # document. This keeps the index robust even when page markup varies.
    _, body_text = parse_page(source)

    for heading in parser.headings:
        anchor = heading["id"]
        if not anchor:
            continue
        title = heading["title"]
        # The heading itself plus the page text gives search useful context
        # without making the generated index dependent on a fragile DOM model.
        text = f"{title}. {body_text}"[:MAX_SECTION_TEXT]
        entries.append({
            "title": title,
            "url": f"{page_url}#{anchor}",
            "desc": f"{title} — Wings of Atreia reference section.",
            "text": text,
            "kind": "section",
        })
    return entries


def iter_html() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*.html"):
        rel_parts = path.relative_to(ROOT).parts
        if any(part in EXCLUDED_DIRS for part in rel_parts):
            continue
        if path.name in EXCLUDED_FILES:
            continue
        files.append(path)
    return sorted(files)


def build() -> list[dict]:
    index: list[dict] = []
    for path in iter_html():
        parser, body_text = parse_page(path)
        title = clean(" ".join(parser.title)) or path.stem.replace("-", " ").title()
        desc = clean(parser.description) or f"Wings of Atreia reference: {title}."
        url = relative_url(path)
        kind = "landing" if path.name == "index.html" or path.name == "start-here.html" else "page"

        index.append({
            "title": title,
            "url": url,
            "desc": desc,
            "text": body_text[:MAX_PAGE_TEXT],
            "kind": kind,
        })
        index.extend(section_entries(path, parser, url))

    index.sort(key=lambda item: (item["title"].lower(), item["url"].lower(), item["kind"]))
    return index


def main() -> None:
    data = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Built {len(data)} searchable entries from {len(iter_html())} HTML pages.")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
