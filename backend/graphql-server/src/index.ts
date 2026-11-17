import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { PgTaskRepository } from './repository.js';
import { createApp } from './app.js';
import { logger } from './logger.js';

async function main() {
  const config = loadConfig();
  const pool = createPool(config.db, config.region);
  pool.on('error', (err) => logger.error('idle pg client error', { error: String(err) }));

  const { httpServer, apollo } = await createApp({
    repo: new PgTaskRepository(pool),
    internalToken: config.internalToken,
    introspection: config.introspection,
  });

  httpServer.listen(config.port, () => {
    logger.info('graphql server listening', { port: config.port, dbAuthMode: config.db.authMode });
  });

  // ECS sends SIGTERM on scale-in / deployments. Stop accepting requests, drain, close the pool.
  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    await apollo.stop();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('fatal startup error', { error: String(err) });
  process.exit(1);
});
