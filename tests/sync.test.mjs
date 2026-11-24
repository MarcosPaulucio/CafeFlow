import test from 'node:test';
import assert from 'node:assert/strict';
import { needsManualReview } from '../js/sync.js';

const local = { id: 'one', name: 'Local' };
const remote = { payload: { id: 'one', name: 'Cloud' }, updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null };

test('does not upload or conflict with local-only records when the cloud has no row', () => {
  assert.equal(needsManualReview({ pending: null, local, remote: null }), false);
});

test('requires a decision when local and cloud records differ without a pending base', () => {
  assert.equal(needsManualReview({ pending: null, local, remote }), true);
});

test('does not conflict when the remote version still matches the queued base', () => {
  const pending = { operation: 'upsert', payload: local, baseUpdatedAt: remote.updatedAt };
  assert.equal(needsManualReview({ pending, local, remote }), false);
});

test('requires a decision when the remote version changed after the local edit', () => {
  const pending = { operation: 'upsert', payload: local, baseUpdatedAt: '2025-12-31T23:59:00.000Z' };
  assert.equal(needsManualReview({ pending, local, remote }), true);
});

test('does not conflict when both devices already contain the same record', () => {
  const pending = { operation: 'upsert', payload: remote.payload, baseUpdatedAt: null };
  assert.equal(needsManualReview({ pending, local: remote.payload, remote }), false);
});
