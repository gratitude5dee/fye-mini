import { binding, json, runtime } from '../_lib/http';
import { gatewayAtlasHealth } from '../_lib/gateway';
import { atlasReady, withDb } from '../_lib/mongo';

async function atlasHealth() {
  const gateway = await gatewayAtlasHealth();
  if (gateway) return gateway;
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
  const portraits = { configured: Boolean(binding('SPELL_PORTRAITS')) };
  const ready = atlas.reachable && openai.reachable && portraits.configured;
  return json({ ok: ready, ready, atlas, openai, portraits }, { headers: { 'cache-control': 'no-store' } });
}
