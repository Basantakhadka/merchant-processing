import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Shared by main.ts and the e2e tests so tests exercise the exact production pipeline. */
export function setupApp(app: INestApplication, opts: { swagger?: boolean } = {}) {
  app.use(helmet({ contentSecurityPolicy: opts.swagger ? false : undefined }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  if (opts.swagger) {
    const cfg = new DocumentBuilder()
      .setTitle('Merchant Onboarding & Risk Review API')
      .setDescription('Merchant applications, async risk review (BullMQ), role + object-level authorization. See README for a Swagger walkthrough.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, cfg), { swaggerOptions: { persistAuthorization: true } });
  }
}
