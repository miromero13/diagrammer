import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';

import { AppModule } from './app.module';
import { CORS_OPTIONS } from './common/constants';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  app.setGlobalPrefix('api');
  await app.register(fastifyCors, CORS_OPTIONS);
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 10,
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 3000;
  const title = configService.get('APP_NAME') || 'API';
  const url = configService.get('APP_URL') || `http://localhost:${port}`;

  const config = new DocumentBuilder()
    .addBearerAuth()
    .setTitle(title)
    .setDescription(`API Documentation for ${title}`)
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.getHttpAdapter().getInstance().get('/health', async (_request, reply) => {
    return reply.send({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: title,
    });
  });

  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: ${url}`);
}
bootstrap();
