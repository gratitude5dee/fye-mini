import { json, message } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';
import { spellForClient } from '../_lib/spells';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let cached: { expiresAt: number; value: Record<string, unknown> } | null = null;

export async function GET() {
  try {
    if (!atlasReady()) return json({ totalCasts: null, elementShare: [], daily: [], trending: [], source: 'stage', windowDays: 90 });
    if (cached && cached.expiresAt > Date.now()) return json(cached.value, { headers: { 'cache-control': 'public, s-maxage=60, max-age=60' } });
    const moment = new Date();
    const since = new Date(moment.getTime() - 90 * DAY);
    const sevenDays = new Date(moment.getTime() - 7 * DAY);
    const result = await withDb(async (db) => {
      const casts = db.collection('casts');
      const [total, elementShare, daily, trending] = await Promise.all([
        casts.countDocuments({ at: { $gte: since } }),
        casts.aggregate([{ $match: { at: { $gte: since } } }, { $group: { _id: '$element', casts: { $sum: 1 } } }, { $sort: { casts: -1 } }]).toArray(),
        casts.aggregate([
          { $match: { at: { $gte: since } } },
          { $group: { _id: { day: { $dateTrunc: { date: '$at', unit: 'day', timezone: 'UTC' } }, element: '$element' }, casts: { $sum: 1 } } },
          { $sort: { '_id.day': 1, '_id.element': 1 } },
          { $project: { _id: 0, day: '$_id.day', element: '$_id.element', casts: 1 } }
        ]).toArray(),
        casts.aggregate([
          { $match: { at: { $gte: sevenDays }, spellId: { $type: 'objectId' } } },
          { $addFields: { ageMs: { $subtract: [moment, '$at'] } } },
          { $addFields: { weight: { $exp: { $multiply: [-1 / (2 * DAY), '$ageMs'] } } } },
          { $group: { _id: '$spellId', casts: { $sum: 1 }, trend: { $sum: '$weight' } } },
          { $sort: { trend: -1, casts: -1 } },
          { $limit: 6 },
          { $lookup: { from: 'spells', localField: '_id', foreignField: '_id', as: 'spell' } },
          { $unwind: '$spell' }
        ]).toArray()
      ]);
      return { total, elementShare, daily, trending };
    });
    const value = {
      totalCasts: result.total,
      elementShare: result.elementShare.map((entry: any) => ({ element: entry._id, casts: entry.casts })),
      daily: result.daily,
      trending: result.trending.map((entry: any) => ({ spell: spellForClient(entry.spell), casts: entry.casts })),
      source: 'atlas',
      windowDays: 90
    };
    cached = { value, expiresAt: Date.now() + 60_000 };
    return json(value, { headers: { 'cache-control': 'public, s-maxage=60, max-age=60' } });
  } catch (error) {
    return message(error, 'The Almanac is not yet awake.');
  }
}
