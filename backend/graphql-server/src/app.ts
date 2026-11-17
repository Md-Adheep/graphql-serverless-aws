import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { unwrapResolverError } from '@apollo/server/errors';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { typeDefs } from './schema.js';
import { resolvers, type Context } from './resolvers.js';
import { requireInternalToken } from './auth.js';
import type { TaskRepository } from './repository.js';
import { logger } from './logger.js';

export interface AppOptions {
  repo: TaskRepository;
  internalToken: string;
  introspection: boolean;
}

/** Hide internal error details (SQL, stack traces) from callers; log them instead. */
export function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error);
  if (original instanceof GraphQLError) return formatted;
  logger.error('unhandled resolver error', { error: String(original), path: formatted.path });
  return { message: 'Internal server error', path: formatted.path, extensions: { code: 'INTERNAL_SERVER_ERROR' } };
}

export function createApolloServer(introspection: boolean, httpServer?: http.Server) {
  return new ApolloServer<Context>({
    typeDefs,
    resolvers,
    introspection,
    formatError,
    plugins: httpServer ? [ApolloServerPluginDrainHttpServer({ httpServer })] : [],
  });
}

export async function createApp(opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  const httpServer = http.createServer(app);
  const apollo = createApolloServer(opts.introspection, httpServer);
  await apollo.start();

  // Liveness - used by the ALB target group and the container health check.
  // Deliberately does NOT touch the DB, so a DB blip doesn't make ECS kill every task.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness - checks the DB path end to end (used by operators / smoke tests).
  app.get('/ready', async (_req, res) => {
    try {
      await opts.repo.ping();
      res.json({ status: 'ready' });
    } catch (err) {
      logger.warn('readiness check failed', { error: String(err) });
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use(
    '/graphql',
    express.json({ limit: '100kb' }),
    requireInternalToken(opts.internalToken),
    expressMiddleware(apollo, {
      context: async ({ req }) => ({
        repo: opts.repo,
        requestId: req.header('x-request-id') ?? randomUUID(),
      }),
    }),
  );

  return { app, httpServer, apollo };
}
