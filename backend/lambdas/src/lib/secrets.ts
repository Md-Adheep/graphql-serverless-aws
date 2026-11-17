import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
const cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

/**
 * Reads a secret from AWS Secrets Manager at runtime (the Lambda env only holds the ARN).
 * Cached for 5 minutes per container: cheap, fast, and still picks up a rotated secret quickly.
 */
export async function getSecret(secretId: string): Promise<string> {
  const hit = cache.get(secretId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) throw new Error(`Secret ${secretId} has no string value`);
  cache.set(secretId, { value: res.SecretString, expiresAt: Date.now() + TTL_MS });
  return res.SecretString;
}

export function clearSecretCache() {
  cache.clear();
}
