import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('hybrid discovery prefers Atlas rank fusion and never falls back to regex search', async () => {
  const route = await readFile(new URL('../app/api/spells/route.ts', import.meta.url), 'utf8');
  assert.match(route, /\$rankFusion/);
  assert.match(route, /Atlas rank fusion unavailable; using RRF fallback/);
  assert.match(route, /SEARCH_LIMIT \* 20/);
  assert.doesNotMatch(route, /\$regex|new RegExp\(/);
});

test('a new bound spell requires a sealed gallery portrait', async () => {
  const route = await readFile(new URL('../app/api/spells/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(!imageUrl\) throw new RequestError\(503, 'The portrait gallery must seal this spell/);
  assert.match(route, /imageUrl\.startsWith\('\/api\/portraits\?key=portraits%2F'\)/);
});

test('the committed Atlas definitions provide lexical type-ahead and vector filters', async () => {
  const indexConfig = JSON.parse(await readFile(new URL('../scripts/mongo/search-indexes.json', import.meta.url), 'utf8'));
  const fields = indexConfig.text.definition.mappings.fields;
  assert.ok(fields.name.some((entry) => entry.type === 'autocomplete' && entry.tokenization === 'edgeGram'));
  assert.equal(indexConfig.vector.type, 'vectorSearch');
  assert.deepEqual(indexConfig.vector.definition.fields.filter((entry) => entry.type === 'filter').map((entry) => entry.path).sort(), ['element', 'lineage.rootId', 'stats.casts']);
});
