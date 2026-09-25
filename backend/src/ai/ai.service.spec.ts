import axios from 'axios';

import { ConfigService } from '@nestjs/config';

import { AiService } from './ai.service';
import { AIInteractionType } from './enums/ai-interaction-type.enum';
import { ChatAiMode } from './dto/chat-ai.dto';
import { normalizeAndValidateUml } from '../code-generation/uml-analysis';

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
    get: jest.fn((key: string) => key === 'OPENAI_API_KEY' ? 'mock-key' : undefined),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiService(interactionsRepository, configService);
  });

  it('builds a multimodal OpenAI payload and extracts only output text', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        status: 'completed', output: [{ type: 'reasoning', content: [] }, { type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
      },
    } as any);

    const response = await service.callOpenAI('system prompt', [
      { type: 'input_text', text: 'contexto' },
      { type: 'input_image', image_url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==' },
      { type: 'input_file', filename: 'diagram.pdf', file_data: 'data:application/pdf;base64,YQ==' },
    ]);

    expect(response).toBe('ok');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        model: 'gpt-5.5', instructions: 'system prompt',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'contexto' }, { type: 'input_image', image_url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==' }, { type: 'input_file', filename: 'diagram.pdf', file_data: 'data:application/pdf;base64,YQ==' }] }],
      }),
      { timeout: 60000, headers: { Authorization: 'Bearer mock-key', 'Content-Type': 'application/json' } },
    );
  });

  it.each([
    [400, 'model_not_found', 400],
    [401, 'invalid_api_key', 401],
    [403, 'invalid_api_key', 403],
    [404, 'model_not_found', 404],
    [429, 'rate_limit_exceeded', 429],
    [422, 'invalid_parameter', 422],
    [503, 'server_error', 503],
  ])('maps upstream %i without leaking upstream content', async (upstreamStatus, code, expectedStatus) => {
    const secret = 'secret-diagram-and-api-key';
    const error = { isAxiosError: true, response: { status: upstreamStatus, data: { error: { code, message: secret, type: secret } } },
      config: { headers: { Authorization: secret }, data: secret } };
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValueOnce(error);
    const log = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    try {
      await service.chat('owner', { message: 'Explain this', mode: ChatAiMode.ASK });
      throw new Error('Expected an HTTP exception');
    } catch (caught) {
      expect((caught as any).getStatus()).toBe(expectedStatus);
      expect(JSON.stringify((caught as any).getResponse())).not.toContain(secret);
      expect(JSON.stringify((caught as any).getResponse())).not.toContain('server_error');
      if ([400, 404, 422].includes(upstreamStatus)) expect((caught as any).getResponse().code).toBe(code);
    }
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });

  it('maps a network timeout to 504 without leaking axios details', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValueOnce({ isAxiosError: true, code: 'ECONNABORTED', message: 'secret-diagram-and-api-key' });
    jest.spyOn((service as any).logger, 'warn').mockImplementation();
    await expect(service.callOpenAI('prompt', [{ type: 'input_text', text: 'hello' }])).rejects.toMatchObject({ status: 504 });
  });

  it.each([
    ['input.0.content', 'invalid_parameter', 'input.*.content', 'invalid_parameter'],
    ['input.0.content.secret-diagram-and-api-key', 'untrusted-secret-diagram-and-api-key', undefined, undefined],
    [null, null, undefined, undefined],
  ])('sanitizes upstream 400 diagnostics for parameter %s', async (param, code, parameter, safeCode) => {
    const secret = 'secret-diagram-and-api-key';
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValueOnce({ isAxiosError: true, response: { status: 400, data: { error: { param, code, message: secret, type: secret } } }, config: { headers: { Authorization: secret } } });
    const log = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    try {
      await service.callOpenAI('prompt', [{ type: 'input_text', text: 'hello' }]);
      throw new Error('Expected an HTTP exception');
    } catch (caught) {
      expect((caught as any).getStatus()).toBe(400);
      expect((caught as any).getResponse()).toEqual({ message: 'AI provider rejected the request. Check the configured model and input format.', code: safeCode, parameter });
      expect(JSON.stringify((caught as any).getResponse())).not.toContain(secret);
    }
    expect(log).toHaveBeenCalledWith(`OpenAI request failed: status=400 code=${safeCode ?? 'unknown'} parameter=${parameter ?? 'unknown'}`);
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });

  it('rejects unsupported binaries and empty or incomplete responses', async () => {
    await expect(service.chat('owner', { message: 'Analyze', attachments: [{ mimeType: 'application/zip', base64: 'YQ==' }] })).rejects.toThrow('Unsupported attachment type');
    expect(mockedAxios.post).not.toHaveBeenCalled();
    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'completed', output: [{ type: 'reasoning' }] } } as any);
    await expect(service.chat('owner', { message: 'Explain this' })).rejects.toThrow('AI response contained no text');
    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }] } } as any);
    await expect(service.chat('owner', { message: 'Explain this' })).rejects.toThrow('AI response was not completed');
  });

  it('sends PDF and image attachments with data URLs through chat', async () => {
    mockedAxios.post.mockResolvedValue({ data: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Document reviewed' }] }] } } as any);
    await service.chat('owner', { message: 'Explain these', mode: ChatAiMode.ASK, attachments: [
      { name: 'design.pdf', mimeType: 'application/pdf', base64: 'data:application/pdf;base64,YQ==' },
      { name: 'sketch.png', mimeType: 'image/png', base64: 'Yg==' },
    ] });
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ input: [{ role: 'user', content: expect.arrayContaining([
      { type: 'input_file', filename: 'design.pdf', file_data: 'data:application/pdf;base64,YQ==' },
      { type: 'input_image', image_url: 'data:image/png;base64,Yg==' },
    ]) }] }), expect.any(Object));
  });

  it('parses AGENT commands locally without calling OpenAI', async () => {
    const callOpenAISpy = jest.spyOn(service, 'callOpenAI');
    const saveInteractionSpy = jest.spyOn(service as any, 'saveInteraction').mockResolvedValue(undefined);

    const result = await service.chat('user-1', {
      message: 'crear clase User; crear relación User 1 -> * Post',
      mode: ChatAiMode.AGENT,
      diagramData: { elements: [{ id: 'post-id', name: 'Post' }] },
    } as any);

    expect(callOpenAISpy).not.toHaveBeenCalled();
    const agentResult = result as any;

    expect(agentResult.mode).toBe(ChatAiMode.AGENT);
    expect(agentResult.actions).toHaveLength(2);
    expect(agentResult.actions[0].data.id).toBeDefined();
    expect(agentResult.actions[0].data.position).toEqual({ x: 100, y: 100 });
    expect(saveInteractionSpy).toHaveBeenCalledWith('user-1', null, AIInteractionType.AGENT, expect.any(String), expect.any(String));
  });

  it('routes a freeform POS request to OpenAI with the AGENT prompt', async () => {
    const call = jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Created POS', actions: [
      { type: 'create_class', data: { id: 'product-id', name: 'Product' } },
    ] }));
    const result = await service.chat('owner', { message: 'Crea una base de datos para un sistema pos' });
    expect(call).toHaveBeenCalledWith(expect.stringContaining('create_class'), expect.arrayContaining([
      expect.objectContaining({ type: 'input_text', text: expect.stringContaining('Crea una base de datos para un sistema pos') }),
    ]), ChatAiMode.AGENT);
    expect(result).toMatchObject({ success: true, mode: ChatAiMode.AGENT, actions: [{ type: 'create_class', data: { name: 'Product' } }] });
  });

  it('requests structured JSON for explicit create/edit and rejects prose instead of saving it', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"message":"Created","actions":[{"type":"create_class","data":{"id":"user","name":"User"}}]}' }] }] } } as any);
    const created = await service.chat('owner', { mode: ChatAiMode.AGENT, message: 'Design a user model' });
    expect(created).toMatchObject({ success: true, mode: ChatAiMode.AGENT, actions: [{ type: 'create_class' }] });
    expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ text: { format: { type: 'json_object' } } }), expect.any(Object));

    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here is PlantUML: class User' }] }] } } as any);
    expect(await service.chat('owner', { mode: ChatAiMode.AGENT, message: 'Design another model' })).toMatchObject({ success: false, actions: [] });
    expect(interactionsRepository.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    'eliminar Missing',
    'crear clase User; crear clase User',
    'crear clase User; eliminar Missing',
    'algo desconocido; eliminar Missing',
    'crear clase User; algo desconocido',
  ])('does not send recognized or mixed invalid commands to OpenAI: %s', async (message) => {
    const call = jest.spyOn(service, 'callOpenAI');
    const result = await service.chat('owner', { message, mode: ChatAiMode.AGENT });
    expect(result).toMatchObject({ success: false, mode: ChatAiMode.AGENT, actions: [] });
    expect(call).not.toHaveBeenCalled();
  });

  it('does not report success when freeform AI returns no actions', async () => {
    jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Created POS', actions: [] }));
    expect(await service.chat('owner', { message: 'Crea una base de datos para un sistema pos' })).toMatchObject({ success: false, actions: [] });
  });

  it('keeps ASK requests on the OpenAI path', async () => {
    const callOpenAISpy = jest.spyOn(service, 'callOpenAI').mockResolvedValue('Respuesta general');
    jest.spyOn(service as any, 'saveInteraction').mockResolvedValue(undefined);

    const result = await service.chat('user-1', { message: '¿Qué es una interfaz?', mode: ChatAiMode.ASK } as any);

    expect(callOpenAISpy).toHaveBeenCalled();
    expect(result).toEqual({ success: true, message: 'Respuesta general', mode: ChatAiMode.ASK });
  });

  it('keeps diagram questions on the OpenAI path', async () => {
    const callOpenAISpy = jest.spyOn(service, 'callOpenAI').mockResolvedValue('Una asociación representa una relación.');
    jest.spyOn(service as any, 'saveInteraction').mockResolvedValue(undefined);

    await expect(service.chat('user-1', {
      message: '¿Qué representa esta relación?',
      diagramData: { elements: [], connections: [] },
    } as any)).resolves.toMatchObject({ success: true, mode: ChatAiMode.ASK });

    expect(callOpenAISpy).toHaveBeenCalled();
  });

  it('creates diagram actions from an image using OpenAI rather than the text command parser', async () => {
    const call = jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Created User', actions: [
      { type: 'create_class', data: { id: 'user-1', name: 'User' } },
      { type: 'create_relationship', data: { sourceId: 'user-1', targetId: 'existing', type: 'association' } },
    ] }));
    const result = await service.chat('owner', { message: 'Create a diagram from this image', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }], diagramData: { elements: [{ id: 'existing', name: 'Existing' }] } });
    expect(result).toMatchObject({ success: true, mode: ChatAiMode.AGENT, actions: [
      { type: 'create_class', data: { id: 'user-1', name: 'User' } },
      { type: 'create_relationship', data: { sourceId: 'user-1', targetId: 'existing' } },
    ] });
    expect(call).toHaveBeenCalledWith(expect.stringContaining('create_relationship'), expect.arrayContaining([{ type: 'input_image', image_url: 'data:image/png;base64,YQ==' }]), ChatAiMode.AGENT);
  });

  it('accepts generator attributes from an image and preserves UUID primary keys', async () => {
    jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Created', actions: [
      { type: 'create_class', data: { id: 'user', name: 'User', attributes: ['id: UUID', 'name: String', 'profile: String', 'createdAt: datetime', 'avatar: String', 'scores: List<int>'] } },
      { type: 'modify_element', data: { targetId: 'user', addAttributes: ['updatedAt: datetime'] } },
    ] }));
    const result = await service.chat('owner', { message: 'Create from image', attachments: [{ mimeType: 'image/png', base64: 'YQ==' }] }) as any;
    expect(result.success).toBe(true);
    expect(result.actions[0].data.attributes).toEqual(['id: UUID', 'name: String', 'profile: String', 'createdAt: datetime', 'avatar: String', 'scores: List<int>']);
    const attributes = [...result.actions[0].data.attributes, ...result.actions[1].data.addAttributes];
    const analysis = normalizeAndValidateUml({ elements: [{ id: 'user', name: 'User', type: 'uml.Class', attributes }] });
    expect(analysis.errors).toEqual([]);
    expect(analysis.relationalModel.tables[0].columns.find((column) => column.name === 'id')).toMatchObject({ primaryKey: true, javaType: 'UUID' });
  });

  it('keeps relationships without synthesizing FK attributes', async () => {
    const actions = [
      { type: 'create_class', data: { id: 'user', name: 'User', attributes: ['id: UUID'] } },
      { type: 'create_class', data: { id: 'post', name: 'Post', attributes: [] } },
      { type: 'create_relationship', data: { sourceId: 'post', targetId: 'user', sourceMultiplicity: '*', targetMultiplicity: '1' } },
    ];
    jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Created', actions }));
    const payload = { message: 'Create from text', sourceText: 'posts.user_id references users.id' };
    const result = await service.chat('owner', payload) as any;
    expect(result.success).toBe(true);
    expect(result.actions[1].data.attributes).toEqual([]);
    const analysis = normalizeAndValidateUml({ elements: result.actions.slice(0, 2).map((action: any) => ({ ...action.data, type: 'uml.Class' })), connections: [{ ...result.actions[2].data, type: 'association' }] });
    expect(analysis.relationalModel.relationships[0].foreignKeys).toEqual([expect.objectContaining({ table: 'post', column: 'user_id', referencedTable: 'users' })]);
  });

  it('rejects SQL types, annotations, and unknown types atomically in create and modify arrays', async () => {
    const payload = { message: 'Modify from image', attachments: [{ mimeType: 'image/png', base64: 'YQ==' }], diagramData: { elements: [{ id: 'post', name: 'Post', type: 'uml.Class' }] } };
    for (const attribute of ['name: varchar(50)', 'profile: jsonb', 'createdAt: timestamp', 'avatar: bytea', 'id: UUID PK', 'user_id: uuid FK -> users.id', 'user_id: users.id', 'payload: xmlblob']) {
      for (const data of [{ targetId: 'post', addAttributes: [attribute] }, { targetId: 'post', attributes: [attribute] }]) {
        jest.spyOn(service, 'callOpenAI').mockResolvedValueOnce(JSON.stringify({ message: 'Updated', actions: [
          { type: 'create_class', data: { id: 'other', name: 'Other' } }, { type: 'modify_element', data },
        ] }));
        expect(await service.chat('owner', payload)).toMatchObject({ success: false, actions: [] });
      }
      jest.spyOn(service, 'callOpenAI').mockResolvedValueOnce(JSON.stringify({ message: 'Created', actions: [
        { type: 'create_class', data: { id: 'new', name: 'New', attributes: [attribute] } },
      ] }));
      expect(await service.chat('owner', payload)).toMatchObject({ success: false, actions: [] });
    }
  });

  it('keeps questions with attachments in ASK mode', async () => {
    const call = jest.spyOn(service, 'callOpenAI').mockResolvedValue('An interface is a contract.');
    expect(await service.chat('owner', { message: 'What is this image?', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }] })).toMatchObject({ mode: ChatAiMode.ASK, message: 'An interface is a contract.' });
    expect(call).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([{ type: 'input_image', image_url: 'data:image/png;base64,YQ==' }]), ChatAiMode.ASK);
  });

  it.each([
    { message: '¿Qué es esta clase?', mode: ChatAiMode.AGENT },
    { message: '¿Podés crear una clase desde esta imagen?' },
  ])('honors explicit AGENT and interrogative edit requests: %j', async (input) => {
    const call = jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Created', actions: [{ type: 'create_class', data: { id: 'new-id', name: 'User' } }] }));
    const result = await service.chat('owner', { ...input, attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'YQ==' }] });
    expect(result).toMatchObject({ success: true, mode: ChatAiMode.AGENT, actions: [{ type: 'create_class' }] });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each([
    { addAttributes: ['new: string'], removeAttributes: ['old: string'] },
    { attributes: ['replacement: string'], addAttributes: ['new: string'] },
    { attributes: ['replacement: string'], removeAttributes: ['old: string'] },
  ])('rejects incompatible attribute operations rather than partially applying: %j', async (changes) => {
    jest.spyOn(service, 'callOpenAI').mockResolvedValue(JSON.stringify({ message: 'Updated', actions: [
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
  ])('rejects invalid OpenAI actions atomically: %s', async (response) => {
    jest.spyOn(service, 'callOpenAI').mockResolvedValue(response);
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
