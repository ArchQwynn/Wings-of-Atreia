# Wings of Atreia VTT — PeerJS Integration Foundation

This directory is an isolated integration workspace on `feature/vtt-peerjs-integration`.

## Scope and safeguards

- Built from the current `main` branch, not from the prototype branch.
- No changes to the live VTT entry point, deployment, or `main`.
- GM is the only authoritative host. The VTT has GM and Player roles only; there is no Assistant GM role.
- Player actions are requests. The GM revalidates target existence, permissions, host generation, and scene revision before applying an approved action.
- Player snapshots must be filtered before transmission. GM notes/pins and hidden objects must never be sent to players.
- Camera state and measurements are participant-local. Tactical shapes are shared state.
- Multiplayer remains opt-in and must not affect normal local/offline VTT operation when inactive.

## Foundation modules

- `protocol.js`: versioned message envelopes and the 64 KiB message ceiling.
- `authority.js`: host-generation/revision fencing, action authorization helpers, join approval queue, and visibility filtering.
- `lifecycle.js`: explicit connection lifecycle transitions.
- `connection-harness.html`: standalone PeerJS diagnostic harness. It does not load or modify the VTT.

These are pure foundation helpers and a test harness. They are not yet connected to the VTT, do not authenticate a display name, do not provide a trusted host-election service, and do not implement automatic recovery.

## Next integration work

1. Add bounded chunked media transfer for map, token, and asset images (maximum supported media size 1.8 MiB; each transport message remains below 64 KiB).
2. Establish a shared-state serializer that includes validated token status, filters GM-private data, and excludes local presentation state.
3. Add a single authoritative mutation gateway and integrate GM-approved player movement requests.
4. Integrate assets with the approved visibility categories: GM Only, All Players, Specific Players, and Unassigned. Visibility and edit permission remain separate.
5. Add shared tactical shapes and GM-authoritative Undo/Redo; keep measurements local.
6. Wire the modules into the VTT only after isolated tests pass, then run regression and multi-participant tests.

## Local tests

```sh
node --test vtt-prototype/multiplayer/tests/*.test.js
```

Passing foundation tests do not establish that the VTT integration, real-world PeerJS networking, media transfer, or production security is complete.
