import { RequestError, json, message, readJson, text } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 8_000);
    const spellId = text(body.spellId, 24);
    const element = text(body.element, 12);
    const benderId = text(body.benderId, 80);
    const pathLenM = Number(body.pathLenM);
    if (!/^[a-f\d]{24}$/i.test(spellId) || !['fire', 'water', 'earth', 'air'].includes(element) || !benderId || !Number.isFinite(pathLenM)) throw new RequestError(400, 'This casting mark is incomplete.');
    if (pathLenM < 0 || pathLenM > 250) throw new RequestError(400, 'That path cannot be recorded.');
    if (!atlasReady()) return json({ recorded: false, source: 'stage' });
    const { ObjectId } = await import('mongodb');
    await withDb(async (db) => {
      const id = new ObjectId(spellId);
      const spell = await db.collection('spells').findOne({ _id: id }, { projection: { _id: 1 } });
      if (!spell) throw new RequestError(404, 'That spell has slipped from the book.');
      const now = new Date();
      await Promise.all([
        db.collection('casts').insertOne({ spellId: id, element, benderId, pathLenM, client: body.client ?? {}, createdAt: now }),
        db.collection('spells').updateOne({ _id: id }, { $inc: { 'stats.casts': 1 }, $set: { updatedAt: now } }),
        db.collection('benders').updateOne({ benderId }, { $set: { lastSeenAt: now }, $setOnInsert: { benderId, createdAt: now, bookmarks: [] } }, { upsert: true })
      ]);
    });
    return json({ recorded: true }, { status: 201 });
  } catch (error) {
    return message(error, 'The Almanac could not remember that casting.');
  }
}
