import { describe, expect, it } from 'vitest';
import { tasksReducer } from './tasks';
import type { Task } from '../types';

const t = (id: string, createdAt: string, updatedAt = createdAt, status: Task['status'] = 'TODO'): Task => ({
  id,
  title: id,
  description: null,
  status,
  createdAt,
  updatedAt,
});

describe('tasksReducer', () => {
  it('sorts loaded tasks newest first', () => {
    const out = tasksReducer([], { type: 'loaded', tasks: [t('a', '2026-01-01'), t('b', '2026-01-02')] });
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('is idempotent when the same task arrives twice (mutation + subscription)', () => {
    const task = t('a', '2026-01-01');
    const once = tasksReducer([], { type: 'upsert', task });
    const twice = tasksReducer(once, { type: 'upsert', task });
    expect(twice).toHaveLength(1);
  });

  it('ignores a stale update', () => {
    const fresh = t('a', '2026-01-01', '2026-01-03', 'DONE');
    const stale = t('a', '2026-01-01', '2026-01-02', 'TODO');
    const out = tasksReducer([fresh], { type: 'upsert', task: stale });
    expect(out[0].status).toBe('DONE');
  });

  it('removes a task', () => {
    expect(tasksReducer([t('a', '2026-01-01')], { type: 'remove', id: 'a' })).toEqual([]);
  });
});
