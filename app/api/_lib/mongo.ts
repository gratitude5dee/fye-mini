import type { Db, MongoClient } from 'mongodb';
import { runtime } from './http';

const workerOptions = {
  maxPoolSize: 1,
  minPoolSize: 0,
  maxIdleTimeMS: 10_000,
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 15_000,
  serverMonitoringMode: 'poll' as const
};

// The Sites Worker creates a short-lived client because Workers cannot retain
// a dependable TCP pool. The private Node gateway is a single long-running
// process on a static-EIP host, so a small reusable pool avoids TLS/auth churn
// while staying conservative for the currently unknown public traffic level.
const gatewayOptions = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 15_000,
  serverMonitoringMode: 'poll' as const
};

let gatewayClient: Promise<MongoClient> | null = null;

function usesGatewayPool() {
  return runtime('LIVING_GRIMOIRE_GATEWAY') === 'true';
}

export function atlasReady() {
  return Boolean(runtime('ATLAS_URI'));
}

/**
 * Workers must create TCP sockets inside a request handler. This deliberately
 * opens a tiny, short-lived driver pool per request instead of keeping a
 * cross-request global connection that Cloudflare can reject.
 */
export async function withDb<T>(work: (db: Db, client: MongoClient) => Promise<T>) {
  const uri = runtime('ATLAS_URI');
  if (!uri) throw new Error('ATLAS_URI is not configured.');
  const { MongoClient } = await import('mongodb');
  if (usesGatewayPool()) {
    gatewayClient ??= (async () => {
      const client = new MongoClient(uri, gatewayOptions);
      await client.connect();
      return client;
    })().catch((error) => {
      gatewayClient = null;
      throw error;
    });
    const client = await gatewayClient;
    return work(client.db(runtime('ATLAS_DB') ?? 'living_grimoire'), client);
  }
  const client = new MongoClient(uri, workerOptions);
  await client.connect();
  try {
    return await work(client.db(runtime('ATLAS_DB') ?? 'living_grimoire'), client);
  } finally {
    await client.close();
  }
}
