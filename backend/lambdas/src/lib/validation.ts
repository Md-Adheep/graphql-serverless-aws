export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function assertUuid(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new ValidationError('id must be a valid UUID');
}

export function assertStatus(status: unknown): asserts status is TaskStatus | null | undefined {
  if (status != null && !STATUSES.includes(status as TaskStatus)) {
    throw new ValidationError(`status must be one of ${STATUSES.join(', ')}`);
  }
}

export function clampLimit(limit: unknown): number {
  if (limit == null) return 50;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw new ValidationError('limit must be a positive integer');
  }
  return Math.min(limit, 100);
}
