import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyMultipart from '@fastify/multipart';

jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AI chat request validation', () => {
  let app: NestFastifyApplication;
  const chat = jest.fn().mockResolvedValue({ success: true });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: { chat, getDiagramChatMessages: jest.fn() } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (context: any) => {
        context.switchToHttp().getRequest().user = { id: 'user-1' };
        return true;
      } })
      .compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyMultipart);
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app?.close());

  it('accepts multipart message and file before DTO validation', async () => {
    const boundary = 'chat-test-boundary';
    const body = [
      `--${boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\nHello\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="note.txt"\r\nContent-Type: text/plain\r\n\r\ncontent\r\n`,
      `--${boundary}--\r\n`,
    ].join('');
    const response = await app.inject({ method: 'POST', url: '/ai/chat', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });

    expect(response.statusCode).toBe(201);
    expect(chat).toHaveBeenCalledWith('user-1', expect.objectContaining({ message: 'Hello', attachments: [expect.objectContaining({ text: 'content' })] }));
  });

  it.each([
    ['invalid mode', { message: 'Hello', mode: 'invalid' }, 'mode must be one of the following values'],
    ['unknown field', { message: 'Hello', unexpected: 'value' }, 'property unexpected should not exist'],
    ['JSON-like message', { message: '{"invalid":true}' }, 'Message is required'],
  ])('rejects multipart %s', async (_case, fields, error) => {
    const boundary = 'chat-test-boundary';
    const body = Object.entries(fields).map(([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ).join('') + `--${boundary}--\r\n`;
    const response = await app.inject({ method: 'POST', url: '/ai/chat', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });

    expect(response.statusCode).toBe(400);
    expect(String(response.json().message)).toContain(error);
  });

  it('still rejects invalid JSON payloads', async () => {
    const response = await app.inject({ method: 'POST', url: '/ai/chat', payload: { mode: 'invalid' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('message must be a string');
  });
});
