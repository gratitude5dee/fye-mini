import { GATEWAY_PING_PATH } from '../../../src/config/gateway-routes.js';
import { binding, runtime } from './http';

type GatewayBinding = { fetch(request: Request): Promise<Response> };

function gateway() {
  const value = binding<GatewayBinding>('CUSTOMER_HTTP_MONGO_GATEWAY');
  return value && typeof value.fetch === 'function' ? value : null;
}

function token() {
  const value = runtime('MONGO_GATEWAY_TOKEN');
  return value && value.length >= 32 ? value : null;
}

/**
 * Returns null when the private gateway is not configured. A configured but
 * unavailable gateway instead produces a normal response so health can report
 * the distinction without ever attempting Worker-to-Atlas TCP.
 */
export async function gatewayFetch(pathname: string, init: RequestInit = {}) {
  const target = gateway();
  const sharedToken = token();
  if (!target || !sharedToken) return null;
  const headers = new Headers(init.headers);
  headers.set('x-living-grimoire-gateway-token', sharedToken);
  return target.fetch(new Request(`https://mongo-gateway.internal${pathname}`, { ...init, headers }));
}

export async function gatewayAtlasHealth() {
  const response = await gatewayFetch(GATEWAY_PING_PATH, { headers: { accept: 'application/json' } });
  if (!response) return null;
  if (!response.ok) return { configured: true, reachable: false };
  try {
    const body = await response.json() as { configured?: unknown; reachable?: unknown };
    return { configured: body.configured === true, reachable: body.reachable === true };
  } catch {
    return { configured: true, reachable: false };
  }
}
