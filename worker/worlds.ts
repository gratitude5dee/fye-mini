import { WORLD_PRIORS, priorFor } from '../src/world/world-seeds.js';

type Env = {
  WORLD_CATALOG?: any;
  WORLD_LABS_API_KEY?: string;
  FYE_WORLD_OPERATOR_TOKEN?: string;
};

type JobRow = { slug: string; operation_id: string; status: string };
type WorldRow = {
  slug: string;
  title: string;
  summary: string;
  thumbnail_url: string;
  splat_100k_url: string;
  splat_500k_url: string | null;
  collider_url: string;
  metric_scale_factor: number;
  ground_plane_offset: number;
  collider_transform_json: string | null;
  spawn_json: string | null;
  ritual_anchor_json: string | null;
};

const WORLD_LABS_BASE = 'https://api.worldlabs.ai/marble/v1';
const WORLD_MODEL = 'marble-1.1-plus';
const ALLOWED_ASSET_HOSTS = ['worldlabs.ai', 'storage.googleapis.com'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const now = () => new Date().toISOString();
const safeError = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 180);

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const isApprovedUrl = (value: unknown) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_ASSET_HOSTS.some((host) =>
      url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
};

const finite = (value: unknown, min = -10000, max = 10000) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function catalogEntry(row: WorldRow) {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    thumbnailUrl: row.thumbnail_url,
    splat100kUrl: row.splat_100k_url,
    splat500kUrl: row.splat_500k_url ?? undefined,
    colliderUrl: row.collider_url,
    metricScaleFactor: row.metric_scale_factor,
    groundPlaneOffset: row.ground_plane_offset,
    colliderTransform: parseJson(row.collider_transform_json, {}),
    spawn: parseJson(row.spawn_json, {}),
    ritualAnchor: parseJson(row.ritual_anchor_json, {})
  };
}

function authorised(request: Request, env: Env) {
  const token = env.FYE_WORLD_OPERATOR_TOKEN;
  return Boolean(token) && request.headers.get('authorization') === `Bearer ${token}`;
}

function fixedImagePayload(prior: (typeof WORLD_PRIORS)[number], origin: string) {
  // This payload is deliberately closed over the four source records. Neither
  // request data nor a player preference can supply a prompt, image URL, or
  // model—this route is a short-lived operator bootstrap, not a generation API.
  return {
    display_name: prior.title,
    model: WORLD_MODEL,
    permission: { public: true, allow_id_access: true },
    tags: ['fye', 'approved-catalog'],
    world_prompt: {
      type: 'image',
      image_prompt: { source: 'uri', uri: new URL(prior.imagePath, origin).toString() },
      text_prompt: prior.prompt
    }
  };
}

function extractAssets(response: any) {
  const world = response?.response ?? response;
  const assets = world?.assets;
  const splats = assets?.splats;
  const semantics = splats?.semantics_metadata;
  const entry = {
    thumbnailUrl: assets?.thumbnail_url,
    splat100kUrl: splats?.spz_urls?.['100k'],
    splat500kUrl: splats?.spz_urls?.['500k'] ?? null,
    colliderUrl: assets?.mesh?.collider_mesh_url,
    metricScaleFactor: semantics?.metric_scale_factor,
    groundPlaneOffset: semantics?.ground_plane_offset
  };
  if (!isApprovedUrl(entry.thumbnailUrl) || !isApprovedUrl(entry.splat100kUrl) ||
      (entry.splat500kUrl && !isApprovedUrl(entry.splat500kUrl)) || !isApprovedUrl(entry.colliderUrl) ||
      !finite(entry.metricScaleFactor, .001, 1000) || !finite(entry.groundPlaneOffset, -10000, 10000)) return null;
  return entry as {
    thumbnailUrl: string;
    splat100kUrl: string;
    splat500kUrl: string | null;
    colliderUrl: string;
    metricScaleFactor: number;
    groundPlaneOffset: number;
  };
}

async function publicCatalog(env: Env) {
  if (!env.WORLD_CATALOG) return json({ worlds: [] });
  const result = await env.WORLD_CATALOG
    .prepare(`SELECT slug, title, summary, thumbnail_url, splat_100k_url, splat_500k_url,
      collider_url, metric_scale_factor, ground_plane_offset, collider_transform_json,
      spawn_json, ritual_anchor_json FROM worlds WHERE active = 1 AND status = 'ready' ORDER BY title`)
    .all<WorldRow>();
  return json({ worlds: result.results.map(catalogEntry) });
}

