import { getSecret } from './secrets';
import { requiredEnv } from './env';
import { logger } from './logger';

export class UpstreamError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/**
 * Calls the private Apollo server on ECS Fargate through the *internal* ALB.
 * The URL resolves only inside the VPC; the shared token comes from Secrets Manager.
 */
export async function callGraphQLServer<T>(
  query: string,
  variables: Record<string, unknown>,
  requestId: string,
): Promise<T> {
  const url = requiredEnv('GRAPHQL_SERVER_URL');
  const token = await getSecret(requiredEnv('INTERNAL_TOKEN_SECRET_ARN'));
  const started = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': token, 'x-request-id': requestId },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(Number(process.env.GRAPHQL_SERVER_TIMEOUT_MS ?? 8000)),
  });

  let body: GraphQLResponse<T> | undefined;
  try {
    body = (await res.json()) as GraphQLResponse<T>;
  } catch {
    // non-JSON body (e.g. ALB 502 HTML page) - handled below
  }

  logger.info('graphql server call', { status: res.status, durationMs: Date.now() - started, requestId });

  if (body?.errors?.length) {
    const first = body.errors[0];
    throw new UpstreamError(body.errors.map((e) => e.message).join('; '), first.extensions?.code);
  }
  if (!res.ok || !body?.data) {
    throw new UpstreamError(`GraphQL server responded with HTTP ${res.status}`);
  }
  return body.data;
}
