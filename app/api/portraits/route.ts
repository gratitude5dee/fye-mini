import { deviceIdentity, withSessionCookie } from '../_lib/identity';
import { binding, json, message, readBytes, RequestError } from '../_lib/http';

type PortraitObject = { body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string }; httpEtag?: string };
type PortraitBucket = { put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>; get(key: string): Promise<PortraitObject | null> };

const MAX_PORTRAIT_BYTES = 600_000;

function gallery() {
  const bucket = binding<PortraitBucket>('SPELL_PORTRAITS');
  if (!bucket) throw new RequestError(503, 'The portrait gallery is not yet attuned.');
  return bucket;
}

function validKey(key: string) {
  return /^portraits\/[a-f\d-]{36}\.(?:webp|jpeg|png)$/i.test(key);
}

export async function POST(request: Request) {
  try {
    const identity = await deviceIdentity(request);
    const contentType = request.headers.get('content-type')?.split(';')[0].toLowerCase();
    const extension = contentType === 'image/webp' ? 'webp' : contentType === 'image/jpeg' ? 'jpeg' : contentType === 'image/png' ? 'png' : '';
    if (!extension) throw new RequestError(415, 'A portrait must be a WebP, JPEG, or PNG image.');
    const bytes = await readBytes(request, MAX_PORTRAIT_BYTES);
    if (!bytes.byteLength) throw new RequestError(400, 'The portrait is empty.');
    const key = `portraits/${crypto.randomUUID()}.${extension}`;
    await gallery().put(key, bytes, { httpMetadata: { contentType }, customMetadata: { source: 'living-grimoire' } });
    return json({ key, imageUrl: `/api/portraits?key=${encodeURIComponent(key)}` }, withSessionCookie({ status: 201 }, identity));
  } catch (error) {
    return message(error, 'The portrait could not be sealed.');
  }
}

export async function GET(request: Request) {
  try {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    if (!validKey(key)) throw new RequestError(404, 'That portrait has faded.');
    const object = await gallery().get(key);
    if (!object) throw new RequestError(404, 'That portrait has faded.');
    return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'image/webp', 'cache-control': 'public, max-age=31536000, immutable', etag: object.httpEtag ?? '' } });
  } catch (error) {
    return message(error, 'The portrait could not be read.');
  }
}
