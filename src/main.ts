import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  require('dotenv').config();
  const app = await NestFactory.create(AppModule, { rawBody: true }) // rawBody: needed to verify payment webhook signatures;
  app.enableShutdownHooks();
  setupApp(app, { swagger: true });
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`API on http://localhost:${port}  |  Swagger on http://localhost:${port}/docs`);
}
bootstrap();
