import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const shutdown = async (signal: string) => {
    console.log(
      JSON.stringify({
        level: 'info',
        module: 'worker',
        event: 'shutdown_requested',
        signal,
      }),
    );
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      module: 'worker',
      event: 'bootstrap_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
