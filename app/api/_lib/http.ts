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

export async function readJson(request: Request, maximumBytes = 180_000): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > maximumBytes) throw new RequestError(413, 'The page is too heavy to bind.');
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
