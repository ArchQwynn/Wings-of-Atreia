# Wings of Atreia — Website Rules Reference v1.1.0

**Effective:** 19 October 2026  
**Status:** Current authority and synchronization policy

## Authority Model

The **current approved mechanics on the public Wings of Atreia player website are the single authoritative source for player-facing game mechanics**.

Authority order:

1. **Current approved player website mechanics** — authoritative.
2. **Books and PDFs** — explanatory/publication copies that must match the website.
3. **Character Manager** — software implementation that must match the website.
4. **Older snapshots, drafts, exports, screenshots, cached pages, notes, and copied text** — historical only when they conflict with current approved website mechanics.
5. **GM Reference** — authoritative for GM-only lore, campaign secrets, encounter content, and GM tools; it must not establish a conflicting alternative to player-facing mechanics.

## Supersession Rule

When a mechanic has been revised and the revision is approved on the player website, the current approved mechanic **supersedes and replaces every conflicting earlier version**, regardless of where the older wording appears or whether it was previously published, approved, printed, exported, or copied elsewhere.

- Do not restore an older mechanic merely because it appears in a book, PDF, old conversation, screenshot, cached page, or older commit.
- Do not treat a later commit as a rules change unless its content actually changes an approved mechanic; generated search indexes, cache-version changes, layout edits, and other non-mechanical commits do not independently approve rules.
- If two live pages appear to conflict, check the relevant current class/rules page, its explicit clarifications, and the latest documented approval. Resolve the conflict against the current approved mechanic, then correct the inconsistent page(s); do not invent a compromise rule.
- An older rule remains valid only if it is still present in or consistent with the current approved rules. A historical publication does not override the website.
- A rule change should not be inferred from silence. If a mechanic has not been changed, retain the current approved version.

## Synchronization Responsibilities

- **Website:** record and publish the approved mechanic first. Update cross-references and summaries affected by the change.
- **Books/PDFs:** review all affected passages and revise them to match the website. Preserve non-conflicting material; do not introduce mechanics absent from the current reference.
- **Character Manager:** review character creation, advancement, calculations, validation, inventory, spells, class resources, and other behavior affected by the approved change.
- **GM Reference:** use the player website for shared/player-facing mechanics. GM-only lore, campaign information, statblocks, and tools may remain in the GM repository, but shared procedures must not contradict the current player rules.
- **QA:** verify the resulting files and published site. A successful GitHub commit or deployment confirms publication status, not the correctness or approval of every mechanic.

## Versioning

**Website Rules Reference:** v1.1.0  
**Effective date:** 19 October 2026

This version clarifies the precedence of the latest approved mechanics and supersedes the authority-policy wording in Website Rules Reference v1.0.0. It does not itself create or change an in-game mechanic.

## Synchronization Principle

> **The latest approved mechanic on the player website wins. All conflicting older copies must be corrected to match it.**

Update the website rule first, then synchronize the books and Character Manager. The website is the mechanics source of truth; downstream artifacts do not overrule it.
