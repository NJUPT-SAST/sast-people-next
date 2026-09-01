import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';
import {
  readNonNegativeIntegerEnv,
  readPositiveIntegerEnv,
} from '@/db/pool-config';
import { logServerError } from '@/lib/server-error-log';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep SQL rendering and legacy date literals aligned with business time.
  // Date-valued columns are timestamptz; this also makes explicit SQL dates deterministic.
  options: "-c timezone=Asia/Shanghai",
  max: readPositiveIntegerEnv('DATABASE_POOL_MAX', 20),
  idleTimeoutMillis: readNonNegativeIntegerEnv(
    'DATABASE_POOL_IDLE_TIMEOUT_MS',
    30000,
  ),
  connectionTimeoutMillis: readNonNegativeIntegerEnv(
    'DATABASE_POOL_CONNECTION_TIMEOUT_MS',
    10000,
  ),
});

pool.on('error', (error) => {
  logServerError('database:pool', error, { action: 'idle-client-error' });
});

export const db = drizzle(pool, { schema });
