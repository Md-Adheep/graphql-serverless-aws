import type { AppSyncResolverEvent } from 'aws-lambda';
import { assertUuid } from '../lib/validation';
import { logger } from '../lib/logger';

type Args = { id?: string | null };

/**
 * AppSync direct Lambda resolver for Subscription.* fields.
 *
 * AppSync owns the WebSocket connections and fan-out (scales to millions of connections with no
 * servers to manage). This Lambda runs once when a client *subscribes*: it validates the request
 * and can reject it (throwing = subscription refused). Returning null lets the subscription start.
 */
export async function handler(event: AppSyncResolverEvent<Args>): Promise<null> {
  const field = event.info.fieldName;

  if (event.arguments.id != null) assertUuid(event.arguments.id);

  const identity = event.identity as { sourceIp?: string[] } | null | undefined;
  logger.info('subscription started', {
    fieldName: field,
    filterId: event.arguments.id ?? null,
    sourceIp: identity?.sourceIp?.[0],
  });
  return null;
}
