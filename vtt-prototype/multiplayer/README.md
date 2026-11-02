## Multiplayer Requirements

### 1. Core Architecture

- The existing VTT hosted on GitHub Pages remains the application entry point.
- The multiplayer implementation must be developed on `feature/vtt-peerjs-multiplayer` until it has been tested and approved for merging.
- The GM's browser is the authoritative host for the live session.
- Use a host-authoritative star topology: each player connects to the GM, rather than relying on players to synchronize authoritative game state directly with each other.
- Target capacity: 1 GM and up to 25 players (26 total connections including the GM). This is a design target; actual 25-remote-peer load capacity must be demonstrated through staged browser/network testing before production use.
- Every remote participant has the same Player role. The GM approves every join attempt and the host enforces one shared 25-player capacity limit, counting pending approvals so concurrent requests cannot overbook the session.
- Players join through a GM-provided invitation link and enter a display name.
- There is no role selector: every join request is a Player request, and the GM approval queue identifies each request as a player.
- Invitation links do not expire and may be reused. Reusing a link does not bypass entry approval: the GM must approve every join attempt before the player can access the session.
- The initial player interface is desktop-first. Mobile-responsive support is outside the initial interface scope unless separately approved.
- The initial player interface has no built-in chat and does not display GM controls.

### 2. Shared Tabletop State

The following information is shared and synchronized for authorized participants:

- **Active map/scene:** The GM-selected current map or scene is synchronized to the session, but the player interface does not show a separate scene-information panel.
- **Tokens:** Token placement, position, movement, orientation, and supported gameplay-relevant state changes.
- **Props and assets:** Placement, position, movement, orientation, and supported state changes for tabletop props and assets.
- **Accepted scene edits:** Supported changes to shared tabletop objects are validated by the GM and propagated to participants.
- **Session snapshots:** Newly approved participants receive the latest authoritative shared scene state, subject to visibility and permission rules.

A participant's local camera changes must never be interpreted as changes to shared scene state.

### 3. Camera Views and Future GM Synchronization

- Each participant controls their own camera view independently by default.
- Camera position, viewing angle, rotation, and zoom are local presentation state and must not modify shared tabletop objects.
- Shared-state updates must not reset a participant's local camera.
- A new session starts with each participant's normal local camera defaults; camera state does not need to carry across sessions.
- Optional GM-controlled **Synchronize Everyone's Camera View** functionality may be considered for a future version; it is not required for the initial player interface.
- If implemented later, the GM may enable or disable synchronization during a session. While enabled, participants follow the GM's supported camera view and cannot override it. When disabled, participants regain independent control, starting from their current view.
- Camera synchronization must only affect camera presentation. It must never move tokens, props, assets, or otherwise modify shared tabletop state.
- Late-joining participants must follow the current setting if the optional feature is implemented.
- The GM's synchronization setting is session-level presentation control, not a permanent change to each participant's personal camera preferences.

### 4. GM Authority and Permissions

- The GM's browser is the source of truth for accepted shared gameplay state.
- Player-originated changes that require approval are requests, not authoritative writes.
- The GM host validates each request against the relevant object, permissions, and allowed action before accepting it.
- Accepted changes are assigned an authoritative state revision and broadcast to connected participants.
- Rejected or cancelled requests must not alter authoritative shared state.
- Newly joining clients must not overwrite authoritative state with stale local data.
- Display names are labels, not authentication credentials.
- Authorization is scoped per object and per action. Visibility or selection does not itself grant permission to edit.
- Player controls and requests must not expose GM-only controls or restricted data.

### 5. Visibility and Hidden Information

- Hidden tokens, props, assets, and other restricted information must not be disclosed to participants who are not permitted to see them.
- Hiding an object only through client-side rendering is not a security boundary.
- The trusted host must enforce permissions and filter snapshots and updates for each recipient where necessary.
- New-session joins must preserve the same visibility rules as normal gameplay synchronization.

### 6. Player-Side Interface and Permissions

#### Session entry

