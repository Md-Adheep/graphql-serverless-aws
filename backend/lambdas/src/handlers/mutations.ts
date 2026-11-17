import type { AppSyncResolverEvent, Context } from 'aws-lambda';
import { callGraphQLServer } from '../lib/graphqlServer';
import { assertUuid } from '../lib/validation';
import { logger } from '../lib/logger';
import type { Task } from '../lib/taskRepository';

const TASK_FIELDS = 'id title description status createdAt updatedAt';

const CREATE = `mutation CreateTask($input: CreateTaskInput!) { createTask(input: $input) { ${TASK_FIELDS} } }`;
const UPDATE = `mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) { updateTask(id: $id, input: $input) { ${TASK_FIELDS} } }`;
const DELETE = `mutation DeleteTask($id: ID!) { deleteTask(id: $id) { ${TASK_FIELDS} } }`;

type Args = { id?: string; input?: Record<string, unknown> };

/**
 * AppSync direct Lambda resolver for Mutation.* fields.
 *
 * WRITE PATH: Lambda -> internal ALB -> private Apollo server (ECS Fargate) -> RDS Proxy -> RDS.
 * The Fargate service owns business rules for writes. When this resolver returns, AppSync
 * automatically pushes the result to clients subscribed via @aws_subscribe.
 */
export async function handler(event: AppSyncResolverEvent<Args>, context: Context): Promise<Task | null> {
  const field = event.info.fieldName;
  const requestId = context.awsRequestId;
  const started = Date.now();

  try {
    switch (field) {
      case 'createTask': {
        const data = await callGraphQLServer<{ createTask: Task }>(CREATE, { input: event.arguments.input }, requestId);
        return data.createTask;
      }
      case 'updateTask': {
        assertUuid(event.arguments.id);
        const data = await callGraphQLServer<{ updateTask: Task }>(
          UPDATE,
          { id: event.arguments.id, input: event.arguments.input },
          requestId,
        );
        return data.updateTask;
      }
      case 'deleteTask': {
        assertUuid(event.arguments.id);
        const data = await callGraphQLServer<{ deleteTask: Task | null }>(DELETE, { id: event.arguments.id }, requestId);
        return data.deleteTask;
      }
      default:
        throw new Error(`Unknown mutation field: ${field}`);
    }
  } finally {
    logger.info('mutation resolved', { fieldName: field, durationMs: Date.now() - started, requestId });
  }
}
