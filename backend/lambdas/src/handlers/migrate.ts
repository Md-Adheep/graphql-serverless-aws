import type pg from 'pg';
import { getPool } from '../lib/db';
import { logger } from '../lib/logger';
// Bundled as plain text by esbuild (loader: { '.sql': 'text' }); the same files seed docker-compose.
import m001 from '../../../../database/migrations/001_create_tasks.sql';
import m002 from '../../../../database/migrations/002_seed_tasks.sql';

export const MIGRATIONS: { version: string; sql: string }[] = [
  { version: '001_create_tasks', sql: m001 },
  { version: '002_seed_tasks', sql: m002 },
];

const LOCK_ID = 72_617_301; // arbitrary constant for pg_advisory_lock

/**
 * Applies pending SQL migrations. Invoked by the CI/CD pipeline after each backend deploy
 * (`serverless invoke -f migrate`). RDS is in an isolated subnet, so the migration runner
 * has to live inside the VPC - a Lambda is the cheapest way to do that.
 *
 * Each migration runs in its own transaction and is recorded in schema_migrations.
 * An advisory lock prevents two concurrent deploys from migrating at the same time.
 */
export async function runMigrations(client: pg.PoolClient | pg.Client): Promise<string[]> {
  const applied: string[] = [];
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));

    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
        await client.query('COMMIT');
        applied.push(m.version);
        logger.info('migration applied', { version: m.version });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
  }
  return applied;
}

export async function handler(): Promise<{ applied: string[] }> {
  const client = await getPool().connect();
  try {
    const applied = await runMigrations(client);
    logger.info('migrations complete', { applied });
    return { applied };
  } finally {
    client.release();
  }
}
