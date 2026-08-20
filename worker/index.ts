import handler from 'vinext/server/app-router-entry';
import { isGatewayApiPath } from '../src/config/gateway-routes.js';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type PrivateHttpGateway = { fetch(request: Request): Promise<Response> };

function gatewayBinding(env: Record<string, unknown>) {
  const candidate = env.CUSTOMER_HTTP_MONGO_GATEWAY as PrivateHttpGateway | undefined;
  return candidate && typeof candidate.fetch === 'function' ? candidate : null;
}

async function proxyToGateway(request: Request, env: Record<string, unknown>, gateway: PrivateHttpGateway) {
  const token = typeof env.MONGO_GATEWAY_TOKEN === 'string' ? env.MONGO_GATEWAY_TOKEN : '';
  if (token.length < 32) {
    return Response.json({ error: 'The private Atlas bridge is not yet sealed.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const source = new URL(request.url);
  const headers = new Headers(request.headers);
  // The bridge receives the application payload and signed cookie, but never
  // needs the visitor's Cloudflare metadata or a public Host header.
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.set('x-living-grimoire-gateway-token', token);
  headers.set('x-forwarded-host', source.host);
  headers.set('x-forwarded-proto', source.protocol.replace(':', ''));
  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  return gateway.fetch(new Request(`https://mongo-gateway.internal${source.pathname}${source.search}`, init));
}

declare global {
  // Sites passes runtime secrets as Worker bindings. Vinext route handlers do
  // not receive those bindings directly, so expose this deployment-scoped map
  // to server code only; no client module imports this value.
  // eslint-disable-next-line no-var
  var __LIVING_GRIMOIRE_ENV: Record<string, unknown> | undefined;
}

export default {
  async fetch(request: Request, env: Record<string, unknown> | undefined, ctx: ExecutionContext) {
    // Vinext's Node production server calls this entrypoint without Cloudflare
    // bindings. The gateway intentionally reads its secrets from process.env.
    const workerEnv = env ?? {};
    globalThis.__LIVING_GRIMOIRE_ENV = workerEnv;
    const gateway = gatewayBinding(workerEnv);
    if (gateway && isGatewayApiPath(new URL(request.url).pathname)) return proxyToGateway(request, workerEnv, gateway);
    return handler.fetch(request, workerEnv, ctx);
  }
};
