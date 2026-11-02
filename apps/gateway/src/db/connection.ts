import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { logger } from '@leash/shared';

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: DrizzleDb | null = null;
let client: ReturnType<typeof postgres> | null = null;

export function getDb(): DrizzleDb | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  if (!cachedDb) {
    try {
      client = postgres(databaseUrl, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 5,
        onnotice: () => {},
      });
      cachedDb = drizzle(client, { schema });
      logger.info('Connected to PostgreSQL database');
    } catch (err) {
      logger.error('Failed to connect to PostgreSQL', { error: String(err) });
      return null;
    }
  }

  return cachedDb;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end();
    cachedDb = null;
    client = null;
  }
}
