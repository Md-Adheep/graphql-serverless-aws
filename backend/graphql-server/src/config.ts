export type DbAuthMode = 'iam' | 'password';

export interface Config {
  port: number;
  region: string;
  internalToken: string;
  introspection: boolean;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    authMode: DbAuthMode;
    password?: string;
    ssl: boolean;
    maxConnections: number;
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(env = process.env): Config {
  const authMode = (env.DB_AUTH_MODE ?? 'iam') as DbAuthMode;
  if (authMode !== 'iam' && authMode !== 'password') {
    throw new Error(`DB_AUTH_MODE must be "iam" or "password", got "${authMode}"`);
  }

  // INTERNAL_API_TOKEN is injected by ECS from AWS Secrets Manager (never baked into the image).
  const internalToken = required(env, 'INTERNAL_API_TOKEN');
  if (internalToken.length < 16) throw new Error('INTERNAL_API_TOKEN is too short');

  return {
    port: Number(env.PORT ?? 4000),
    region: env.AWS_REGION ?? 'us-east-2',
    internalToken,
    introspection: env.ENABLE_INTROSPECTION === 'true',
    db: {
      host: required(env, 'DB_HOST'),
      port: Number(env.DB_PORT ?? 5432),
      database: required(env, 'DB_NAME'),
      user: required(env, 'DB_USER'),
      authMode,
      password: authMode === 'password' ? required(env, 'DB_PASSWORD') : undefined,
      ssl: env.DB_SSL !== 'false',
      maxConnections: Number(env.DB_POOL_MAX ?? 10),
    },
  };
}
