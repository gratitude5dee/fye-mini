import test from 'node:test';
import assert from 'node:assert/strict';
import { GATEWAY_PING_PATH, isGatewayApiPath, isGatewayInboundPath } from '../src/config/gateway-routes.js';
import { readFile } from 'node:fs/promises';

test('gateway accepts only the database-backed API surface', () => {
  for (const path of ['/api/almanac', '/api/casts', '/api/lore', '/api/spellwright', '/api/spells', '/api/spells/cinderwake']) {
    assert.equal(isGatewayApiPath(path), true, path);
    assert.equal(isGatewayInboundPath(path), true, path);
  }
  for (const path of ['/api/identity', '/api/portraits', '/api/spells/a/history', '/api/admin', '/anything']) {
    assert.equal(isGatewayApiPath(path), false, path);
    assert.equal(isGatewayInboundPath(path), false, path);
  }
  assert.equal(isGatewayInboundPath(GATEWAY_PING_PATH), true);
});

test('gateway process has a shared-token boundary and loopback default', async () => {
  const source = await readFile(new URL('../gateway/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /MONGO_GATEWAY_TOKEN/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /isGatewayInboundPath/);
});

test('database helper keeps transactions on the client it opens', async () => {
  const source = await readFile(new URL('../app/api/_lib/mongo.ts', import.meta.url), 'utf8');
  assert.match(source, /work\(client\.db\(runtime\('ATLAS_DB'\) \?\? 'living_grimoire'\), client\)/);
  assert.match(source, /LIVING_GRIMOIRE_GATEWAY/);
});
