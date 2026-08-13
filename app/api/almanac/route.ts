import { json, message } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';
import { spellForClient } from '../_lib/spells';

export async function GET() {
  try {
    if (!atlasReady()) return json({ totalCasts: 0, elementShare: [], trending: [], source: 'stage' });
    const result = await withDb(async (db) => {
      const [total, elementShare, trending] = await Promise.all([
        db.collection('casts').countDocuments(),
        db.collection('casts').aggregate([{ $group: { _id: '$element', casts: { $sum: 1 } } }, { $sort: { casts: -1 } }]).toArray(),
        db.collection('spells').find({}).sort({ 'stats.casts': -1, createdAt: -1 }).limit(6).toArray()
      ]);
      return { total, elementShare, trending };
    });
    return json({
      totalCasts: result.total,
      elementShare: result.elementShare.map((entry) => ({ element: entry._id, casts: entry.casts })),
      trending: result.trending.map(spellForClient),
      source: 'atlas'
    });
  } catch (error) {
    return message(error, 'The Almanac is not yet awake.');
  }
}
