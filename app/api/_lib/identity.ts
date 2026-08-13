import type { Db, ObjectId } from 'mongodb';
import { RequestError, runtime } from './http';

const COOKIE_NAME = 'lg_bender';
const YEAR = 365 * 24 * 60 * 60;
const adjectives = ['Ash', 'Quiet', 'Silver', 'Ember', 'Moss', 'Tide', 'Cinder', 'Wandering', 'Pale', 'Luminous', 'Hollow', 'Swift'];
const nouns = ['Cartographer', 'Heron', 'Lantern', 'Mason', 'Comet', 'Keeper', 'Fox', 'Mariner', 'Vessel', 'Wren', 'Oracle', 'Weaver'];

export type DeviceIdentity = { tokenId: string; setCookie: string };
export type Bender = { _id: ObjectId; handle: string; sigilSeed: string };

const utf8 = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesFromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cookieValue(request: Request, name: string) {
  const prefix = `${name}=`;
  return request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function signingKey() {
  const secret = runtime('BENDER_TOKEN_SECRET');
  if (!secret || secret.length < 24) return null;
  return crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(tokenId: string, key: CryptoKey) {
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8.encode(tokenId))));
}

async function validToken(tokenId: string, signature: string, key: CryptoKey) {
  if (!/^[a-f\d-]{36}$/i.test(tokenId) || !/^[A-Za-z0-9_-]{20,64}$/.test(signature)) return false;
  try {
    return crypto.subtle.verify('HMAC', key, bytesFromBase64Url(signature), utf8.encode(tokenId));
  } catch {
    return false;
  }
}

function sessionCookie(value: string) {
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * The browser only holds a signed opaque device token. Its Mongo ObjectId is
 * resolved server-side, so clients cannot choose another bender's rate bucket.
 */
export async function deviceIdentity(request: Request): Promise<DeviceIdentity> {
  const key = await signingKey();
  if (!key) throw new RequestError(503, 'Anonymous identity is not yet attuned. Try again after the server seal is configured.');
  const encoded = cookieValue(request, COOKIE_NAME);
  if (encoded) {
    const separator = encoded.lastIndexOf('.');
    const tokenId = encoded.slice(0, separator);
    const signature = encoded.slice(separator + 1);
    if (separator > 0 && await validToken(tokenId, signature, key)) return { tokenId, setCookie: '' };
  }
  const tokenId = crypto.randomUUID();
  const signature = await sign(tokenId, key);
  return { tokenId, setCookie: sessionCookie(`${tokenId}.${signature}`) };
}

function hash(value: string) {
  return [...value].reduce((result, character) => (result * 33 + character.charCodeAt(0)) >>> 0, 5381);
}

function handleFor(tokenId: string) {
  const value = hash(tokenId);
  const suffix = tokenId.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${adjectives[value % adjectives.length]} ${nouns[Math.floor(value / adjectives.length) % nouns.length]} ${suffix}`;
}

export async function ensureBender(db: Db, identity: DeviceIdentity): Promise<Bender> {
  const moment = new Date();
  const bender = await db.collection('benders').findOneAndUpdate(
    { tokenId: identity.tokenId },
    {
      $set: { lastSeenAt: moment },
      $setOnInsert: { tokenId: identity.tokenId, handle: handleFor(identity.tokenId), sigilSeed: identity.tokenId.replace(/-/g, ''), bookmarks: [], createdAt: moment }
    },
    { upsert: true, returnDocument: 'after' }
  );
  if (!bender?._id || typeof bender.handle !== 'string' || typeof bender.sigilSeed !== 'string') throw new Error('Could not resolve anonymous bender.');
  return { _id: bender._id as ObjectId, handle: bender.handle, sigilSeed: bender.sigilSeed };
}

export async function consumeRateLimit(db: Db, benderId: ObjectId, action: 'spellwright' | 'bind', limit: number) {
  const moment = new Date();
  const since = new Date(moment.getTime() - 60 * 60 * 1000);
  const log = db.collection('craft_log');
  const used = await log.countDocuments({ kind: 'rate', action, benderId, createdAt: { $gte: since } });
  if (used >= limit) throw new RequestError(429, action === 'spellwright' ? 'The Spellwright needs an hour of quiet before another turn.' : 'This binder has reached six pages for the hour. Return when the ink cools.');
  await log.insertOne({ kind: 'rate', action, benderId, createdAt: moment });
}

export function withSessionCookie<T extends ResponseInit>(init: T, identity: DeviceIdentity): T {
  if (!identity.setCookie) return init;
  const headers = new Headers(init.headers);
  headers.set('set-cookie', identity.setCookie);
  return { ...init, headers };
}
