import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSyncResolverEvent, Context } from 'aws-lambda';

vi.mock('../src/lib/secrets', () => ({ getSecret: vi.fn().mockResolvedValue('shared-internal-token') }));

const { handler } = await import('../src/handlers/mutations');

const ID = '3f1c2b7e-8d4a-4c1e-9f2a-1b2c3d4e5f60';
const ctx = { awsRequestId: 'req-42' } as Context;
const event = (fieldName: string, args: Record<string, unknown>) =>
  ({ info: { fieldName }, arguments: args }) as unknown as AppSyncResolverEvent<any>;
const task = { id: ID, title: 't', description: null, status: 'TODO', createdAt: 'x', updatedAt: 'x' };

describe('mutations handler', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.GRAPHQL_SERVER_URL = 'http://internal-alb.local/graphql';
    process.env.INTERNAL_TOKEN_SECRET_ARN = 'arn:aws:secretsmanager:us-east-2:123:secret:token';
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('forwards createTask to the private server with the internal token', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { createTask: task } }), { status: 200 }));
    const out = await handler(event('createTask', { input: { title: 't' } }), ctx);

    expect(out).toEqual(task);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://internal-alb.local/graphql');
    expect(init.headers['x-internal-token']).toBe('shared-internal-token');
    expect(init.headers['x-request-id']).toBe('req-42');
    expect(JSON.parse(init.body).variables).toEqual({ input: { title: 't' } });
  });

  it('surfaces GraphQL errors from the private server', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'Task x not found', extensions: { code: 'NOT_FOUND' } }] }), { status: 200 }),
    );
    await expect(handler(event('updateTask', { id: ID, input: { status: 'DONE' } }), ctx)).rejects.toThrow(/not found/);
  });

  it('fails clearly when the ALB returns a non-JSON 502', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    await expect(handler(event('deleteTask', { id: ID }), ctx)).rejects.toThrow(/HTTP 502/);
  });

  it('validates ids before calling the server', async () => {
    await expect(handler(event('deleteTask', { id: 'nope' }), ctx)).rejects.toThrow(/UUID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
