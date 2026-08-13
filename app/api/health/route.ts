import { json, runtime } from '../_lib/http';
import { atlasReady } from '../_lib/mongo';

export async function GET() {
  return json({ ok: true, atlas: atlasReady(), spellwright: Boolean(runtime('OPENAI_API_KEY')) });
}
