import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import { requiredEnv } from './env';

let pool: pg.Pool | undefined;

/**
 * One pool per Lambda execution environment, created lazily and reused across invocations.
 *
 * - Connects to RDS **Proxy**, not the instance, so thousands of concurrent Lambdas share a
 *   small set of real DB connections instead of exhausting `max_connections`.
 * - `max: 1` because a Lambda container handles one request at a time.
 * - IAM auth: the function role has `rds-db:connect`; each new connection uses a 15-minute
 *   signed token as its password. No DB password is stored in Lambda config or code.
 */
export function getPool(): pg.Pool {
  if (pool) return pool;

  const host = requiredEnv('DB_HOST');
  const port = Number(process.env.DB_PORT ?? 5432);
  const user = requiredEnv('DB_USER');
  const authMode = process.env.DB_AUTH_MODE ?? 'iam';

  const password =
    authMode === 'iam'
      ? (() => {
          const signer = new Signer({ hostname: host, port, username: user, region: process.env.AWS_REGION });
          return () => signer.getAuthToken();
        })()
      : requiredEnv('DB_PASSWORD');

  pool = new pg.Pool({
    host,
    port,
    user,
    password,
    database: requiredEnv('DB_NAME'),
    max: 1,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true },
  });
  pool.on('error', () => {
    // A broken idle connection: drop the pool so the next invocation reconnects cleanly.
    pool = undefined;
  });
  return pool;
}
