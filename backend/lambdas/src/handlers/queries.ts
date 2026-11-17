import type { AppSyncResolverEvent, Context } from 'aws-lambda';
import { getPool } from '../lib/db';
import { getTask, listTasks, type Task } from '../lib/taskRepository';
import { assertStatus, assertUuid, clampLimit } from '../lib/validation';
import { logger } from '../lib/logger';

type Args = { status?: string | null; limit?: number | null; id?: string };

/**
 * AppSync direct Lambda resolver for Query.* fields.
 *
 * READ PATH: Lambda -> RDS Proxy -> RDS (no hop through the Fargate server).
 * Reads are the hot path, so we keep them as short as possible.
 */
export async function handler(event: AppSyncResolverEvent<Args>, context: Context): Promise<Task[] | Task | null> {
  const field = event.info.fieldName;
  const started = Date.now();

  try {
    switch (field) {
      case 'tasks': {
        assertStatus(event.arguments.status);
        return await listTasks(getPool(), event.arguments.status, clampLimit(event.arguments.limit));
      }
      case 'task': {
        assertUuid(event.arguments.id);
        return await getTask(getPool(), event.arguments.id);
      }
      default:
        throw new Error(`Unknown query field: ${field}`);
    }
  } finally {
    logger.info('query resolved', { fieldName: field, durationMs: Date.now() - started, requestId: context.awsRequestId });
  }
}
