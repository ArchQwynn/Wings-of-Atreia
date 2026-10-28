const test = require('node:test');
const assert = require('node:assert/strict');

require('../protocol.js');
require('../authority.js');

const foundation = globalThis.WoAMultiplayerFoundation;

test('rejects messages from an old or competing host generation', () => {
  const authority = foundation.createAuthority({ hostGeneration: 4, revision: 12 });
  const staleHostMessage = foundation.createMessage('STATE_UPDATE', {}, { hostGeneration: 3, revision: 13 });
  const unknownFutureHostMessage = foundation.createMessage('STATE_UPDATE', {}, { hostGeneration: 5, revision: 13 });

  assert.equal(authority.checkMessage(staleHostMessage).code, 'HOST_GENERATION_MISMATCH');
  assert.equal(authority.checkMessage(unknownFutureHostMessage).code, 'HOST_GENERATION_MISMATCH');
});

test('rejects stale state revisions and detects revision gaps', () => {
  const authority = foundation.createAuthority({ hostGeneration: 2, revision: 8 });
  const stale = foundation.createMessage('STATE_UPDATE', {}, { hostGeneration: 2, revision: 7 });
  const skipped = foundation.createMessage('STATE_UPDATE', {}, { hostGeneration: 2, revision: 10 });
  const next = foundation.createMessage('STATE_UPDATE', {}, { hostGeneration: 2, revision: 9 });

  assert.equal(authority.checkMessage(stale).code, 'STALE_REVISION');
  assert.equal(authority.checkMessage(skipped, { requireNextRevision: true }).code, 'REVISION_GAP');
  assert.equal(authority.checkMessage(next, { requireNextRevision: true }).ok, true);
});

test('host generation can only advance with explicit external recovery authorization', () => {
  const authority = foundation.createAuthority({ hostGeneration: 2, revision: 10 });

  assert.equal(authority.activateGeneration(3, false).code, 'RECOVERY_NOT_AUTHORIZED');
  assert.equal(authority.getVersion().hostGeneration, 2);
  assert.equal(authority.activateGeneration(2, true).code, 'INVALID_HOST_GENERATION');
  assert.equal(authority.activateGeneration(3, true).ok, true);
  assert.deepEqual(authority.getVersion(), { hostGeneration: 3, revision: 10, hostActive: true });
});

test('revision updates use compare-and-swap semantics and stop while host is inactive', () => {
  const authority = foundation.createAuthority({ hostGeneration: 1, revision: 5 });

  assert.equal(authority.advanceRevision(1, 4).code, 'REVISION_CONFLICT');
  assert.equal(authority.advanceRevision(2, 5).code, 'HOST_GENERATION_MISMATCH');
  assert.equal(authority.advanceRevision(1, 5).ok, true);
  assert.equal(authority.getVersion().revision, 6);
  authority.setHostActive(false);
  assert.equal(authority.advanceRevision(1, 6).code, 'HOST_INACTIVE');
});

test('action permission is scoped to actor, object, and exact action', () => {
  const authority = foundation.createAuthority({ hostGeneration: 7, revision: 3 });
  const request = { actorId: 'player-1', objectId: 'token-lyra', action: 'move', hostGeneration: 7, baseRevision: 3 };
  const permissions = { 'player-1': { 'token-lyra': { move: true } } };

  assert.equal(authority.authorizeAction(request, { targetExists: true, permissions }).ok, true);
  assert.equal(authority.authorizeAction({ ...request, action: 'delete' }, { targetExists: true, permissions }).code, 'ACTION_NOT_AUTHORIZED');
  assert.equal(authority.authorizeAction({ ...request, objectId: 'enemy-token' }, { targetExists: true, permissions }).code, 'ACTION_NOT_AUTHORIZED');
  assert.equal(authority.authorizeAction(request, { targetExists: false, permissions }).code, 'TARGET_UNAVAILABLE');
  assert.equal(authority.authorizeAction({ ...request, baseRevision: 2 }, { targetExists: true, permissions }).code, 'STALE_REQUEST');
  assert.equal(authority.authorizeAction({ ...request, hostGeneration: 6 }, { targetExists: true, permissions }).code, 'HOST_GENERATION_MISMATCH');
});

test('stale or malformed join attempts cannot bypass explicit approval', () => {
  const queue = foundation.createJoinApprovalQueue();
  assert.equal(queue.requestJoin({ attemptId: 'attempt-0001', displayName: '  Player One  ' }).request.status, 'pending');
  assert.equal(queue.requestJoin({ attemptId: 'attempt-0001', displayName: 'Player One' }).code, 'DUPLICATE_ATTEMPT');
  assert.equal(queue.requestJoin({ attemptId: 'attempt-0002', displayName: 'Player Two' }).request.status, 'pending');
  assert.equal(queue.get('attempt-0001').status, 'pending');
  assert.equal(queue.decide('attempt-0001', 'approved').request.status, 'approved');
  assert.equal(queue.decide('attempt-0001', 'rejected').code, 'JOIN_ATTEMPT_ALREADY_DECIDED');
  assert.equal(queue.get('attempt-0002').status, 'pending');
  assert.equal(queue.decide('attempt-0002', 'rejected').request.status, 'rejected');
  assert.equal(queue.requestJoin({ attemptId: 'short', displayName: 'Player' }).code, 'INVALID_JOIN_REQUEST');
  assert.equal(queue.requestJoin({ attemptId: 'attempt-0003', displayName: '   ' }).code, 'INVALID_JOIN_REQUEST');
});

test('visibility filtering removes restricted objects before a snapshot is returned', () => {
  const objects = [
    { id: 'visible-token', hidden: false },
    { id: 'hidden-token', hidden: true },
    { id: 'visible-prop', hidden: false }
  ];
  const visible = foundation.filterVisibleObjects(objects, object => !object.hidden);

  assert.deepEqual(visible.map(object => object.id), ['visible-token', 'visible-prop']);
  assert.equal(objects.length, 3, 'filtering must not mutate the source scene');
  assert.throws(() => foundation.filterVisibleObjects(objects, null), /predicate/);
  assert.deepEqual(foundation.filterVisibleObjects(objects, () => { throw new Error('visibility failure'); }), []);
});
