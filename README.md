# Wings of Atreia Website

Player-facing GitHub Pages reference for Wings of Atreia.

## Current Rules Reference

**Website Rules Reference: v1.0.0**  
**Effective: 28 September 2026**

The GitHub website is the **overall authoritative mechanical reference** for Wings of Atreia.

The synchronization hierarchy is:

1. **GitHub Website — authoritative mechanics**
2. **Books — follow the mechanics established by the website**
3. **Character Manager — follows and implements the mechanics established by the website**

If a book or the Character Manager conflicts with a current website mechanic, the website mechanic is authoritative and the downstream artifact must be corrected.

See RULES-REFERENCE-v1.0.0.md for the complete authority and synchronization policy.

## Publish with GitHub Pages

1. Upload the contents of this folder to the root of your GitHub repository.
2. Commit the files to the `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`.
6. Save.
7. GitHub will publish the site at your GitHub Pages project URL.

## Main structure

- `index.html` — homepage
- `about.html` — project and credits
- `rules/` — core rules index
- `classes/` — classes index
- `world/` — setting index
- `assets/css/style.css` — shared design
- `assets/js/search.js` — search behavior
- `assets/js/search-index.json` — searchable topics

## Important

Only player-safe material should be published here. GM secrets and hidden campaign material should remain outside the public site.