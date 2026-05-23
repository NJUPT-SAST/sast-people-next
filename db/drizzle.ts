import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/db/schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 20, // 设置连接池的最大连接数
  idleTimeoutMillis: 30000, // 连接空闲30秒后释放
  connectionTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
