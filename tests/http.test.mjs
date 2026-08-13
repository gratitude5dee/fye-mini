import test from 'node:test';
import assert from 'node:assert/strict';
import { json } from '../app/api/_lib/http.ts';

test('json preserves a Headers instance and its signed cookie', async () => {
  const headers = new Headers({ 'set-cookie': 'lg_bender=sealed; HttpOnly', 'cache-control': 'private, max-age=0' });
  const response = json({ ready: true }, { headers });

  assert.equal(response.headers.get('set-cookie'), 'lg_bender=sealed; HttpOnly');
  assert.equal(response.headers.get('cache-control'), 'private, max-age=0');
  assert.deepEqual(await response.json(), { ready: true });
});

test('json supplies no-store only when a caller does not set caching', () => {
  const response = json({ ready: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