- Players open a GM-provided invitation link and enter a display name.
- The link does not expire and may be reused.
- The GM must approve every join attempt. A valid or previously used link does not grant immediate access or bypass approval.
- The interface must distinguish at least awaiting approval, approved, and denied entry states.
- Invalid links and connection failures must be communicated clearly.

#### Player layout

- The tabletop remains the primary workspace.
- The initial layout is desktop-first.
- The header shows the player's own connection status but does not show a participant roster or separate scene-information panel.
- No built-in player chat is included.
- No GM controls or GM-only administration tools are visible to players.
- The character panel is compact and collapsible. Its exact displayed fields are deferred for later discussion.
- Character management belongs to the separate Character Sheet/Manager. The VTT must not duplicate the Character Manager's character-management responsibilities. Players may switch among characters assigned to them; exact character-panel content and switching presentation remain to be specified separately.

#### Token movement requests

- Players request movement instead of directly changing authoritative token positions.
- The player indicates a proposed destination using a destination marker. The shared token remains at its authoritative position until the GM approves the request.
- A persistent, compact request queue shows each request's type, target, proposed change, and status.
- Players may cancel their own requests while they remain pending and before the GM decision is being applied.
- Approval, rejection, and cancellation must be reflected clearly in the queue.
- Requests must be revalidated if the target token, scene, or relevant state changes before resolution.
- Duplicate submissions should be prevented or safely deduplicated.

#### Props and assets

- Players request changes to props and assets instead of directly changing shared placement.
- The request identifies the target asset and the proposed operation, such as move, rotate, resize, or change state, when that operation is supported.
- Shared state changes only after approval, unless the GM has explicitly granted a specific immediate permission for that object and action.
- General player-side creation and deletion of shared objects are denied by default.

#### Authorized interaction

- Interaction permissions are granted per object and per action.
- The interface must not infer edit permission from visibility or selection.
- The host must validate each shared-state mutation; client-side hiding or disabling of controls is not sufficient security.
- Only the explicitly authorized action may be performed. Other actions on the same object remain unavailable unless separately authorized.

#### Request queue and session restart

- The request queue persists pending requests during the active session and displays their status.
- A session restart creates a new session; pending requests from the ended session are not replayed or restored.
- The interface must distinguish pending, approved, rejected, cancelled, unavailable, and disconnected states where applicable.
- A request cannot be cancelled once its decision is being applied; the authoritative result resolves any race between cancellation and approval.

### 7. Connection and Recovery Requirements

- Automatic signaling recovery and automatic session restoration are intentionally not implemented.
- If the GM's PeerJS signaling connection or the active session connection is lost, the current session ends. The GM starts a new session, which generates a new session ID and invitation link.
- Players use the new invitation link and submit fresh join requests; the GM approves every player again.
- No `peer.reconnect()` calls, automatic retry loops, automatic host recovery, or automatic session restoration are permitted.
- Host-generation and authoritative revision guards remain in place to reject stale messages within an active session; they are not a recovery or host-election mechanism.
- Local camera state is not required to survive a session restart; players simply rejoin the new session.

### 8. Compatibility and Safety

- Preserve the existing single-user VTT behavior while the multiplayer foundation is being developed.
- Keep multiplayer modules isolated until they have automated tests and integration coverage.
- Do not modify the live VTT entry point or integrate networking prematurely.
- Test existing maps, tokens, props/assets, scene management, and local camera controls after integration.
- Do not merge into `main` or deploy the multiplayer implementation until compatibility and multiplayer tests pass.
- This specification documents approved behavior; it does not itself authorize implementation, live VTT modification, networking integration, merge, or deployment.

### 9. Acceptance Criteria

The player interface and multiplayer implementation are ready for broader testing when:

