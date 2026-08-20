import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { GATEWAY_PING_PATH, isGatewayInboundPath } from '../src/config/gateway-routes.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.GATEWAY_HOST ?? '127.0.0.1';
const port = Number(process.env.GATEWAY_PORT ?? 8787);
const appPort = Number(process.env.GATEWAY_APP_PORT ?? 8788);
const sharedToken = process.env.MONGO_GATEWAY_TOKEN ?? '';
const upstream = `http://127.0.0.1:${appPort}`;

if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('GATEWAY_PORT must be a valid TCP port.');
if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65_535 || appPort === port) throw new Error('GATEWAY_APP_PORT must be a different valid TCP port.');
if (sharedToken.length < 32) throw new Error('MONGO_GATEWAY_TOKEN must be at least 32 characters and is required.');

function authorized(value) {
  if (typeof value !== 'string' || value.length !== sharedToken.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(sharedToken));
}

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body)
  });
  response.end(body);
}

async function pingAtlas() {
  const uri = process.env.ATLAS_URI;
  if (!uri) return { configured: false, reachable: false };
  try {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(uri, {
      maxPoolSize: 1,
      minPoolSize: 0,
      connectTimeoutMS: 5_000,
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 15_000
    });
    await client.connect();
    try {
      await client.db(process.env.ATLAS_DB ?? 'living_grimoire').command({ ping: 1 });
      return { configured: true, reachable: true };
    } finally {
      await client.close();
    }
  } catch {
    return { configured: true, reachable: false };
  }
}

async function proxy(request, response) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string' && name.toLowerCase() !== 'host') headers.set(name, value);
  }
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
    init.body = Readable.toWeb(request);
    init.duplex = 'half';
  }
  const upstreamResponse = await fetch(`${upstream}${request.url}`, init);
  const responseHeaders = {};
  for (const [name, value] of upstreamResponse.headers) responseHeaders[name] = value;
  const cookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  if (cookies.length) responseHeaders['set-cookie'] = cookies;
  response.writeHead(upstreamResponse.status, responseHeaders);
  if (!upstreamResponse.body) return response.end();
  Readable.fromWeb(upstreamResponse.body).pipe(response);
}

const app = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vinext/dist/cli.js'), 'start', '--hostname', '127.0.0.1', '--port', String(appPort)], {
  cwd: projectRoot,
  env: { ...process.env, LIVING_GRIMOIRE_GATEWAY: 'true' },
  stdio: 'inherit'
});

let stopping = false;
app.once('exit', (code, signal) => {
  if (!stopping) {
    console.error(`Living Grimoire application process exited unexpectedly (${signal ?? code ?? 'unknown'}).`);
    process.exit(code ?? 1);
  }
});

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://mongo-gateway.internal').pathname;
  if (!authorized(request.headers['x-living-grimoire-gateway-token'])) return writeJson(response, 401, { error: 'Unauthorized gateway request.' });
  if (!isGatewayInboundPath(pathname)) return writeJson(response, 404, { error: 'Unknown gateway route.' });
  if (pathname === GATEWAY_PING_PATH) return writeJson(response, 200, await pingAtlas());
  try {
    await proxy(request, response);
  } catch (error) {
    console.error('Gateway upstream request failed.', error);
    writeJson(response, 502, { error: 'The private application bridge is unavailable.' });
  }
});

server.listen(port, host, () => console.log(`Living Grimoire gateway listening on ${host}:${port}.`));

function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => app.kill('SIGTERM'));
  setTimeout(() => app.kill('SIGKILL'), 10_000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
