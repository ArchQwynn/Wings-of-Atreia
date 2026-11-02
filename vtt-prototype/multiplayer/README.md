# Wings of Atreia VTT — Multiplayer Integration

This branch integrates the isolated PeerJS foundation with the current VTT entry point. The production VTT remains on `main` until this branch has passed integration and regression testing.

## Current integration

- `protocol.js`: versioned message envelopes and a 64 KiB message ceiling.
- `authority.js`: host-generation/revision fencing, action authorization helpers, join approval queue, and visibility filtering.
- `lifecycle.js`: explicit connection lifecycle transitions.
- `runtime.js`: PeerJS host/player sessions, GM join approval, 25-player admission cap, filtered player snapshots, host-authoritative revisions, action requests, GM approval/rejection, request withdrawal, heartbeats, and chunked image transfer (up to 1.8 MiB per image; each transport message remains below 64 KiB).
- `connection-harness.html`: standalone transport/handshake diagnostic harness.
- `../player-mockup.html`: player-interface reference mockup.
- `MULTIPLAYER_REQUIREMENTS.md`: full multiplayer requirements and acceptance criteria.

The VTT entry point loads the pure foundation modules before `app.js`, then loads `runtime.js` after the VTT shared-state bridge is available. PeerJS itself is loaded on demand when the GM hosts or a player joins, so local VTT use does not require the PeerJS CDN.

## Authority and privacy safeguards

- The GM browser is authoritative for accepted shared gameplay state.
- Every join request requires GM approval.
- The shared capacity is 25 players; pending join approvals reserve capacity.
- Display names and PeerJS IDs are labels/routing identifiers, not authentication credentials.
- Player snapshots are filtered before transmission. GM-only and unassigned tokens, GM-only assets, GM notes/pins, and local camera/selection state are not sent to players.
- Player-originated actions are requests. The GM revalidates target existence, permissions, host generation, and scene revision before applying an approved action.
- Camera state and measurements remain participant-local.
- No automatic host recovery or automatic reconnection is implemented. If the GM session ends, players must join a new session and receive fresh approval.
- Multiplayer is opt-in. The VTT remains usable locally when no multiplayer session is active.

## Current implementation boundary

The transport and shared-state bridge are now wired into the VTT. The current action gateway supports token movement requests; the Combat Movement Tracker's private route preview, altitude review display, and round-based movement indicators are still pending. Walls/doors and the in-VTT Help guide are also separate approved features awaiting implementation.

A trusted host-election service and secure identity authentication are not provided. The 25-remote-peer capacity remains a design target until staged load testing demonstrates it.

## Local tests

Run from the repository root:

```sh
node --test vtt-prototype/multiplayer/tests/*.test.js
```

The standalone harness remains a diagnostic tool. Passing its tests does not prove that production multiplayer is secure or that 25 remote WebRTC connections can be sustained.
