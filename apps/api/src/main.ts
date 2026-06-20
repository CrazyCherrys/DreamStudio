import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { isAllowedAppOrigin, loadConfig } from '@dreamstudio/config';

import { AppModule } from './modules/app.module';
import { AllExceptionsFilter } from './platform/all-exceptions.filter';
import { RequestIdMiddleware } from './platform/request-id.middleware';
import { StandardResponseInterceptor } from './platform/standard-response.interceptor';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin) {
        callback(null, true);
        return;
      }

      try {
        callback(null, isAllowedAppOrigin(origin, config));
      } catch {
        callback(null, false);
      }
    },
    credentials: true,
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
  app.use(new RequestIdMiddleware().use);
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new StandardResponseInterceptor());

  if (config.trustProxy) {
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }

  await app.listen(config.apiPort, '0.0.0.0');
  console.log(
    JSON.stringify({
      level: 'info',
      module: 'api',
      event: 'started',
      port: config.apiPort,
    }),
  );
}

bootstrap().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      module: 'api',
      event: 'bootstrap_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
