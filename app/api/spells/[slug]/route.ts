import { normalizeSpellForRead } from '../../../../src/config/spell-read-shape';
import { RequestError, json, message, text } from '../../_lib/http';
import { atlasReady, withDb } from '../../_lib/mongo';
import { spellForClient } from '../../_lib/spells';

const OBJECT_ID = /^[a-f\d]{24}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LINEAGE_DEPTH = 12;
const MAX_LINEAGE_NODES = 160;
const READABLE_SCHEMA = { $or: [{ schemaVersion: { $in: [0, 1] } }, { schemaVersion: { $exists: false } }] };

type RawSpell = Record<string, any>;

async function selector(reference: string) {
  if (!reference || reference.length > 64 || (!OBJECT_ID.test(reference) && !SLUG.test(reference))) {
    throw new RequestError(400, 'That spell mark is malformed.');
  }
  // A slug made entirely of hex characters is legal, so retain both branches
  // instead of treating it as an ObjectId exclusively.
  if (OBJECT_ID.test(reference)) {
    // Keep the MongoDB driver (and any TCP-related initialization it performs)
    // inside the request path, matching the Workers connection discipline.
    const { ObjectId } = await import('mongodb');
    return { $or: [{ _id: new ObjectId(reference) }, { slug: reference }] };
  }
  return { slug: reference };
}

function lineageNode(document: RawSpell) {
  const normalized = normalizeSpellForRead(document);
  if (!normalized.ok) return null;
  const spell = spellForClient(normalized.value as any) as Record<string, any>;
  const { settings, lore, incantationHistory, tags, ...node } = spell;
  return node;
}

function publicSpell(document: RawSpell) {
  const normalized = normalizeSpellForRead(document);
  if (!normalized.ok) throw new RequestError(409, normalized.issue);
  return spellForClient(normalized.value as any);
}

function orderLineage(documents: RawSpell[]) {
  return documents
    .map(lineageNode)
    .filter(Boolean)
    .sort((left: any, right: any) => {
      const depthDifference = Number(left.lineage?.depth ?? 0) - Number(right.lineage?.depth ?? 0);
      if (depthDifference) return depthDifference;
      return String(left._id).localeCompare(String(right._id));
    })
    .slice(0, MAX_LINEAGE_NODES);
}

/**
 * GET /api/spells/:slug
 *
 * `:slug` may also be a 24-character spell ObjectId. The returned lineage is
 * read-only and deliberately compact: settings/lore history stay on the
 * selected spell, while graph nodes expose only public display data.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!atlasReady()) throw new RequestError(503, 'Atlas is not yet attuned for spell pages.');
    const { slug } = await context.params;
    const reference = text(slug, 64).toLowerCase();
    const match = await selector(reference);
    const result = await withDb(async (db) => db.collection('spells').aggregate([
      { $match: match },
      { $limit: 1 },
      {
        $graphLookup: {
          from: 'spells',
          startWith: '$lineage.parentId',
          connectFromField: 'lineage.parentId',
          connectToField: '_id',
          as: 'ancestors',
          depthField: '_lineageDistance',
          maxDepth: MAX_LINEAGE_DEPTH,
          restrictSearchWithMatch: READABLE_SCHEMA
        }
      },
      {
        $graphLookup: {
          from: 'spells',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'lineage.parentId',
          as: 'descendants',
          depthField: '_lineageDistance',
          maxDepth: MAX_LINEAGE_DEPTH,
          restrictSearchWithMatch: READABLE_SCHEMA
        }
      }
    ]).toArray());
    const spell = result[0] as RawSpell | undefined;
    if (!spell) throw new RequestError(404, 'That spell has left the book.');
    return json({
      spell: publicSpell(spell),
      ancestors: orderLineage(Array.isArray(spell.ancestors) ? spell.ancestors : []),
      descendants: orderLineage(Array.isArray(spell.descendants) ? spell.descendants : [])
    });
  } catch (error) {
    return message(error, 'The lineage could not be read.');
  }
}