1. A GM-provided invitation link can be reused without expiring, and every join attempt still requires GM approval.
2. The player interface has a desktop-first layout, no participant roster, no separate scene-information panel, no built-in chat, and no visible GM controls.
3. The GM and players see the same active map and authorized shared tabletop objects.
4. Token movement requests show a destination marker and do not move the shared token before approval.
5. Prop and asset changes follow the request flow unless a specific immediate action has been authorized.
6. Players can cancel their own pending requests before the GM decision is being applied.
7. The request queue clearly reflects pending, approved, rejected, and cancelled outcomes.
8. Character details remain in the separate Character Sheet/Manager; exact compact panel fields are deferred.
9. Each participant can independently change their camera view without affecting anyone else's view or shared tabletop state. Optional GM camera synchronization is a future feature, not an initial requirement.
10. Unauthorized actions and hidden information are correctly rejected or filtered before delivery.
11. A signaling or session connection loss ends the current session without automatic recovery; the GM can start a new session and players can rejoin through its new invitation link, subject to fresh GM approval.
12. No automatic host recovery, peer reconnection, or stale request replay occurs.
13. The existing VTT remains functional when multiplayer is unused.
14. The feature is reviewed and approved before merging into `main` or deploying.


### 10. Isolated Foundation Guards and Local Tests

The following pure helpers are available for future integration:

- `authority.js` checks host-generation and revision fences, compares expected revisions before advancing, validates per-actor/per-object/per-action permissions, tracks explicit join approval decisions, and filters object arrays through a visibility predicate.
- The helper modules are not yet wired into the VTT or a network transport. They do not authenticate users, guarantee that a visibility predicate is correct, or elect a replacement GM host.
- `activateGeneration` deliberately requires an explicit external authorization flag. This is a guardrail, not a distributed recovery protocol; a trusted coordinator or another tested recovery mechanism is still required to prevent split-brain hosts.
- Action authorization is a validation helper, not the complete request lifecycle. The eventual GM integration must re-check target existence, permissions, scene identity, and relevant state immediately when resolving a request.

Run the isolated Node.js tests from the repository root:

```sh
node --test vtt-prototype/multiplayer/tests/*.test.js
```

The tests cover message envelope validation, message size limits, legal lifecycle transitions, host-generation fencing, stale revision rejection, compare-and-swap revision advancement, authorized and unauthorized actor/object/action combinations, missing targets, explicit join approval states, Player versus Specific Player(s) visibility filtering with GM-only and unassigned objects excluded, and parsing the harness's embedded scripts. Passing these tests does not establish that multiplayer networking or VTT integration is complete.


### 11. Isolated GM-to-Player Connection Harness

The harness is a standalone HTML file with the protocol helper embedded. You can download `connection-harness.html` and open it in a browser for a same-device test if your browser permits WebRTC from local files. For more reliable testing, serve it over HTTP. It loads the pinned PeerJS browser library from its CDN, so internet access is required.

