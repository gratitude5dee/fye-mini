export class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { 'cache-control': 'no-store', ...(init.headers ?? {}) }
  });
}

export async function readBytes(request: Request, maximumBytes = 180_000) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new RequestError(413, 'The page is too heavy to bind.');
  if (!request.body) throw new RequestError(400, 'The Grimoire could not read that request.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestError(413, 'The page is too heavy to bind.');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(request: Request, maximumBytes = 180_000): Promise<Record<string, unknown>> {
  const bytes = await readBytes(request, maximumBytes);
  const text = new TextDecoder().decode(bytes);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new RequestError(400, 'The Grimoire could not read that request.');
  }
}

export function message(error: unknown, fallback = 'The Grimoire is momentarily quiet.') {
  if (error instanceof RequestError) return json({ error: error.message }, { status: error.status });
  console.error('[Living Grimoire]', error);
  return json({ error: fallback }, { status: 500 });
}

export function text(value: unknown, maximum = 240) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

export function stringList(value: unknown, maximumItems = 6, maximumLength = 32) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry, maximumLength).toLowerCase()).filter(Boolean))].slice(0, maximumItems);
}

export function runtime(name: string) {
  const workerEnv = (globalThis as typeof globalThis & { __LIVING_GRIMOIRE_ENV?: Record<string, unknown> }).__LIVING_GRIMOIRE_ENV;
  const value = workerEnv?.[name] ?? process.env[name];
  return typeof value === 'string' ? value : undefined;
}

export function binding<T>(name: string) {
  const workerEnv = (globalThis as typeof globalThis & { __LIVING_GRIMOIRE_ENV?: Record<string, unknown> }).__LIVING_GRIMOIRE_ENV;
  const value = workerEnv?.[name];
  return value as T | undefined;
}
