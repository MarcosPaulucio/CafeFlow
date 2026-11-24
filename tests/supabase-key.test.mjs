import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublishableSupabaseKey } from '../js/supabase-key.mjs';

function legacyKey(role) {
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `header.${payload}.signature`;
}

test('accepts a Supabase publishable key', () => {
  assert.equal(isPublishableSupabaseKey('sb_publishable_example'), true);
});

test('accepts a legacy anon key', () => {
  assert.equal(isPublishableSupabaseKey(legacyKey('anon')), true);
});

test('rejects a service role key', () => {
  assert.equal(isPublishableSupabaseKey(legacyKey('service_role')), false);
});

test('rejects malformed or secret-prefixed keys', () => {
  assert.equal(isPublishableSupabaseKey('sb_secret_example'), false);
  assert.equal(isPublishableSupabaseKey('not-a-jwt'), false);
});
