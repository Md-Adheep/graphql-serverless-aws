import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSyncResolverEvent, Context } from 'aws-lambda';

const query = vi.fn();
vi.mock('../src/lib/db', () => ({ getPool: () => ({ query }) }));

const { handler } = await import('../src/handlers/queries');

const ID = '3f1c2b7e-8d4a-4c1e-9f2a-1b2c3d4e5f60';
const ctx = { awsRequestId: 'req-1' } as Context;
const event = (fieldName: string, args: Record<string, unknown>) =>
  ({ info: { fieldName }, arguments: args }) as unknown as AppSyncResolverEvent<any>;
const row = {
  id: ID,
  title: 'a',
  description: null,
  status: 'TODO',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-02T00:00:00Z'),
};

describe('queries handler', () => {
  beforeEach(() => query.mockReset());

  it('lists tasks with parameterised SQL and maps to AWSDateTime strings', async () => {
    query.mockResolvedValue({ rows: [row] });
    const out = await handler(event('tasks', { status: 'TODO', limit: 500 }), ctx);
    expect(out).toEqual([
      { id: ID, title: 'a', description: null, status: 'TODO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(query.mock.calls[0][1]).toEqual(['TODO', 100]); // limit clamped to 100
  });

  it('returns null for a missing task', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await handler(event('task', { id: ID }), ctx)).toBeNull();
  });

  it('rejects an invalid id without querying the database', async () => {
    await expect(handler(event('task', { id: "1' OR '1'='1" }), ctx)).rejects.toThrow(/UUID/);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown status', async () => {
    await expect(handler(event('tasks', { status: 'BOGUS' }), ctx)).rejects.toThrow(/status/);
  });
});
