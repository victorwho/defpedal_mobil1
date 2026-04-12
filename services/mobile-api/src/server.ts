import { buildApp } from './app';
import { config } from './config';

const start = async () => {
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