async function startFixedJobs(request: Request, env: Env) {
  const db = env.WORLD_CATALOG;
  if (!db) return json({ error: 'World catalog is not configured.' }, 503);
  if (!env.WORLD_LABS_API_KEY) return json({ error: 'World generation is not enabled.' }, 503);

  const origin = new URL(request.url).origin;
  const started: string[] = [];
  const existing = await db.prepare('SELECT slug, status FROM world_jobs').all<{ slug: string; status: string }>();
  const known = new Map(existing.results.map((job) => [job.slug, job.status]));

  for (const prior of WORLD_PRIORS) {
    // Idempotent by slug. Failed jobs are deliberately not retried until an
    // operator clears their row: generation has an external cost.
    if (known.has(prior.slug)) continue;
    try {
      const result = await fetch(`${WORLD_LABS_BASE}/worlds:generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'WLT-Api-Key': env.WORLD_LABS_API_KEY },
        body: JSON.stringify(fixedImagePayload(prior, origin))
      });
      const payload = await result.json() as { operation_id?: string; detail?: unknown };
      if (!result.ok || typeof payload.operation_id !== 'string') throw new Error(`World Labs ${result.status}`);
      const at = now();
      await db.prepare('INSERT INTO world_jobs (slug, operation_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(prior.slug, payload.operation_id, 'pending', at, at).run();
      started.push(prior.slug);
    } catch (error) {
      const at = now();
      await db.prepare('INSERT OR REPLACE INTO world_jobs (slug, operation_id, status, error_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(prior.slug, 'not-started', 'failed', safeError(error), at, at).run();
    }
  }
  return json({ started, fixed: WORLD_PRIORS.map((prior) => prior.slug) }, 202);
}

function validCalibration(value: any) {
  const transform = value?.colliderTransform;
  const spawn = value?.spawn;
  const anchor = value?.ritualAnchor;
  return transform && spawn && anchor &&
    ['x', 'y', 'z', 'rx', 'ry', 'rz', 'scale'].every((key) => finite(transform[key], -1000, 1000)) &&
    finite(spawn.x) && finite(spawn.y) && finite(spawn.z) && finite(spawn.yaw, -Math.PI * 2, Math.PI * 2) &&
    finite(anchor.x) && finite(anchor.y) && finite(anchor.z) && finite(anchor.radius, 2, 60);
}

async function calibrateWorld(request: Request, env: Env, slug: string) {
  const prior = priorFor(slug);
  if (!prior || !env.WORLD_CATALOG) return json({ error: 'Unknown world.' }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Calibration JSON is required.' }, 400); }
  if (!validCalibration(body)) return json({ error: 'Calibration values are out of range.' }, 400);
  const data = body as any;
  const result = await env.WORLD_CATALOG.prepare(`UPDATE worlds
    SET collider_transform_json = ?, spawn_json = ?, ritual_anchor_json = ?, updated_at = ?
    WHERE slug = ? AND status = 'calibrating'`)
    .bind(JSON.stringify(data.colliderTransform), JSON.stringify(data.spawn), JSON.stringify(data.ritualAnchor), now(), slug).run();
  return result.meta?.changes ? json({ slug, status: 'calibrating' }) : json({ error: 'World is not awaiting calibration.' }, 409);
}

async function publishWorld(env: Env, slug: string) {
  const prior = priorFor(slug);
  if (!prior || !env.WORLD_CATALOG) return json({ error: 'Unknown world.' }, 404);
  const result = await env.WORLD_CATALOG.prepare(`UPDATE worlds SET status = 'ready', active = 1, updated_at = ?
    WHERE slug = ? AND status = 'calibrating' AND collider_transform_json IS NOT NULL
      AND spawn_json IS NOT NULL AND ritual_anchor_json IS NOT NULL`)
    .bind(now(), slug).run();
  return result.meta?.changes ? json({ slug, status: 'ready' }) : json({ error: 'World must be calibrated before publication.' }, 409);
}

/** Poll exactly the operator-created jobs. Called by the one-minute Worker schedule. */
export async function pollWorldJobs(env: Env) {
  const db = env.WORLD_CATALOG;
  if (!db || !env.WORLD_LABS_API_KEY) return;
  const pending = await db.prepare("SELECT slug, operation_id, status FROM world_jobs WHERE status = 'pending'").all<JobRow>();
  for (const job of pending.results) {
    try {
      const response = await fetch(`${WORLD_LABS_BASE}/operations/${encodeURIComponent(job.operation_id)}`, {
        headers: { 'WLT-Api-Key': env.WORLD_LABS_API_KEY }
      });
      if (!response.ok) continue; // transient transport/auth state: leave the audit row intact.
      const operation = await response.json() as { done?: boolean; error?: { message?: string } | null; response?: unknown };
      if (!operation.done) continue;
      if (operation.error) {
        await db.prepare('UPDATE world_jobs SET status = ?, error_summary = ?, updated_at = ? WHERE slug = ?')
          .bind('failed', safeError(operation.error.message ?? 'World Labs rejected the job'), now(), job.slug).run();
        continue;
      }
      const asset = extractAssets(operation.response);
      const prior = priorFor(job.slug);
      if (!asset || !prior) {
        await db.prepare('UPDATE world_jobs SET status = ?, error_summary = ?, updated_at = ? WHERE slug = ?')
          .bind('failed', 'World Labs returned incomplete or unapproved asset URLs.', now(), job.slug).run();
        continue;
      }
      const at = now();
      await db.prepare(`INSERT INTO worlds (slug, title, summary, thumbnail_url, splat_100k_url, splat_500k_url,
        collider_url, metric_scale_factor, ground_plane_offset, status, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'calibrating', 0, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET title = excluded.title, summary = excluded.summary,
          thumbnail_url = excluded.thumbnail_url, splat_100k_url = excluded.splat_100k_url,
          splat_500k_url = excluded.splat_500k_url, collider_url = excluded.collider_url,
          metric_scale_factor = excluded.metric_scale_factor, ground_plane_offset = excluded.ground_plane_offset,
          status = 'calibrating', active = 0, updated_at = excluded.updated_at`)
        .bind(job.slug, prior.title, prior.summary, asset.thumbnailUrl, asset.splat100kUrl, asset.splat500kUrl,
          asset.colliderUrl, asset.metricScaleFactor, asset.groundPlaneOffset, at, at).run();
      await db.prepare('UPDATE world_jobs SET status = ?, updated_at = ? WHERE slug = ?')
        .bind('completed', at, job.slug).run();
    } catch (error) {
      // Keep the job pending on a Worker/runtime error so the next minute gets
      // another chance. The error stays in operational logs, never in public API output.
      console.warn('[world-poll] retrying', job.slug, safeError(error));
    }
  }
}

/** Returns null for all normal app routes so Vinext remains their owner. */
export async function handleWorldRequest(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/worlds') return request.method === 'GET'
    ? publicCatalog(env)
    : json({ error: 'Method not allowed.' }, 405);
  if (!pathname.startsWith('/internal/worlds/')) return null;
  if (!authorised(request, env)) return json({ error: 'Operator authorization required.' }, 401);
  if (pathname === '/internal/worlds/generate') return request.method === 'POST'
    ? startFixedJobs(request, env)
    : json({ error: 'Method not allowed.' }, 405);
  if (pathname === '/internal/worlds/status') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    if (!env.WORLD_CATALOG) return json({ jobs: [], worlds: [] });
    const [jobs, worlds] = await Promise.all([
      env.WORLD_CATALOG.prepare('SELECT slug, status, error_summary, created_at, updated_at FROM world_jobs ORDER BY slug').all(),
      env.WORLD_CATALOG.prepare('SELECT slug, status, active, updated_at FROM worlds ORDER BY slug').all()
    ]);
    return json({ jobs: jobs.results, worlds: worlds.results });
  }
  const match = pathname.match(/^\/internal\/worlds\/([a-z-]+)\/(calibrate|publish)$/);
  if (!match) return json({ error: 'Not found.' }, 404);
  const [, slug, action] = match;
  if (action === 'calibrate' && request.method === 'POST') return calibrateWorld(request, env, slug);
  if (action === 'publish' && request.method === 'POST') return publishWorld(env, slug);
  return json({ error: 'Method not allowed.' }, 405);
}

export { WORLD_MODEL, isApprovedUrl };
