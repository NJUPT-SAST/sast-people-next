/**
 * Mock Drizzle database using pg-mem (in-memory PostgreSQL).
 * Drop-in replacement for @/db/drizzle when NEXT_PUBLIC_MOCK=true.
 *
 * This provides the exact same `db` interface with the same Drizzle query builder,
 * backed by an in-memory PostgreSQL engine instead of a real database.
 */
import { newDb, DataType } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import {
  mockUsers,
  mockFlows,
  mockFlowSteps,
  mockUserFlows,
  mockProblems,
  mockUserPoints,
  mockEmails,
} from "./data";

function escSql(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return "'{}'";
    return `ARRAY[${val.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",")}]::varchar[]`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

// Create in-memory PostgreSQL instance
const pgMem = newDb();

// Register functions that pg-mem doesn't support natively
pgMem.public.registerFunction({
  name: "now",
  returns: DataType.timestamp,
  implementation: () => new Date(),
});

// Create enum types
pgMem.public.none(
  `CREATE TYPE flow_step_type_enum AS ENUM ('registering', 'checking', 'judging', 'email', 'finished')`
);
pgMem.public.none(
  `CREATE TYPE user_flow_status_enum AS ENUM ('pending', 'accepted', 'rejected', 'ongoing')`
);

// Create tables matching the Drizzle schema
pgMem.public.none(`
  CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL,
    student_id VARCHAR(16) UNIQUE,
    email VARCHAR(254),
    phone VARCHAR(16),
    college VARCHAR(50),
    major VARCHAR(50),
    department VARCHAR(50)[] NOT NULL DEFAULT '{}',
    link_openid VARCHAR(255) UNIQUE,
    feishu_openid VARCHAR(255) UNIQUE,
    role INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
  )
`);

pgMem.public.none(`
  CREATE TABLE "flow" (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(1000),
    owner_id INTEGER NOT NULL REFERENCES "user"(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    started_at TIMESTAMP NOT NULL DEFAULT now(),
    ended_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
  )
`);

pgMem.public.none(`
  CREATE TABLE "flow_step" (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description VARCHAR(1000),
    type flow_step_type_enum NOT NULL,
    "order" INTEGER NOT NULL,
    fk_flow_id INTEGER NOT NULL REFERENCES "flow"(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    is_deleted BOOLEAN DEFAULT false
  )
`);

pgMem.public.none(`
  CREATE TABLE "user_flow" (
    id SERIAL PRIMARY KEY,
    status user_flow_status_enum NOT NULL DEFAULT 'pending',
    current_step_order INTEGER NOT NULL,
    fk_flow_id INTEGER NOT NULL REFERENCES "flow"(id),
    fk_user_id INTEGER NOT NULL REFERENCES "user"(id)
  )
`);

pgMem.public.none(`
  CREATE TABLE "problem" (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL,
    fk_flow_step_id INTEGER NOT NULL REFERENCES "flow_step"(id)
  )
`);

pgMem.public.none(`
  CREATE TABLE "email" (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    fk_flow_step_id INTEGER NOT NULL REFERENCES "flow_step"(id)
  )
`);

pgMem.public.none(`
  CREATE TABLE "user_point" (
    id SERIAL PRIMARY KEY,
    fk_user_flow_id INTEGER NOT NULL REFERENCES "user_flow"(id),
    fk_problem_id INTEGER NOT NULL REFERENCES "problem"(id),
    points INTEGER NOT NULL,
    UNIQUE(fk_user_flow_id, fk_problem_id)
  )
`);

// Seed data - insert WITHOUT explicit IDs to let SERIAL auto-increment naturally.
// Seed arrays in data.ts are ordered so that auto-assigned IDs (1,2,3...) match
// the expected IDs referenced in foreign keys.
function seedDatabase() {
  for (const u of mockUsers) {
    pgMem.public.none(
      `INSERT INTO "user" (name, student_id, email, phone, college, major, department, link_openid, feishu_openid, role, created_at, updated_at, is_deleted)
       VALUES (${escSql(u.name)}, ${escSql(u.student_id)}, ${escSql(u.email)}, ${escSql(u.phone)}, ${escSql(u.college)}, ${escSql(u.major)}, ${escSql(u.department)}, ${escSql(u.link_openid)}, ${escSql(u.feishu_openid)}, ${escSql(u.role)}, ${escSql(u.created_at)}, ${escSql(u.updated_at)}, ${escSql(u.is_deleted)})`
    );
  }

  for (const f of mockFlows) {
    pgMem.public.none(
      `INSERT INTO "flow" (title, description, owner_id, created_at, started_at, ended_at, updated_at, is_deleted)
       VALUES (${escSql(f.title)}, ${escSql(f.description)}, ${escSql(f.owner_id)}, ${escSql(f.created_at)}, ${escSql(f.started_at)}, ${escSql(f.ended_at)}, ${escSql(f.updated_at)}, ${escSql(f.is_deleted)})`
    );
  }

  for (const fs of mockFlowSteps) {
    pgMem.public.none(
      `INSERT INTO "flow_step" (title, description, type, "order", fk_flow_id, created_at, updated_at, is_deleted)
       VALUES (${escSql(fs.title)}, ${escSql(fs.description)}, ${escSql(fs.type)}, ${escSql(fs.order)}, ${escSql(fs.fk_flow_id)}, ${escSql(fs.created_at)}, ${escSql(fs.updated_at)}, ${escSql(fs.is_deleted)})`
    );
  }

  for (const uf of mockUserFlows) {
    pgMem.public.none(
      `INSERT INTO "user_flow" (status, current_step_order, fk_flow_id, fk_user_id)
       VALUES (${escSql(uf.status)}, ${escSql(uf.current_step_order)}, ${escSql(uf.fk_flow_id)}, ${escSql(uf.fk_user_id)})`
    );
  }

  for (const p of mockProblems) {
    pgMem.public.none(
      `INSERT INTO "problem" (title, score, fk_flow_step_id)
       VALUES (${escSql(p.title)}, ${escSql(p.score)}, ${escSql(p.fk_flow_step_id)})`
    );
  }

  for (const up of mockUserPoints) {
    pgMem.public.none(
      `INSERT INTO "user_point" (fk_user_flow_id, fk_problem_id, points)
       VALUES (${escSql(up.fk_user_flow_id)}, ${escSql(up.fk_problem_id)}, ${escSql(up.points)})`
    );
  }

  for (const e of mockEmails) {
    pgMem.public.none(
      `INSERT INTO "email" (subject, content, fk_flow_step_id)
       VALUES (${escSql(e.subject)}, ${escSql(e.content)}, ${escSql(e.fk_flow_step_id)})`
    );
  }
}

seedDatabase();

// Create a mock Pool adapter compatible with drizzle-orm/node-postgres.
// pg-mem doesn't support rowMode:'array' which drizzle-orm uses internally.
// We patch the Pool's query method to handle rowMode by converting object rows to arrays.
const { Pool: PgMemPool } = pgMem.adapters.createPg();
const rawPool = new PgMemPool();

/**
 * Convert object rows to array rows for Drizzle's rowMode:'array'.
 * pg-mem returns fields:[] (empty), so we use Object.keys() on the first row
 * to determine column order (which matches the SELECT clause order).
 */
function convertToArrayRows(result: { rows: Record<string, unknown>[]; fields?: { name: string }[] }) {
  if (!result.rows || result.rows.length === 0) return;
  const fieldNames =
    result.fields && result.fields.length > 0
      ? result.fields.map((f) => f.name)
      : Object.keys(result.rows[0]);
  result.rows = result.rows.map((row: Record<string, unknown>) =>
    fieldNames.map((name: string) => row[name])
  ) as unknown as Record<string, unknown>[];
}

function patchQueryFn(origQuery: (...args: unknown[]) => Promise<{ rows: Record<string, unknown>[]; fields?: { name: string }[] }>) {
  return async (...args: unknown[]) => {
    const queryConfig = args[0];
    let hasRowMode = false;
    if (
      queryConfig &&
      typeof queryConfig === "object" &&
      "rowMode" in (queryConfig as Record<string, unknown>)
    ) {
      hasRowMode = (queryConfig as Record<string, unknown>).rowMode === "array";
      delete (queryConfig as Record<string, unknown>).rowMode;
    }
    const result = await origQuery(...args);
    if (hasRowMode) convertToArrayRows(result);
    return result;
  };
}

// Wrap the pool to intercept queries with rowMode:'array'
const pool = new Proxy(rawPool, {
  get(target, prop, receiver) {
    if (prop === "query") {
      return patchQueryFn(target.query.bind(target));
    }
    if (prop === "connect") {
      return async () => {
        const client = await target.connect();
        client.query = patchQueryFn(client.query.bind(client));
        return client;
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});

export const db = drizzle(pool, { schema });

console.log("[Mock] In-memory database initialized with seed data");
