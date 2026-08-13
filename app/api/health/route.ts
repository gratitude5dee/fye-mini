import { json, runtime } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';

async function atlasHealth() {
  if (!atlasReady()) return { configured: false, reachable: false };
  try {
    await withDb(async (db) => { await db.command({ ping: 1 }); });
    return { configured: true, reachable: true };
  } catch {
    return { configured: true, reachable: false };
  }
}

async function openaiHealth() {
  const key = runtime('OPENAI_API_KEY');
  if (!key) return { configured: false, reachable: false };
  try {
    const response = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } });
    return { configured: true, reachable: response.ok };
  } catch {
    return { configured: true, reachable: false };
  }
}

export async function GET() {
  const [atlas, openai] = await Promise.all([atlasHealth(), openaiHealth()]);
  return json({ ok: atlas.reachable || openai.reachable, atlas, openai }, { headers: { 'cache-control': 'no-store' } });
}
