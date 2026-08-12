import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import { logServerError } from '@/lib/server-error-log';

const readPositiveIntegerEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: readPositiveIntegerEnv('DATABASE_POOL_MAX', 20),
  idleTimeoutMillis: readPositiveIntegerEnv('DATABASE_POOL_IDLE_TIMEOUT_MS', 30000),
  connectionTimeoutMillis: readPositiveIntegerEnv(
    'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
    10000,
  ),
});

pool.on('error', (error) => {
  logServerError('database:pool', error, { action: 'idle-client-error' });
});

export const db = drizzle(pool, { schema });
