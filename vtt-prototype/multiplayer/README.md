# Wings of Atreia VTT — Multiplayer Foundation

This directory is an **isolated foundation scaffold**. It is intentionally not imported by `index.html` and does not change current VTT behavior.

## Safety guarantees

- Existing `index.html`, `app.js`, and `style.css` are not modified by this foundation.
- No network connections are opened.
- No PeerJS dependency is loaded.
- No local scene data is read, changed, or saved.
- No multiplayer controls are added to the current UI.
- The existing local VTT remains the working application until later integration is explicitly tested.

## Current foundation files

- `protocol.js`: versioned message envelope, message allowlist, payload-size guard, and validation helpers.
- `lifecycle.js`: explicit session lifecycle state machine and guarded transitions.

These files are plain browser scripts that expose `window.WoAMultiplayerFoundation`. They are not loaded by the live VTT yet.

## Planned implementation order

1. Review this isolated scaffold and keep the current VTT unchanged.
2. Add unit tests for protocol validation and lifecycle transitions.
3. Add a transport adapter behind a small interface. Decide whether PeerJS is the actual transport or whether the existing Cloudflare WebSocket prototype has a role; do not run two transports accidentally.
4. Add host/player session creation and admission controls.
5. Add heartbeats, host leases/generations, reconnect attempts, and resynchronization.
6. Integrate the existing scene model through a compatibility layer.
7. Test existing VTT features and multiplayer behavior before proposing a merge to `main`.

## Protocol principles

- A message is untrusted input, even if it arrived through an established peer connection.
- Message validation is a parsing guard, not authentication or authorization.
- The GM remains authoritative for gameplay changes.
- Clients must not be trusted to enforce token ownership or fog-of-war visibility.
- Session secrets must never be placed in a shareable invitation URL.
- Recovery must reject stale host generations and stale state revisions.
- A display name is not an identity credential.

## Current status

This is only the first foundation step. It is **not a working multiplayer implementation** and does not yet establish PeerJS connections, create rooms, persist checkpoints, or recover sessions.
