import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import type { Config } from './config.js';

/**
 * Connection pool to RDS (through RDS Proxy).
 *
 * In AWS we use IAM database authentication: the ECS task role is allowed `rds-db:connect`
 * on the proxy, and every new connection gets a short-lived (15 min) signed token as its
 * password. No database password exists anywhere in this service's configuration.
 */
export function createPool(config: Config['db'], region: string): pg.Pool {
  let password: string | (() => Promise<string>) | undefined = config.password;

  if (config.authMode === 'iam') {
    const signer = new Signer({ hostname: config.host, port: config.port, username: config.user, region });
    password = () => signer.getAuthToken();
  }

  return new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password,
    max: config.maxConnections,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // RDS Proxy presents an Amazon Trust Services certificate, which Node trusts by default.
    ssl: config.ssl ? { rejectUnauthorized: true } : false,
  });
}
