import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Single shared pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const connectionString = process.env.DATABASE_URL ?? "";
// Local Postgres has no TLS listener; hosted providers (Supabase, etc.) require SSL.
const needsSsl = connectionString.length > 0 && !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