For a local checkout with Python installed, run this from the repository root:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000/vtt-prototype/multiplayer/connection-harness.html` in one browser and choose **Start as GM**. Open the same URL in a second browser window (or another device that can reach the test server), enter the GM session ID and a display name, then request to join. The GM must explicitly approve the request. The generated invitation link can also be used when the harness is hosted at a URL reachable by both browsers.

After approval, send a harmless test request from the player browser. Approve or reject it from the GM console and verify the player receives the result. Approved test requests advance a synthetic revision and send a test-only state update. To test session restart, disconnect the GM's PeerJS signaling connection: the old session must end, the GM starts a new session, and players use the new invitation link. Each player must receive fresh GM approval.

**Harness boundaries:**

- This is a transport/handshake test only. It does not import the VTT, load scenes, or synchronize actual characters, tokens, props, or assets.
- The harness capacity test supports up to 25 approved or pending players, plus the GM. Pending approvals reserve a slot. Every approved participant has the same Player role and receives a unique synthetic actor identity. The test fixture permits that actor to move/interact with one synthetic token; separate buttons submit an unauthorized action and a request for a nonexistent target. This validates the harness's sample authorization path and admission logic only; it does not prove 25 remote WebRTC connections can be sustained or connect permissions to real VTT objects.
- The GM browser is the temporary session coordinator, but no secure host election or automatic GM recovery exists. Closing the GM tab ends the test session.
- PeerJS signaling is a public third-party service in this harness. Network availability, browser WebRTC policy, and restrictive firewalls may affect connection success.
- Display names and peer IDs are not authentication. Do not use this harness for real campaign data or treat its approval UI as production security.
- The harness has not been integrated with the main VTT. Browser-based two-device testing is still required; adding the file does not itself prove the live connection works.

Visibility test added to the isolated harness:

- The GM can click **Send visibility test snapshot + update** after approving players.
- The harness creates four synthetic objects: Player-assigned, Specific Player(s), GM Only, and Unassigned.
- The first approved player is the Specific Player(s) recipient. Each recipient receives a separately filtered snapshot and update. The GM filters the object array before calling the network send function.
- Player consoles display the IDs received in the snapshot and update. With two players, the first should receive the Player-assigned and Specific Player(s) objects; the second should receive only the Player-assigned object. Neither should receive GM-only or Unassigned objects.
- This is a synthetic policy test only; it does not yet connect visibility filtering to real VTT token assignment data or production scene serialization.

Harness guard behavior added during the branch audit:

- Approved-peer messages pass the embedded authority guard; messages from a different host generation or older revision are rejected.
- Test requests must match the current host generation and revision when received and again when the GM approves them. A request made stale by another approved request is marked stale instead of advancing state.
- Revision changes use compare-and-swap semantics; a duplicate approval cannot advance the same revision twice.
- Duplicate message IDs, test request IDs, and join-attempt IDs are rejected. A reused join-attempt ID remains rejected after the original request is decided or the connection closes.
- Disconnected participants are removed from the active approved list; their pending test requests are cancelled. Any new join requires a fresh GM approval.
- The connection harness now includes a per-recipient visibility test that filters Player, Specific Player(s), GM Only, and Unassigned synthetic objects before sending both snapshots and updates.
- The connection harness sends host heartbeats every 5 seconds. If a participant does not answer within 16 seconds, the GM marks that participant disconnected, removes them from the active approved list, cancels their pending test requests, and requires a fresh join request and GM approval. The PeerJS `close` event remains an additional immediate cleanup path. Heartbeats detect participant loss; they do not trigger reconnection.
- The embedded guard is duplicated from the pure authority helper so the harness remains a single-file test page. Keep both implementations aligned when making future changes.
- Player `ACTION_REQUEST` messages are now checked against the GM-approved connection's server-assigned synthetic actor ID, the requested synthetic target, and the exact permitted action before they enter the GM queue. Client-supplied actor IDs are ignored. The same authorization is checked again when the GM approves the request.
- The harness fixture intentionally permits only `move` and `interact` on `token-lyra`; it rejects `delete` on that token and any action targeting an object absent from the synthetic scene. These are harness-only fixtures, not real character or VTT permissions.

Suggested test checklist:
1. GM starts a session and receives a session ID and invitation link.
2. Player connects and remains blocked pending GM approval.
3. GM rejection is shown to the player and does not grant access.
4. GM approval lets the player receive the test snapshot.
5. Player test request reaches the GM; rejection leaves the revision unchanged.
6. Approval increments the synthetic revision and the player receives the result/update.
7. Two requests created at the same revision are tested: after one is approved, the other must be marked stale.
8. Player disconnects; the GM participant list removes the player either on the PeerJS close event or after the heartbeat timeout (up to approximately 16 seconds), and pending requests are cancelled.
9. A session restart requires the GM to create a new session and share its new invitation link. Players join that session and receive fresh GM approval; automatic recovery and retry are not performed.
10. Unapproved peers, duplicate messages/requests, old host generations, and stale revisions are rejected.
11. A second approved player receives a broadcast update after a synthetic revision advances.
12. All join requests are treated as Player requests and the GM approves or rejects each one.
13. The shared 25-player limit is enforced, including pending approval slots; a 26th player is refused.
14. Approve two test players, send the visibility test, and verify the first receives the Player-assigned and Specific Player(s) objects while the second receives only the Player-assigned object; neither receives GM Only or Unassigned objects.

Automated test command (run from the repository root): `node --test vtt-prototype/multiplayer/tests/*.test.js`. The test suite now contains 22 automated cases, including a syntax check for both embedded harness scripts. Run the command above after updating your local feature branch; the live two-browser authorization scenarios still require manual testing.
