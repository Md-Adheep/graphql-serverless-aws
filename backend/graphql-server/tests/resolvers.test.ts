import { describe, expect, it, beforeEach } from 'vitest';
import { createApolloServer } from '../src/app.js';
import type { Context } from '../src/resolvers.js';
import type { CreateTaskInput, Task, TaskRepository, UpdateTaskInput } from '../src/repository.js';

const ID = '3f1c2b7e-8d4a-4c1e-9f2a-1b2c3d4e5f60';

class InMemoryRepo implements TaskRepository {
  tasks = new Map<string, Task>();
  async list() { return [...this.tasks.values()]; }
  async get(id: string) { return this.tasks.get(id) ?? null; }
  async create(input: CreateTaskInput) {
    const now = new Date().toISOString();
    const task: Task = { id: ID, title: input.title, description: input.description ?? null, status: input.status ?? 'TODO', createdAt: now, updatedAt: now };
    this.tasks.set(task.id, task);
    return task;
  }
  async update(id: string, input: UpdateTaskInput) {
    const t = this.tasks.get(id);
    if (!t) return null;
    const next = { ...t, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v != null)) } as Task;
    this.tasks.set(id, next);
    return next;
  }
  async delete(id: string) {
    const t = this.tasks.get(id) ?? null;
    this.tasks.delete(id);
    return t;
  }
  async ping() {}
}

describe('GraphQL resolvers', () => {
  let repo: InMemoryRepo;
  const server = createApolloServer(false);
  const exec = async (query: string, variables?: Record<string, unknown>) => {
    const res = await server.executeOperation<Record<string, any>>(
      { query, variables },
      { contextValue: { repo, requestId: 'test' } satisfies Context },
    );
    if (res.body.kind !== 'single') throw new Error('expected single result');
    return res.body.singleResult;
  };

  beforeEach(() => {
    repo = new InMemoryRepo();
  });

  it('creates a task and trims the title', async () => {
    const r = await exec('mutation($i: CreateTaskInput!){ createTask(input:$i){ id title status } }', {
      i: { title: '  Write docs  ' },
    });
    expect(r.errors).toBeUndefined();
    expect(r.data?.createTask).toEqual({ id: ID, title: 'Write docs', status: 'TODO' });
  });

  it('rejects an empty title with BAD_USER_INPUT', async () => {
    const r = await exec('mutation{ createTask(input:{title:"   "}){ id } }');
    expect(r.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('rejects a malformed id before hitting the database', async () => {
    const r = await exec('{ task(id:"not-a-uuid"){ id } }');
    expect(r.errors?.[0].extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('returns NOT_FOUND when updating a missing task', async () => {
    const r = await exec(`mutation{ updateTask(id:"${ID}", input:{status:DONE}){ id } }`);
    expect(r.errors?.[0].extensions?.code).toBe('NOT_FOUND');
  });

  it('updates and deletes an existing task', async () => {
    await repo.create({ title: 'a' });
    const u = await exec(`mutation{ updateTask(id:"${ID}", input:{status:DONE}){ status } }`);
    expect(u.data?.updateTask.status).toBe('DONE');
    const d = await exec(`mutation{ deleteTask(id:"${ID}"){ id } }`);
    expect(d.data?.deleteTask.id).toBe(ID);
    expect(repo.tasks.size).toBe(0);
  });

  it('masks unexpected errors so internals do not leak', async () => {
    repo.list = async () => {
      throw new Error('connection to 10.0.1.5 refused');
    };
    const r = await exec('{ tasks { id } }');
    expect(r.errors?.[0].message).toBe('Internal server error');
  });
});
