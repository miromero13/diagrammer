import axios from 'axios';

import { ConfigService } from '@nestjs/config';

import { AiService } from './ai.service';
import { AIInteractionType } from './enums/ai-interaction-type.enum';
import { ChatAiMode } from './dto/chat-ai.dto';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AiService', () => {
  let service: AiService;

  const interactionsRepository = {
    save: jest.fn(),
    create: jest.fn((value) => value),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  } as any;

  const configService = {
    get: jest.fn().mockReturnValue('test-gemini-key'),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiService(interactionsRepository, configService);
  });

  it('builds a multimodal Gemini payload', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: 'ok' }],
            },
          },
        ],
      },
    } as any);

    const response = await (service as any).callGemini('system prompt', [
      { text: 'contexto' },
      { inlineData: { mimeType: 'image/png', data: 'ZmFrZS1pbWFnZQ==' } },
    ]);

    expect(response).toBe('ok');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(':generateContent?key=test-gemini-key'),
      expect.objectContaining({
        systemInstruction: { parts: [{ text: 'system prompt' }] },
        contents: [{ role: 'user', parts: [{ text: 'contexto' }, { inlineData: { mimeType: 'image/png', data: 'ZmFrZS1pbWFnZQ==' } }] }],
      }),
      { timeout: 60000 },
    );
  });

  it('parses AGENT commands locally without calling Gemini', async () => {
    const callGeminiSpy = jest.spyOn(service as any, 'callGemini');
    const saveInteractionSpy = jest.spyOn(service as any, 'saveInteraction').mockResolvedValue(undefined);

    const result = await service.chat('user-1', {
      message: 'crear clase User; crear relación User 1 -> * Post',
      mode: ChatAiMode.AGENT,
      diagramData: { elements: [{ id: 'post-id', name: 'Post' }] },
    } as any);

    expect(callGeminiSpy).not.toHaveBeenCalled();
    const agentResult = result as any;

    expect(agentResult.mode).toBe(ChatAiMode.AGENT);
    expect(agentResult.actions).toHaveLength(2);
    expect(agentResult.actions[0].data.id).toBeDefined();
    expect(agentResult.actions[0].data.position).toEqual({ x: 100, y: 100 });
    expect(saveInteractionSpy).toHaveBeenCalledWith('user-1', null, AIInteractionType.AGENT, expect.any(String), expect.any(String));
  });

  it('keeps ASK requests on the Gemini path', async () => {
    const callGeminiSpy = jest.spyOn(service as any, 'callGemini').mockResolvedValue('Respuesta general');
    jest.spyOn(service as any, 'saveInteraction').mockResolvedValue(undefined);

    const result = await service.chat('user-1', { message: '¿Qué es una interfaz?', mode: ChatAiMode.ASK } as any);

    expect(callGeminiSpy).toHaveBeenCalled();
    expect(result).toEqual({ success: true, message: 'Respuesta general', mode: ChatAiMode.ASK });
  });

  it('keeps diagram questions on the Gemini path', async () => {
    const callGeminiSpy = jest.spyOn(service as any, 'callGemini').mockResolvedValue('Una asociación representa una relación.');
    jest.spyOn(service as any, 'saveInteraction').mockResolvedValue(undefined);

    await expect(service.chat('user-1', {
      message: '¿Qué representa esta relación?',
      diagramData: { elements: [], connections: [] },
    } as any)).resolves.toMatchObject({ success: true, mode: ChatAiMode.ASK });

    expect(callGeminiSpy).toHaveBeenCalled();
  });

  it('creates diagram actions from an image using Gemini rather than the text command parser', async () => {
    const call = jest.spyOn(service, 'callGemini').mockResolvedValue(JSON.stringify({ message: 'Created User', actions: [
      { type: 'create_class', data: { id: 'user-1', name: 'User' } },
      { type: 'create_relationship', data: { sourceId: 'user-1', targetId: 'existing', type: 'association' } },
    ] }));
    const result = await service.chat('owner', { message: 'Create a diagram from this image', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }], diagramData: { elements: [{ id: 'existing', name: 'Existing' }] } });
    expect(result).toMatchObject({ success: true, mode: ChatAiMode.AGENT, actions: [
      { type: 'create_class', data: { id: 'user-1', name: 'User' } },
      { type: 'create_relationship', data: { sourceId: 'user-1', targetId: 'existing' } },
    ] });
    expect(call).toHaveBeenCalledWith(expect.stringContaining('create_relationship'), expect.arrayContaining([{ inlineData: { mimeType: 'image/png', data: 'YQ==' } }]));
  });

  it('keeps questions with attachments in ASK mode', async () => {
    const call = jest.spyOn(service, 'callGemini').mockResolvedValue('An interface is a contract.');
    expect(await service.chat('owner', { message: 'What is this image?', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }] })).toMatchObject({ mode: ChatAiMode.ASK, message: 'An interface is a contract.' });
    expect(call).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([{ inlineData: { mimeType: 'image/png', data: 'YQ==' } }]));
  });

  it.each([
    { message: '¿Qué es esta clase?', mode: ChatAiMode.AGENT },
    { message: '¿Podés crear una clase desde esta imagen?' },
  ])('honors explicit AGENT and interrogative edit requests: %j', async (input) => {
    const call = jest.spyOn(service, 'callGemini').mockResolvedValue(JSON.stringify({ message: 'Created', actions: [{ type: 'create_class', data: { id: 'new-id', name: 'User' } }] }));
    const result = await service.chat('owner', { ...input, attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }] });
    expect(result).toMatchObject({ success: true, mode: ChatAiMode.AGENT, actions: [{ type: 'create_class' }] });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each([
    { addAttributes: ['new: string'], removeAttributes: ['old: string'] },
    { attributes: ['replacement: string'], addAttributes: ['new: string'] },
    { attributes: ['replacement: string'], removeAttributes: ['old: string'] },
  ])('rejects incompatible attribute operations rather than partially applying: %j', async (changes) => {
    jest.spyOn(service, 'callGemini').mockResolvedValue(JSON.stringify({ message: 'Updated', actions: [
      { type: 'create_class', data: { id: 'new-id', name: 'Other' } },
      { type: 'modify_element', data: { targetId: 'existing', ...changes } },
    ] }));
    expect(await service.chat('owner', { message: 'Modify this diagram', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }], diagramData: { elements: [{ id: 'existing', name: 'Existing' }] } })).toMatchObject({ success: false, mode: ChatAiMode.AGENT, actions: [] });
  });

  it.each([
    'not json',
    JSON.stringify({ message: 'Done', actions: [] }),
    JSON.stringify({ message: 'Done', actions: [{ type: 'create_class', data: { name: 'User' } }, { type: 'unsupported', data: {} }] }),
    JSON.stringify({ message: 'Done', actions: [{ type: 'create_relationship', data: { sourceId: 'missing', targetId: 'existing' } }] }),
    JSON.stringify({ message: 'Done', actions: [{ type: 'modify_element', data: { targetId: 'missing', name: 'Other' } }] }),
  ])('rejects invalid Gemini actions atomically: %s', async (response) => {
    jest.spyOn(service, 'callGemini').mockResolvedValue(response);
    const result = await service.chat('owner', { message: 'Create from the attached image', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }], diagramData: { elements: [{ id: 'existing', name: 'Existing' }] } });
    expect(result).toMatchObject({ success: false, mode: ChatAiMode.AGENT, actions: [] });
  });

  it('returns diagram chat messages in chronological order', async () => {
    interactionsRepository.find.mockResolvedValue([
      {
        id: 'interaction-1',
        interactionType: AIInteractionType.AGENT,
        prompt: 'primero',
        response: 'respuesta uno',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        id: 'interaction-2',
        interactionType: AIInteractionType.ASK,
        prompt: 'segundo',
        response: 'respuesta dos',
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      },
    ]);

    const result = await service.getDiagramChatMessages('user-1', 'diagram-1', 20);

    expect(interactionsRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', diagramId: 'diagram-1' },
      order: { createdAt: 'ASC' },
      take: 20,
      select: ['id', 'interactionType', 'prompt', 'response', 'createdAt'],
    });
    expect(result.messages).toHaveLength(4);
    expect(result.messages.map((message: any) => message.content)).toEqual(['primero', 'respuesta uno', 'segundo', 'respuesta dos']);
    expect(result.messages.map((message: any) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});
