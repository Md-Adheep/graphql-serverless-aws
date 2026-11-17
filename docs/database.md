# Database setup and security

## Configuration

| Setting | Value | Why |
|---|---|---|
| Engine | PostgreSQL 16 (RDS) | Managed backups, patching, monitoring |
| Instance | `db.t4g.micro` (Graviton, free-tier eligible) | Cost. Vertical scaling is one variable change. |
| Storage | gp3, 20 GiB, **autoscaling to 100 GiB**, encrypted | Grows without downtime |
| Network | Isolated **database subnets** in 2 AZs, `publicly_accessible = false` | No route to the internet in either direction |
| Access path | Apps → **RDS Proxy** → instance. The instance SG only admits the proxy SG. | Connection pooling for Lambda bursts, faster failover, and a single choke point |
| Authentication | Master password **managed by RDS** in Secrets Manager. Apps use **IAM auth** at the proxy (`iam_auth = REQUIRED`). | No passwords in application config |
| Encryption in transit | `rds.force_ssl = 1`, proxy `require_tls = true`, clients verify certs | Rejects any plaintext connection |
| Backups | 7-day automated backups, point-in-time recovery, final snapshot when `allow_destroy = false` | Recovery |
| Multi-AZ | Off by default (cost). `db_multi_az = true` for production. | Synchronous standby, automatic failover |
| Read replica | Optional, `db_create_read_replica = true` | Read scaling (see [scaling.md](scaling.md)) |
| Logging | `postgresql` and `upgrade` logs → CloudWatch. Slow queries (> 1 s) and connections are logged. | Troubleshooting and auditing |
| Monitoring | Enhanced monitoring (60 s OS metrics) and CloudWatch alarms | See [monitoring.md](monitoring.md) |
| Maintenance | Auto minor-version upgrades, Sunday 04:30 UTC window, backups 03:00 UTC | Patched without intervention |

## How applications connect (IAM authentication)

```ts
// backend/lambdas/src/lib/db.ts (same pattern in the Fargate server)
const signer = new Signer({ hostname: proxyEndpoint, port: 5432, username: 'app_admin', region });
new pg.Pool({
  host: proxyEndpoint,
  user: 'app_admin',
  password: () => signer.getAuthToken(),   // fresh 15-min token for every new connection
  ssl: { rejectUnauthorized: true },
  max: 1,                                  // Lambda: one connection per container
});
```

The IAM policy allows `rds-db:connect` **only** on
`arn:aws:rds-db:<region>:<account>:dbuser:<proxy-resource-id>/app_admin`.
Leaked code or environment variables contain **no credential at all**.

## Schema and migrations

```sql
-- database/migrations/001_create_tasks.sql
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200) NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','DONE')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
```

**How migrations run:** the database is unreachable from GitHub's runners (by design), so
migrations run in the `migrate` Lambda **inside the VPC**. CI invokes it after every deploy:

1. Takes a `pg_advisory_lock`, so concurrent deploys can't migrate at the same time.
2. Creates `schema_migrations` if needed and skips versions already applied.
3. Runs each new file in its **own transaction** and records it. A failure rolls back that
   migration, releases the lock and fails the pipeline, which triggers the rollback.

The same `.sql` files are bundled into the Lambda (esbuild text loader) **and** mounted into
`docker-compose` for local development, so there's one source of truth.

**Writing safe migrations:** use the *expand → migrate → contract* pattern. Add nullable columns
or new tables first, deploy code that handles both shapes, and drop old columns in a later release.
That way the previous application version (a rollback target) keeps working against the new schema.

## Data-access security in code

- All SQL is **parameterised** (`$1, $2, ...`). User input is never concatenated into a query.
- IDs are validated as UUIDs **before** reaching the database, in both the Lambdas and the server.
- Enum, length and limit validation in both layers (the database `CHECK` constraints are a third layer).
- `LIMIT` is capped at 100 to stop unbounded scans.
- The server masks database errors as `Internal server error`. Details go to CloudWatch, never to the client.

## Operations

```bash
# Connection count / CPU at a glance
aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=graphql-app-prod \
  --start-time $(date -u -d '-1 hour' +%FT%TZ) --end-time $(date -u +%FT%TZ) --period 300 --statistics Maximum

# Point-in-time restore to a new instance (disaster recovery)
aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier graphql-app-prod \
  --target-db-instance-identifier graphql-app-prod-restore --restore-time 2026-01-01T12:00:00Z
```
