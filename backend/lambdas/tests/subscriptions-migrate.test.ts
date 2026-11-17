import { describe, expect, it, vi } from 'vitest';
import type { AppSyncResolverEvent } from 'aws-lambda';
import { handler as subscribe } from '../src/handlers/subscriptions';
import { MIGRATIONS, runMigrations } from '../src/handlers/migrate';

const event = (fieldName: string, args: Record<string, unknown>) =>
  ({ info: { fieldName }, arguments: args, identity: { sourceIp: ['1.2.3.4'] } }) as unknown as AppSyncResolverEvent<any>;

describe('subscriptions handler', () => {
  it('allows a subscription without a filter', async () => {
    expect(await subscribe(event('onTaskCreated', {}))).toBeNull();
  });

  it('rejects a subscription with an invalid id filter', async () => {
    await expect(subscribe(event('onTaskUpdated', { id: 'bad' }))).rejects.toThrow(/UUID/);
  });
});

describe('migrations', () => {
  it('bundles the SQL files from /database/migrations in order', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(['001_create_tasks', '002_seed_tasks']);
    expect(MIGRATIONS[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS tasks/);
  });

  it('skips already-applied migrations and records new ones', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.startsWith('SELECT version')) return { rows: [{ version: '001_create_tasks' }] };
        return { rows: [] };
      }),
    };
    const applied = await runMigrations(client as any);
    expect(applied).toEqual(['002_seed_tasks']);
    expect(statements).toContain('COMMIT');
    expect(statements.at(-1)).toMatch(/pg_advisory_unlock/);
  });

  it('rolls back and releases the lock when a migration fails', async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.startsWith('SELECT version')) return { rows: [] };
        if (sql.includes('CREATE TABLE IF NOT EXISTS tasks')) throw new Error('boom');
        return { rows: [] };
      }),
    };
    await expect(runMigrations(client as any)).rejects.toThrow('boom');
    expect(statements).toContain('ROLLBACK');
    expect(statements.at(-1)).toMatch(/pg_advisory_unlock/);
  });
});
