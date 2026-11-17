import { config } from '../config';

export class GraphQLRequestError extends Error {}

/** Minimal GraphQL-over-HTTP client for AppSync (queries + mutations). */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(config.graphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
  if (body?.errors?.length) throw new GraphQLRequestError(body.errors.map((e) => e.message).join('; '));
  if (!res.ok || !body?.data) throw new GraphQLRequestError(`Request failed with HTTP ${res.status}`);
  return body.data;
}
