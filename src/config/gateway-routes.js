// These are the only database-backed API paths that may traverse the private
// gateway. Keep this list narrow: the gateway is not a general-purpose MongoDB
// or HTTP proxy.
const databaseEndpoints = new Set([
  '/api/almanac',
  '/api/casts',
  '/api/lore',
  '/api/spellwright',
  '/api/spells'
]);

export const GATEWAY_PING_PATH = '/__living-grimoire/ping';

export function isGatewayApiPath(pathname) {
  if (databaseEndpoints.has(pathname)) return true;
  // Spell pages are the only nested API route that needs Atlas. A slash in the
  // slug would be a different route and must never be proxied accidentally.
  return /^\/api\/spells\/[^/]+$/.test(pathname);
}

export function isGatewayInboundPath(pathname) {
  return pathname === GATEWAY_PING_PATH || isGatewayApiPath(pathname);
}
