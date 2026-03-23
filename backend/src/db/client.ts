import { Pool } from 'pg';

// Defer connection — don't throw at module load time so the server can start
// and report a degraded /health status until DATABASE_URL is provisioned.
const connectionString = process.env.DATABASE_URL;

export const db = new Pool({
  connectionString: connectionString || 'postgresql://localhost/placeholder',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

db.on('error', (err) => {
  console.error('[db] Pool error:', err.message);
});

export async function dbQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function dbQueryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await dbQuery<T>(text, params);
  return rows[0] ?? null;
}
