import { deviceIdentity, ensureBender, withSessionCookie } from '../_lib/identity';
import { RequestError, json, message, readJson, text } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';

const ELEMENTS = ['fire', 'water', 'earth', 'air'];
const INPUTS = ['hands', 'mouse', 'touch'];
const DEVICES = ['desktop', 'mobile'];

function clientValue(value: unknown) {
  const client = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const input = text(client.input, 12);
  const deviceClass = text(client.deviceClass, 12);
  if (!INPUTS.includes(input) || !DEVICES.includes(deviceClass)) throw new RequestError(400, 'The casting mark has an unknown instrument.');
  return { input, deviceClass };
}

export async function POST(request: Request) {
  try {
    if (!atlasReady()) return json({ recorded: false, source: 'stage' });
    const identity = await deviceIdentity(request);
    const body = await readJson(request, 8_000);
    const spellId = text(body.spellId, 24);
    const requestedElement = text(body.element, 12);
    const eventId = text(body.eventId, 64);
    const pathLenM = body.pathLenM;
    const travelMs = body.travelMs;
    if (!/^[a-f\d-]{16,64}$/i.test(eventId) || typeof pathLenM !== 'number' || !Number.isFinite(pathLenM) || !Number.isInteger(travelMs)) throw new RequestError(400, 'This casting mark is incomplete.');
    if (pathLenM < 0 || pathLenM > 250 || travelMs < 0 || travelMs > 120_000) throw new RequestError(400, 'That path cannot be recorded.');
    const clientValueChecked = clientValue(body.client);
    if (spellId && !/^[a-f\d]{24}$/i.test(spellId)) throw new RequestError(400, 'That spell mark is malformed.');
    if (!spellId && !ELEMENTS.includes(requestedElement)) throw new RequestError(400, 'Choose an element for an unbound cast.');

    const outcome = await withDb(async (db, client) => {
      const bender = await ensureBender(db, identity);
      const { ObjectId } = await import('mongodb');
      const spells = db.collection('spells');
      const casts = db.collection('casts');
      const at = new Date();
      let boundSpell: Record<string, any> | null = null;
      if (spellId) {
        boundSpell = await spells.findOne({ _id: new ObjectId(spellId) }) as Record<string, any> | null;
        if (!boundSpell) throw new RequestError(404, 'That spell has slipped from the book.');
      }
      const element = boundSpell?.element ?? requestedElement;
      const event = {
        eventId,
        spellId: boundSpell?._id ?? null,
        spellKey: boundSpell?.slug ?? `freehand:${element}`,
        element,
        benderId: bender._id,
        travelMs,
        pathLenM,
        client: clientValueChecked,
        at
      };
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await casts.insertOne(event, { session });
          await db.collection('benders').updateOne({ _id: bender._id }, { $set: { lastSeenAt: at } }, { session });
          if (boundSpell?._id) await spells.updateOne({ _id: boundSpell._id }, { $inc: { 'stats.casts': 1 }, $set: { 'stats.lastCastAt': at, updatedAt: at } }, { session });
        });
      } catch (error: any) {
        if (error?.code === 11000) return { recorded: false, idempotent: true, element };
        throw error;
      } finally {
        await session.endSession();
      }
      return { recorded: true, element, bound: Boolean(boundSpell) };
    });
    return json(outcome, withSessionCookie({ status: outcome.recorded ? 201 : 200 }, identity));
  } catch (error) {
    return message(error, 'The Almanac could not remember that casting.');
  }
}
