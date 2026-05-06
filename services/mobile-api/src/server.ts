import { buildApp } from './app';
import { config, validateConfig } from './config';

const start = async () => {
  // Fail fast on missing required env. Without this, the server boots with
  // null Supabase clients and every request fails as a confusing 401 instead
  // of an obvious deploy-time error.
  const missing = validateConfig();
  if (missing.length > 0) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error(
        `[mobile-api] FATAL: required env vars missing in production: ${missing.join(', ')}`,
      );
      process.exit(1);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `[mobile-api] WARNING: env vars missing (non-production, continuing): ${missing.join(', ')}`,
      );
    }
  }

  const app = buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'received shutdown signal, closing gracefully');
    try {
      await app.close();
    } catch (err) {
      app.log.error(err, 'error during graceful shutdown');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
