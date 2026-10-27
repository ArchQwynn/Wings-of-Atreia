## Multiplayer Requirements

### 1. Core Architecture

- The existing VTT hosted on GitHub Pages remains the application entry point.
- The multiplayer implementation must be developed on `feature/vtt-peerjs-multiplayer` until it has been tested and approved for merging.
- The GM's browser is the authoritative host for the live session.
- Use a host-authoritative star topology: each player connects to the GM, rather than relying on players to synchronize authoritative game state directly with each other.
- Support approximately 6–10 participants per session, including the GM, unless later testing establishes a different practical limit.
- Players join through a shared invitation link and enter a display name. Avoid requiring players to configure network settings or manually establish peer connections.

### 2. Shared Tabletop State

The following information is shared and synchronized for authorized participants:

- **Active map/scene:** The GM-selected current map or scene is synchronized to the session.
- **Tokens:** Token placement, position, movement, orientation, and supported gameplay-relevant state changes.
- **Props and assets:** Placement, position, movement, orientation, and supported state changes for tabletop props and assets.
- **Accepted scene edits:** Supported changes to shared tabletop objects are validated by the GM and propagated to participants.
- **Session snapshots:** Joining and reconnecting participants receive the latest authoritative shared scene state, subject to visibility and permission rules.

A participant's local camera changes must never be interpreted as changes to shared scene state.

### 3. Camera Views and GM Synchronization

- By default, each participant controls their own camera view independently.
- GM Access must provide an option to **Synchronize Everyone's Camera View**.
- When the GM activates this option, the camera view of every connected participant is synchronized to match the GM's current camera view, including the supported camera position, viewing angle, rotation, and zoom.
- While synchronization is enabled, changes to the GM's camera view are propagated to all participants so their views continue to match the GM's view.
- Participants must not be able to override the synchronized view while the GM's synchronization option is enabled. Their camera controls may be temporarily restricted or their view may be corrected to match the GM.
- When the GM disables synchronization, participants regain independent control of their own camera views. Their cameras should remain at their current synchronized views until they choose to move them independently.
- The GM may enable or disable camera synchronization at any time during the session.
- Camera synchronization changes only camera presentation. It must never move tokens, props, assets, or otherwise modify shared tabletop state.
- Late-joining and reconnecting participants must follow the current GM setting: if synchronization is enabled, their camera should match the GM's current view; otherwise, they retain their own local camera preferences.
- The GM's synchronization setting is session-level presentation control, not a permanent change to each participant's personal camera preferences.

### 4. GM Authority and Permissions

- The GM's browser is the source of truth for accepted shared gameplay state.
- Player-originated changes are requests, not authoritative writes.
- The GM host validates each request against the relevant permissions and allowed actions before accepting it.
- Accepted changes are assigned an authoritative state revision and broadcast to connected participants.
- Rejected changes must not alter the authoritative shared state.
- Reconnecting clients must not overwrite newer authoritative state with stale local data.
- Display names are labels, not authentication credentials.
- Enabling synchronization makes all participants match the GM's camera, and disabling it restores independent camera control.

### 5. Visibility and Hidden Information

- Hidden tokens, props, assets, and other restricted information must not be disclosed to participants who are not permitted to see them.
- Hiding an object only through client-side rendering is not a security boundary.
- The trusted host must enforce permissions and filter snapshots and updates for each recipient where necessary.
- Reconnection and recovery must preserve the same visibility rules as normal gameplay synchronization.

### 6. Connection and Recovery Requirements

- Players should connect through a simple invitation link and display-name entry, with connection setup handled automatically.
- The session should detect lost connections and attempt reconnection automatically.
- The system must track host generations and authoritative state revisions to reject stale messages and outdated hosts.
- If the GM disconnects, the system should attempt the planned recovery process and restore a consistent session state where technically possible.
- Recovery must not allow two hosts to independently write authoritative state at the same time.
- PeerJS signaling reconnection alone is insufficient; gameplay data connections must also be re-established and synchronized.
- The exact recovery mechanism and any required external coordination service must be implemented and tested before automatic GM recovery is considered complete.

### 7. Compatibility and Safety

- Preserve the existing single-user VTT behavior while the multiplayer foundation is being developed.
- Keep multiplayer modules isolated until they have automated tests and integration coverage.
- Do not modify the live VTT entry point or integrate networking prematurely.
- Test existing maps, tokens, props/assets, scene management, and local camera controls after integration.
- Do not merge into `main` or deploy the multiplayer implementation until compatibility and multiplayer tests pass.

### 8. Acceptance Criteria

The multiplayer implementation is ready for broader testing when:

1. A GM can create a session and players can join using a link and display name.
2. The GM and players see the same active map and authorized shared tabletop objects.
3. Token and prop/asset placement and movement synchronize consistently.
4. Each participant can independently change their camera angle, position, rotation, and zoom without affecting anyone else.
5. Incoming shared-state updates do not reset local camera preferences.
6. Unauthorized actions and hidden information are correctly rejected or filtered.
7. Disconnections trigger reconnection and state resynchronization without accepting stale updates.
8. The intended GM-disconnection recovery behavior is tested, including prevention of conflicting authoritative hosts.
9. The existing VTT remains functional when multiplayer is unused.
10. The feature is reviewed and approved before merging into `main` or deploying.
