(function (root) {
  'use strict';

  const Foundation = root.WoAMultiplayerFoundation;
  const VTT = root.WoAVTT;
  const $ = id => document.getElementById(id);
  const MAX_PLAYERS = 25;
  const HEARTBEAT_INTERVAL_MS = 5000;
  const HEARTBEAT_TIMEOUT_MS = 16000;
  const state = {
    role: null, peer: null, sessionId: null, hostGeneration: 1, revision: 0,
    authority: null, connections: new Map(), pendingJoins: new Map(),
    approved: new Map(), pendingActions: new Map(), playerPendingActions: new Map(),
    seenMessageIds: new Set(), seenJoinAttemptIds: new Set(), seenRequestIds: new Set(),
    heartbeatTimer: null, playerConnection: null, playerApproved: false,
    playerName: '', signalingConnected: false, suppressLocalBroadcast: false,
    lastFingerprint: '', mediaTransfers: new Map(), mediaCacheByPeer: new Map()
  };

  function makeId(prefix) {
    const random = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    return (prefix || 'woa') + '-' + random;
  }
  function emit(name, detail) {
    root.dispatchEvent(new CustomEvent('woa:' + name, { detail: detail || {} }));
  }
  function setStatus(message, status) {
    const el = $('mp-status');
    if (el) { el.textContent = message; el.dataset.state = status || 'idle'; }
    emit('multiplayer-status', { message, status: status || 'idle', role: state.role });
  }
  function createEnvelope(type, payload, revision) {
    if (!Foundation) throw new Error('Multiplayer protocol module is unavailable.');
    return Foundation.createMessage(type, payload, {
      hostGeneration: state.hostGeneration,
      revision: Number.isSafeInteger(revision) ? revision : state.revision
    });
  }
  function send(conn, type, payload, revision) {
    if (!conn || !conn.open) throw new Error('Multiplayer data connection is not open.');
    conn.send(createEnvelope(type, payload, revision));
  }
  function parseMessage(data) {
    let message;
    try { message = typeof data === 'string' ? JSON.parse(data) : data; }
    catch (_) { return { ok: false, error: 'Malformed message.' }; }
    const result = Foundation.validateMessage(message);
    if (!result.ok) return result;
    if (state.seenMessageIds.has(message.messageId)) return { ok: false, error: 'Duplicate message.' };
    state.seenMessageIds.add(message.messageId);
    if (state.seenMessageIds.size > 3000) state.seenMessageIds.delete(state.seenMessageIds.values().next().value);
    return { ok: true, message };
  }
  function ensurePeerJS() {
    if (typeof root.Peer === 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-woa-peerjs]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Could not load PeerJS.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
      script.async = true;
      script.dataset.woaPeerjs = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load PeerJS. Check your internet connection and try again.'));
      document.head.appendChild(script);
    });
  }
  function setControls(mode) {
    const host = $('mp-host'), join = $('mp-join'), end = $('mp-end');
    if (host) host.disabled = mode !== 'idle';
    if (join) join.disabled = mode !== 'idle';
    if (end) end.disabled = mode === 'idle';
    const name = $('mp-player-name'), room = $('mp-room-id');
    if (name) name.disabled = mode !== 'idle';
    if (room) room.disabled = mode !== 'idle';
    if (VTT) VTT.setSessionLock(mode !== 'idle');
  }
  function renderJoinQueue() {
    const wrap = $('mp-join-queue-wrap'), list = $('mp-join-queue');
    if (!wrap || !list) return;
    wrap.hidden = state.role !== 'gm' || state.pendingJoins.size === 0;
    list.replaceChildren();
    for (const [peerId, item] of state.pendingJoins) {
      const row = document.createElement('div'); row.className = 'mp-entry';
      const title = document.createElement('div'); title.className = 'mp-entry-title'; title.textContent = item.name;
      const detail = document.createElement('div'); detail.className = 'mp-entry-detail'; detail.textContent = 'Player · awaiting GM approval';
      const actions = document.createElement('div'); actions.className = 'mp-entry-actions';
      const approve = document.createElement('button'); approve.className = 'approve'; approve.textContent = 'Approve';
      approve.addEventListener('click', () => decideJoin(peerId, true));
      const reject = document.createElement('button'); reject.className = 'reject'; reject.textContent = 'Reject';
      reject.addEventListener('click', () => decideJoin(peerId, false));
      actions.append(approve, reject); row.append(title, detail, actions); list.append(row);
    }
  }
  function renderPlayers() {
    const wrap = $('mp-players-wrap'), list = $('mp-players');
    if (!wrap || !list) return;
    wrap.hidden = state.role !== 'gm' || state.approved.size === 0;
    list.replaceChildren();
    for (const player of state.approved.values()) {
      const row = document.createElement('div'); row.className = 'mp-entry';
      const title = document.createElement('div'); title.className = 'mp-entry-title'; title.textContent = player.name;
      const detail = document.createElement('div'); detail.className = 'mp-entry-detail'; detail.textContent = 'Player · connected';
      row.append(title, detail); list.append(row);
    }
  }
  function describeAction(item) {
    const data = item.data || {};
    const destination = data.destination;
    const path = Array.isArray(data.path) ? data.path.length + ' route points' : '2D route submitted';
    const altitude = destination && Number.isFinite(Number(destination.z)) ? ' · altitude ' + destination.z + ' ft' : '';
    const coords = destination ? ' · destination (' + destination.x + ', ' + destination.y + ')' : '';
    return item.playerName + ' · ' + item.action + ' · ' + path + coords + altitude;
  }
  function renderActions() {
    const wrap = $('mp-requests-wrap'), list = $('mp-requests');
    if (!wrap || !list) return;
    wrap.hidden = state.role !== 'gm' || state.pendingActions.size === 0;
    list.replaceChildren();
    for (const [id, item] of state.pendingActions) {
      const row = document.createElement('div'); row.className = 'mp-entry';
      const title = document.createElement('div'); title.className = 'mp-entry-title'; title.textContent = item.playerName + ' — movement request';
      const detail = document.createElement('div'); detail.className = 'mp-entry-detail'; detail.textContent = describeAction(item);
      const actions = document.createElement('div'); actions.className = 'mp-entry-actions';
      const approve = document.createElement('button'); approve.className = 'approve'; approve.textContent = 'Approve';
      approve.addEventListener('click', () => approveAction(id));
      const reject = document.createElement('button'); reject.className = 'reject'; reject.textContent = 'Reject';
      reject.addEventListener('click', () => rejectAction(id, 'The GM rejected the request.'));
      actions.append(approve, reject); row.append(title, detail, actions); list.append(row);
    }
  }
  function participantCount() { return state.approved.size + state.pendingJoins.size; }
  function renderAll() { renderJoinQueue(); renderPlayers(); renderActions(); }
  function setInviteLink(peerId) {
    const wrap = $('mp-invite-wrap'), input = $('mp-invite-link');
    if (!wrap || !input) return;
    input.value = root.location.origin + root.location.pathname + '?room=' + encodeURIComponent(peerId);
    wrap.hidden = false;
  }
  function startHeartbeat() {
    if (state.heartbeatTimer) root.clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = root.setInterval(() => {
      const now = Date.now();
      for (const [peerId, player] of state.approved) {
        if (!player.conn.open || now - player.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
          removeParticipant(peerId, 'Heartbeat timeout. Player must rejoin and receive fresh approval.');
          continue;
        }
        try { send(player.conn, 'PING', { at: now }); }
        catch (_) { removeParticipant(peerId, 'Heartbeat send failed.'); }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
  function stopHeartbeat() {
    if (state.heartbeatTimer) root.clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
  function removeParticipant(peerId, reason) {
    const player = state.approved.get(peerId);
    if (!player) return;
    state.approved.delete(peerId);
    state.mediaCacheByPeer.delete(peerId);
    for (const [id, request] of state.pendingActions) {
      if (request.peerId === peerId) state.pendingActions.delete(id);
    }
    try { player.conn.close(); } catch (_) {}
    renderAll();
    emit('participant-left', { name: player.name, reason });
  }
  const MEDIA_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm1sAAAAASUVORK5CYII=';
  const MEDIA_CHUNK_CHARS = 42000;
  const MAX_MEDIA_BASE64_CHARS = 2400000;
  function mediaHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16);
  }
  function prepareSceneForTransport(scene, peerId) {
    const copy = JSON.parse(JSON.stringify(scene));
    let cache = state.mediaCacheByPeer.get(peerId);
    if (!cache) { cache = new Map(); state.mediaCacheByPeer.set(peerId, cache); }
    const media = [];
    function extract(key, value, setter) {
      if (typeof value !== 'string' || !/^data:image\/(webp|png|jpeg);base64,/.test(value)) return;
      const base64 = value.slice(value.indexOf(',') + 1);
      if (base64.length > MAX_MEDIA_BASE64_CHARS) throw new Error('An image exceeds the 1.8 MiB multiplayer media limit.');
      const hash = mediaHash(value);
      if (cache.get(key) !== hash) { media.push({ key, value, hash }); cache.set(key, hash); }
      setter(MEDIA_PLACEHOLDER);
    }
    if (copy.map) extract('map', copy.map.image, value => { copy.map.image = value; });
    (copy.tokens || []).forEach(token => {
      extract('token:' + token.id + ':image', token.image, value => { token.image = value; });
      if (Array.isArray(token.imageSlots)) token.imageSlots.forEach((value, index) => extract('token:' + token.id + ':slot:' + index, value, next => { token.imageSlots[index] = next; }));
    });
    (copy.assets || []).forEach(asset => {
      extract('asset:' + asset.id + ':image', asset.image, value => { asset.image = value; });
      if (Array.isArray(asset.imageSlots)) asset.imageSlots.forEach((value, index) => extract('asset:' + asset.id + ':slot:' + index, value, next => { asset.imageSlots[index] = next; }));
    });
    return { scene: copy, media };
  }
  function sendMediaChunks(conn, media) {
    for (const item of media) {
      const match = item.value.match(/^data:(image\/(?:webp|png|jpeg));base64,/);
      if (!match) continue;
      const base64 = item.value.slice(item.value.indexOf(',') + 1);
      const total = Math.ceil(base64.length / MEDIA_CHUNK_CHARS);
      if (!total || total > 64) throw new Error('Image transfer exceeds the supported chunk count.');
      const transferId = makeId('media');
      for (let index = 0; index < total; index++) {
        send(conn, 'MEDIA_CHUNK', {
          transferId, key: item.key, hash: item.hash, index, total,
          mimeType: match[1], data: base64.slice(index * MEDIA_CHUNK_CHARS, (index + 1) * MEDIA_CHUNK_CHARS)
        });
      }
    }
  }
  function sendSnapshot(conn, playerName, type) {
    const prepared = prepareSceneForTransport(VTT.snapshotForPlayer(playerName), conn.peer);
    send(conn, type || 'STATE_SNAPSHOT', { scene: prepared.scene, displayName: playerName });
    try { sendMediaChunks(conn, prepared.media); }
    catch (error) { const cache = state.mediaCacheByPeer.get(conn.peer); prepared.media.forEach(item => cache && cache.delete(item.key)); throw error; }
  }
  function receiveMediaChunk(payload) {
    const p = payload || {};
    if (typeof p.transferId !== 'string' || typeof p.key !== 'string' || typeof p.hash !== 'string' ||
        !Number.isInteger(p.index) || !Number.isInteger(p.total) || p.total < 1 || p.total > 64 ||
        p.index < 0 || p.index >= p.total || !['image/png', 'image/jpeg', 'image/webp'].includes(p.mimeType) ||
        typeof p.data !== 'string' || p.data.length > MEDIA_CHUNK_CHARS) return;
    let transfer = state.mediaTransfers.get(p.transferId);
    if (!transfer) {
      if (state.mediaTransfers.size >= 32) return;
      transfer = { key: p.key, hash: p.hash, mimeType: p.mimeType, total: p.total, chunks: new Array(p.total), received: 0 };
      state.mediaTransfers.set(p.transferId, transfer);
    }
    if (transfer.key !== p.key || transfer.hash !== p.hash || transfer.mimeType !== p.mimeType || transfer.total !== p.total) {
      state.mediaTransfers.delete(p.transferId); return;
    }
    if (transfer.chunks[p.index] === undefined) { transfer.chunks[p.index] = p.data; transfer.received++; }
    if (transfer.received !== transfer.total) return;
    const base64 = transfer.chunks.join('');
    state.mediaTransfers.delete(p.transferId);
    if (base64.length > MAX_MEDIA_BASE64_CHARS) return;
    const dataUrl = 'data:' + transfer.mimeType + ';base64,' + base64;
    if (mediaHash(dataUrl) !== transfer.hash) return;
    VTT.applyRemoteMedia(transfer.key, dataUrl);
    emit('media-received', { key: transfer.key });
  }
  function decideJoin(peerId, approved) {
    const item = state.pendingJoins.get(peerId);
    if (!item) return;
    state.pendingJoins.delete(peerId);
    if (!approved) {
      try { send(item.conn, 'JOIN_REJECTED', { reason: 'The GM declined this join request.' }); } catch (_) {}
      try { item.conn.close(); } catch (_) {}
      renderAll(); return;
    }
    if (state.approved.size >= MAX_PLAYERS) {
      try { send(item.conn, 'JOIN_REJECTED', { reason: 'The session is full (25 players maximum).' }); } catch (_) {}
      try { item.conn.close(); } catch (_) {}
      renderAll(); return;
    }
    const actorId = makeId('actor');
    const player = { name: item.name, actorId, conn: item.conn, lastPongAt: Date.now() };
    state.approved.set(peerId, player);
    try {
      send(item.conn, 'JOIN_ACCEPTED', { displayName: item.name, role: 'player', actorId, hostGeneration: state.hostGeneration });
      sendSnapshot(item.conn, item.name, 'STATE_SNAPSHOT');
      emit('participant-joined', { name: item.name, actorId });
    } catch (error) {
      state.approved.delete(peerId);
      try { item.conn.close(); } catch (_) {}
      setStatus('Could not send the initial scene snapshot: ' + error.message, 'error');
    }
    renderAll();
  }
  function requestContext(item, player) {
    const permissions = {};
    permissions[player.actorId] = {};
    permissions[player.actorId][item.objectId] = {};
    permissions[player.actorId][item.objectId][item.action] = VTT.canPlayerPerform(player.name, item.objectId, item.action);
    return { targetExists: VTT.targetExists(item.objectId), permissions: permissions };
  }
  function receiveHostMessage(conn, message) {
    if (message.type === 'JOIN_REQUEST') {
      if (state.approved.has(conn.peer) || state.pendingJoins.has(conn.peer)) return;
      const payload = message.payload || {};
      const name = String(payload.displayName || '').trim().slice(0, 40);
      const attemptId = String(payload.attemptId || '');
      if (!name || attemptId.length < 8 || attemptId.length > 100 || state.seenJoinAttemptIds.has(attemptId)) {
        try { send(conn, 'JOIN_REJECTED', { reason: 'Invalid or duplicate join request.' }); } catch (_) {}
        try { conn.close(); } catch (_) {}
        return;
      }
      if (participantCount() >= MAX_PLAYERS) {
        try { send(conn, 'JOIN_REJECTED', { reason: 'The session is full (25 players maximum).' }); } catch (_) {}
        try { conn.close(); } catch (_) {}
        return;
      }
      state.seenJoinAttemptIds.add(attemptId);
      state.pendingJoins.set(conn.peer, { conn, name, attemptId });
      renderAll();
      emit('join-request', { peerId: conn.peer, name });
      return;
    }
    const player = state.approved.get(conn.peer);
    if (!player || player.conn !== conn) return;
    if (message.type === 'PONG') { player.lastPongAt = Date.now(); return; }
    if (message.type === 'STATE_SNAPSHOT_REQUEST') { sendSnapshot(conn, player.name, 'STATE_SNAPSHOT'); return; }
    if (message.type === 'ACTION_CANCEL') {
      const requestId = String(message.payload && message.payload.requestId || '');
      const request = state.pendingActions.get(requestId);
      if (request && request.peerId === conn.peer) {
        state.pendingActions.delete(requestId);
        try { send(conn, 'ACTION_RESULT', { requestId, status: 'cancelled', revision: state.revision }); } catch (_) {}
        renderActions(); emit('action-cancelled', { requestId, playerName: player.name });
      }
      return;
    }
    if (message.type !== 'ACTION_REQUEST') return;
    const payload = message.payload || {};
    const requestId = String(payload.requestId || '');
    const objectId = String(payload.objectId || '');
    const action = String(payload.action || '');
    if (!requestId || state.seenRequestIds.has(requestId) || !objectId || !action) return;
    if (message.hostGeneration !== state.hostGeneration || message.revision !== state.revision) {
      try { send(conn, 'ACTION_RESULT', { requestId, status: 'stale', revision: state.revision, reason: 'The scene changed. Please refresh and submit again.' }); } catch (_) {}
      return;
    }
    const request = {
      id: requestId, peerId: conn.peer, actorId: player.actorId, playerName: player.name,
      objectId, action, data: payload.data && typeof payload.data === 'object' ? payload.data : {},
      hostGeneration: message.hostGeneration, baseRevision: message.revision, status: 'pending'
    };
    const authorization = state.authority.authorizeAction(request, requestContext(request, player));
    if (!authorization.ok) {
      try { send(conn, 'ACTION_RESULT', { requestId, status: 'rejected', revision: state.revision, reason: authorization.error || authorization.code }); } catch (_) {}
      return;
    }
    state.seenRequestIds.add(requestId);
    state.pendingActions.set(requestId, request);
    renderActions();
    emit('action-request', { request });
  }
  function handleIncoming(conn) {
    state.connections.set(conn.peer, conn);
    conn.on('data', data => {
      const parsed = parseMessage(data);
      if (!parsed.ok) return;
      receiveHostMessage(conn, parsed.message);
    });
    conn.on('close', () => {
      state.connections.delete(conn.peer);
      state.pendingJoins.delete(conn.peer);
      removeParticipant(conn.peer, 'Player disconnected.');
      renderAll();
    });
    conn.on('error', error => console.warn('PeerJS data connection error:', error));
  }
  async function hostSession() {
    if (state.role) throw new Error('A multiplayer session is already active.');
    if (!VTT || !Foundation) throw new Error('The VTT multiplayer bridge is not ready.');
    await ensurePeerJS();
    state.role = 'gm';
    state.authority = Foundation.createAuthority({ hostGeneration: 1, revision: 0 });
    state.revision = 0;
    state.lastFingerprint = VTT.sharedFingerprint();
    VTT.setIdentity('gm');
    VTT.setSessionLock(true);
    setControls('active');
    setStatus('Starting GM session…', 'pending');
    const peer = new root.Peer();
    state.peer = peer;
    peer.on('open', id => {
      state.sessionId = id;
      state.signalingConnected = true;
      setInviteLink(id);
      setStatus('Hosting · signaling connected · awaiting players', 'connected');
      startHeartbeat();
      emit('host-ready', { sessionId: id, inviteLink: $('mp-invite-link')?.value || '' });
    });
    peer.on('connection', handleIncoming);
    peer.on('disconnected', () => setStatus('GM signaling disconnected. Existing data links may remain open; do not close this tab.', 'pending'));
    peer.on('close', () => { if (state.role === 'gm') closeSession('The GM session ended.'); });
    peer.on('error', error => setStatus('PeerJS error: ' + (error.message || error.type || 'unknown error'), 'error'));
  }
  function roomIdFromInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, root.location.href);
      return url.searchParams.get('room') || raw;
    } catch (_) { return raw; }
  }
  async function joinSession(roomValue, displayName) {
    if (state.role) throw new Error('A multiplayer session is already active.');
    if (!VTT || !Foundation) throw new Error('The VTT multiplayer bridge is not ready.');
    const roomId = roomIdFromInput(roomValue);
    const name = String(displayName || '').trim().slice(0, 40);
    if (!roomId || !name) throw new Error('Enter the GM invitation link or session ID and your display name.');
    await ensurePeerJS();
    state.role = 'player';
    state.playerName = name;
    state.hostGeneration = 0;
    state.revision = 0;
    VTT.setIdentity('player', name);
    VTT.setSessionLock(true);
    setControls('active');
    setStatus('Connecting to GM…', 'pending');
    const peer = new root.Peer();
    state.peer = peer;
    peer.on('open', () => {
      state.signalingConnected = true;
      const conn = peer.connect(roomId, { reliable: true, serialization: 'json', metadata: { displayName: name } });
      state.playerConnection = conn;
      conn.on('open', () => {
        const attemptId = makeId('join');
        send(conn, 'JOIN_REQUEST', { displayName: name, attemptId }, 0);
        setStatus('Join request sent · waiting for GM approval', 'pending');
      });
      conn.on('data', data => {
        const parsed = parseMessage(data);
        if (!parsed.ok) return;
        receivePlayerMessage(conn, parsed.message);
      });
      conn.on('close', () => {
        state.playerApproved = false;
        setStatus('Session ended · ask the GM for a new invitation link', 'error');
        emit('session-ended', { reason: 'The GM data connection closed.' });
        resetPlayerSession();
      });
      conn.on('error', error => setStatus('Connection error: ' + error.message, 'error'));
    });
    peer.on('disconnected', () => setStatus('Player signaling disconnected. Automatic reconnection is disabled.', 'pending'));
    peer.on('close', () => { if (state.role === 'player') resetPlayerSession(); });
    peer.on('error', error => setStatus('PeerJS error: ' + (error.message || error.type || 'unknown error'), 'error'));
  }
  function receivePlayerMessage(conn, message) {
    if (message.type === 'JOIN_ACCEPTED') {
      state.playerApproved = true;
      state.hostGeneration = message.hostGeneration;
      state.revision = message.revision;
      VTT.setIdentity('player', state.playerName);
      setStatus('Connected · approved by GM', 'connected');
      const notice = $('mp-player-notice');
      if (notice) { notice.hidden = false; notice.textContent = 'You are connected to the GM session. Your token actions are subject to GM approval.'; }
      emit('join-accepted', { displayName: state.playerName });
      return;
    }
    if (message.type === 'JOIN_REJECTED') {
      state.playerApproved = false;
      setStatus('Join rejected: ' + String(message.payload.reason || 'The GM declined.'), 'error');
      return;
    }
    if (!state.playerApproved) return;
    if (message.hostGeneration !== state.hostGeneration) return;
    if (message.type === 'PING') { try { send(conn, 'PONG', { at: Date.now() }, message.revision); } catch (_) {} return; }
    if (message.type === 'STATE_SNAPSHOT' || message.type === 'STATE_UPDATE') {
      if (message.type === 'STATE_UPDATE' && message.revision <= state.revision) return;
      if (message.type === 'STATE_UPDATE' && message.revision !== state.revision + 1) {
        try { send(conn, 'STATE_SNAPSHOT_REQUEST', { requestedAt: Date.now(), reason: 'revision-gap' }); } catch (_) {}
        return;
      }
      try {
        VTT.applyRemoteSnapshot(message.payload.scene, state.playerName);
        state.revision = message.revision;
        emit('scene-synchronized', { revision: state.revision, snapshot: message.type === 'STATE_SNAPSHOT' });
      } catch (error) { setStatus('Could not apply GM scene update: ' + error.message, 'error'); }
      return;
    }
    if (message.type === 'MEDIA_CHUNK') { receiveMediaChunk(message.payload); return; }
    if (message.type === 'ACTION_RESULT') {
      const id = String(message.payload.requestId || '');
      state.playerPendingActions.delete(id);
      emit('action-result', message.payload);
      return;
    }
    if (message.type === 'SESSION_CLOSED') {
      setStatus('The GM ended this session.', 'error');
      try { conn.close(); } catch (_) {}
      resetPlayerSession();
    }
  }
  function resetPlayerSession() {
    if (state.role !== 'player') return;
    const oldPeer = state.peer;
    state.role = null; state.playerApproved = false; state.playerConnection = null;
    state.peer = null; state.sessionId = null; state.playerPendingActions.clear(); state.mediaTransfers.clear();
    try { oldPeer && oldPeer.destroy(); } catch (_) {}
    VTT.setSessionLock(false);
    const notice = $('mp-player-notice'); if (notice) notice.hidden = true;
    setControls('idle');
  }
  function broadcastState() {
    if (state.role !== 'gm' || !state.authority) return false;
    const advanced = state.authority.advanceRevision(state.hostGeneration, state.revision);
    if (!advanced.ok) { setStatus('Could not advance authoritative revision: ' + advanced.code, 'error'); return false; }
    state.revision = advanced.version.revision;
    state.lastFingerprint = VTT.sharedFingerprint();
    for (const player of state.approved.values()) {
      if (!player.conn.open) continue;
      try {
        const prepared = prepareSceneForTransport(VTT.snapshotForPlayer(player.name), player.conn.peer);
        send(player.conn, 'STATE_UPDATE', { scene: prepared.scene });
        try { sendMediaChunks(player.conn, prepared.media); }
        catch (error) { const cache = state.mediaCacheByPeer.get(player.conn.peer); prepared.media.forEach(item => cache && cache.delete(item.key)); throw error; }
      } catch (error) { console.warn('Could not synchronize player state:', error); }
    }
    emit('scene-broadcast', { revision: state.revision });
    return true;
  }
  function onLocalStateChanged() {
    if (state.role !== 'gm' || state.suppressLocalBroadcast) return;
    const fingerprint = VTT.sharedFingerprint();
    if (fingerprint !== state.lastFingerprint) broadcastState();
  }
  function approveAction(requestId) {
    const item = state.pendingActions.get(requestId);
    if (!item || state.role !== 'gm') return;
    const player = state.approved.get(item.peerId);
    if (!player || item.hostGeneration !== state.hostGeneration || item.baseRevision !== state.revision) {
      rejectAction(requestId, 'The scene changed before this request was approved. Ask the player to submit it again.', 'stale');
      return;
    }
    const authorization = state.authority.authorizeAction(item, requestContext(item, player));
    if (!authorization.ok) {
      rejectAction(requestId, authorization.error || authorization.code);
      return;
    }
    state.suppressLocalBroadcast = true;
    let result;
    try { result = VTT.applyMultiplayerAction(item); }
    finally { state.suppressLocalBroadcast = false; }
    if (!result || result.ok !== true) {
      rejectAction(requestId, result && result.error || 'The requested action could not be applied.');
      return;
    }
    state.pendingActions.delete(requestId);
    broadcastState();
    try { send(player.conn, 'ACTION_RESULT', { requestId, status: 'approved', revision: state.revision, result }); } catch (_) {}
    renderActions();
    emit('action-approved', { requestId, playerName: player.name, result });
  }
  function rejectAction(requestId, reason, status) {
    const item = state.pendingActions.get(requestId);
    if (!item) return;
    state.pendingActions.delete(requestId);
    const player = state.approved.get(item.peerId);
    if (player && player.conn.open) {
      try { send(player.conn, 'ACTION_RESULT', { requestId, status: status || 'rejected', reason: reason || 'The GM rejected the request.', revision: state.revision }); } catch (_) {}
    }
    renderActions();
    emit('action-rejected', { requestId, playerName: item.playerName, reason, status: status || 'rejected' });
  }
  function cancelPendingActions(reason) {
    for (const id of Array.from(state.pendingActions.keys())) rejectAction(id, reason || 'The round ended; submit a new movement request next round.', 'cancelled');
  }
  function requestAction(objectId, action, data) {
    if (state.role !== 'player' || !state.playerApproved || !state.playerConnection || !state.playerConnection.open) {
      throw new Error('You must be connected and approved by the GM before submitting an action.');
    }
    const requestId = makeId('request');
    send(state.playerConnection, 'ACTION_REQUEST', { requestId, objectId, action, data: data || {} });
    state.playerPendingActions.set(requestId, { objectId, action, data: data || {} });
    emit('action-submitted', { requestId, objectId, action, data: data || {} });
    return requestId;
  }
  function withdrawAction(requestId) {
    if (state.role !== 'player' || !state.playerApproved || !state.playerConnection || !state.playerConnection.open) return false;
    if (!state.playerPendingActions.has(requestId)) return false;
    send(state.playerConnection, 'ACTION_CANCEL', { requestId });
    state.playerPendingActions.delete(requestId);
    emit('action-withdrawn', { requestId });
    return true;
  }
  function closeSession(reason) {
    if (state.role === 'gm') {
      cancelPendingActions(reason || 'The GM ended the session.');
      for (const player of state.approved.values()) {
        try { send(player.conn, 'SESSION_CLOSED', { reason: reason || 'The GM ended the session.' }); } catch (_) {}
        try { player.conn.close(); } catch (_) {}
      }
      for (const item of state.pendingJoins.values()) { try { item.conn.close(); } catch (_) {} }
    }
    stopHeartbeat();
    try { state.peer && state.peer.destroy(); } catch (_) {}
    state.role = null; state.peer = null; state.sessionId = null; state.authority = null;
    state.connections.clear(); state.pendingJoins.clear(); state.approved.clear(); state.pendingActions.clear();
    state.playerPendingActions.clear(); state.mediaTransfers.clear(); state.mediaCacheByPeer.clear(); state.playerConnection = null; state.playerApproved = false;
    state.signalingConnected = false; state.revision = 0; state.lastFingerprint = '';
    VTT.setSessionLock(false);
    setControls('idle');
    const invite = $('mp-invite-wrap'); if (invite) invite.hidden = true;
    const joinQueue = $('mp-join-queue-wrap'); if (joinQueue) joinQueue.hidden = true;
    const players = $('mp-players-wrap'); if (players) players.hidden = true;
    const requests = $('mp-requests-wrap'); if (requests) requests.hidden = true;
    setStatus(reason || 'Session ended. Local VTT mode restored.', 'idle');
    renderAll();
    emit('session-ended', { reason: reason || 'Session ended.' });
  }
  function bindUI() {
    $('mp-host')?.addEventListener('click', () => hostSession().catch(error => setStatus(error.message, 'error')));
    $('mp-join')?.addEventListener('click', () => joinSession($('mp-room-id')?.value, $('mp-player-name')?.value).catch(error => setStatus(error.message, 'error')));
    $('mp-end')?.addEventListener('click', () => closeSession('Session ended by the user.'));
    $('mp-copy-invite')?.addEventListener('click', async () => {
      const input = $('mp-invite-link');
      if (!input || !input.value) return;
      try { await navigator.clipboard.writeText(input.value); setStatus('Invitation link copied.', 'connected'); }
      catch (_) { input.focus(); input.select(); setStatus('Select and copy the invitation link manually.', 'pending'); }
    });
    const params = new URLSearchParams(root.location.search);
    const room = params.get('room');
    if (room && $('mp-room-id')) $('mp-room-id').value = root.location.href;
    setControls('idle');
  }

  if (!Foundation || !VTT) {
    console.error('WoA multiplayer runtime requires protocol.js and the VTT bridge.');
  } else {
    VTT.setStateChangedHook(onLocalStateChanged);
    bindUI();
  }

  root.WoAMultiplayer = Object.freeze({
    host: hostSession,
    join: joinSession,
    close: closeSession,
    approveJoin: (peerId) => decideJoin(peerId, true),
    rejectJoin: (peerId) => decideJoin(peerId, false),
    approveAction: approveAction,
    rejectAction: rejectAction,
    requestAction: requestAction,
    withdrawAction: withdrawAction,
    cancelPendingActions: cancelPendingActions,
    broadcastState: broadcastState,
    isHost: () => state.role === 'gm',
    isPlayer: () => state.role === 'player',
    isConnected: () => state.role === 'gm' || state.playerApproved,
    getState: () => ({
      role: state.role, sessionId: state.sessionId, revision: state.revision,
      hostGeneration: state.hostGeneration, pendingJoins: state.pendingJoins.size,
      approvedPlayers: state.approved.size, pendingActions: state.pendingActions.size
    })
  });
})(window);
