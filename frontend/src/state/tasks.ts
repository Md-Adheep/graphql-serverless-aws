import type { Task } from '../types';

export type TaskAction =
  | { type: 'loaded'; tasks: Task[] }
  | { type: 'upsert'; task: Task }
  | { type: 'remove'; id: string };

const byNewest = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);

/**
 * Pure reducer so the same event arriving twice (our own mutation response AND the
 * subscription push for it) is idempotent.
 */
export function tasksReducer(state: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'loaded':
      return [...action.tasks].sort(byNewest);
    case 'upsert': {
      const existing = state.find((t) => t.id === action.task.id);
      if (existing && existing.updatedAt > action.task.updatedAt) return state; // stale event
      const rest = state.filter((t) => t.id !== action.task.id);
      return [...rest, action.task].sort(byNewest);
    }
    case 'remove':
      return state.filter((t) => t.id !== action.id);
  }
}
