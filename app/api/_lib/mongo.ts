import type { Db } from 'mongodb';
import { runtime } from './http';

const options = {
  maxPoolSize: 1,
  minPoolSize: 0,
  maxIdleTimeMS: 10_000,
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 15_000,
  serverMonitoringMode: 'poll' as const
};

export function atlasReady() {
  return Boolean(runtime('ATLAS_URI'));
}

/**
 * Workers must create TCP sockets inside a request handler. This deliberately
 * opens a tiny, short-lived driver pool per request instead of keeping a
 * cross-request global connection that Cloudflare can reject.
 */
export async function withDb<T>(work: (db: Db) => Promise<T>) {
  const uri = runtime('ATLAS_URI');
  if (!uri) throw new Error('ATLAS_URI is not configured.');
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, options);
  await client.connect();
  try {
    return await work(client.db(runtime('ATLAS_DB') ?? 'living_grimoire'));
  } finally {
    await client.close();
  }
}
