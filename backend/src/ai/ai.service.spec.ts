import axios from 'axios';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatAiMode } from './dto/chat-ai.dto';
import { DiagramsService } from '../diagrams/diagrams.service';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';

jest.mock('axios');

describe('AI editing of an open diagram', () => {
  const initial = { elements: [{ id: 'existing', name: 'Existing', type: 'uml.Class' }], connections: [], metadata: { version: 'reactflow' } };
  const diagram = { id: 'current', content: initial };
  const interactions = { create: jest.fn((value) => value), save: jest.fn().mockResolvedValue(undefined) };
  const diagrams = { getDiagram: jest.fn(), compareAndSave: jest.fn() };
  const config = { get: jest.fn(() => 'test-key') };
  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    diagrams.getDiagram.mockResolvedValue(diagram);
    diagrams.compareAndSave.mockImplementation(async (_user, _id, _expected, content) => content);
    service = new AiService(interactions as any, config as any, diagrams as any);
  });

  const respond = (value: unknown) => jest.spyOn(service, 'callOpenAI').mockResolvedValue(typeof value === 'string' ? value : JSON.stringify(value));
  const image = { kind: 'image' as const, mimeType: 'image/png', base64: 'YQ==' };

  it('accepts image-only creation, commits before success and preserves existing content', async () => {
    respond({ intent: 'edit', message: 'Added a class.', actions: [{ type: 'create_class', data: { id: 'user', name: 'User' } }] });
    const result = await service.chat('owner', { message: '', diagramId: 'current', attachments: [image] });
    expect(result).toMatchObject({ success: true, mode: ChatAiMode.AGENT, content: { elements: [{ id: 'existing' }, { id: 'user' }] } });
    expect(diagrams.compareAndSave).toHaveBeenCalledWith('owner', 'current', initial, expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({ id: 'user' })]) }));
    expect(service.callOpenAI).toHaveBeenCalledWith(expect.stringContaining('An image alone'), expect.arrayContaining([{ type: 'input_image', image_url: 'data:image/png;base64,YQ==' }]), ChatAiMode.AGENT);
  });

  it('includes a JSON instruction in AGENT user input while preserving the request', async () => {
    respond({ intent: 'ask', message: 'I can help.', actions: [] });
    await service.chat('owner', { message: 'Explain this diagram', diagramId: 'current' });
    const [, input, mode] = (service.callOpenAI as jest.Mock).mock.calls[0];
    expect(mode).toBe(ChatAiMode.AGENT);
    expect(input[0].text).toContain('JSON');
    expect(input[0].text).toContain('User: Explain this diagram');
  });

  it('edits existing content from free-form text without losing literals or connections', async () => {
    respond({ intent: 'edit', message: 'Updated.', actions: [
      { type: 'create_enum', data: { id: 'status', name: 'Status', literals: ['OPEN'] } },
      { type: 'modify_element', data: { targetId: 'existing', addAttributes: ['status: Status'] } },
      { type: 'create_relationship', data: { id: 'edge', sourceId: 'existing', targetId: 'status', type: 'association' } },
    ] });
    const result = await service.chat('owner', { message: 'Could this have a status?', diagramId: 'current' });
    expect(result).toMatchObject({ success: true, content: { elements: [{ attributes: ['status: Status'] }, { type: 'uml.Enumeration', literals: ['OPEN'] }], connections: [{ id: 'edge' }] } });
  });

  it('replaces an attribute by removing first and preserves other attribute semantics', async () => {
    const current = {
      elements: [{ id: 'sale', name: 'DetalleVenta', type: 'uml.Class', attributes: ['cantidades: int', 'precio: decimal'], attributeSemantics: [{ role: 'old' }, { role: 'price' }] }],
      connections: [],
      metadata: { version: 'reactflow' },
    };
    diagrams.getDiagram.mockResolvedValueOnce({ id: 'current', content: current });
    respond({ intent: 'edit', message: 'Updated quantity.', actions: [{ type: 'modify_element', data: { targetId: 'sale', removeAttributes: ['cantidades'], addAttributes: ['cantidad: int'] } }] });

    const result = await service.chat('owner', { message: 'Rename quantity', diagramId: 'current' });

    expect((result as any).content.elements[0]).toMatchObject({
      attributes: ['precio: decimal', 'cantidad: int'],
      attributeSemantics: [{ role: 'price' }, {}],
    });
  });

  it('does not duplicate an attribute when adding an equivalent field', async () => {
    const current = {
      elements: [{ id: 'sale', name: 'DetalleVenta', type: 'uml.Class', attributes: ['cantidad: int'], attributeSemantics: [{ role: 'quantity' }] }],
      connections: [],
      metadata: { version: 'reactflow' },
    };
    diagrams.getDiagram.mockResolvedValueOnce({ id: 'current', content: current });
    respond({ intent: 'edit', message: 'Added quantity.', actions: [{ type: 'modify_element', data: { targetId: 'sale', addAttributes: [' CANTIDAD: INT '] } }] });

    const result = await service.chat('owner', { message: 'Add quantity', diagramId: 'current' });

    expect((result as any).content.elements[0]).toMatchObject({ attributes: ['cantidad: int'], attributeSemantics: [{ role: 'quantity' }] });
  });

  it('removes id attributes by name and preserves the matching attribute semantics across classes', async () => {
    const classes = [
      { id: 'one', name: 'One', type: 'uml.Class', attributes: ['id: UUID', 'name: String', 'active: boolean'], attributeSemantics: [{ role: 'identifier' }, { role: 'display' }, { role: 'state' }] },
      { id: 'two', name: 'Two', type: 'uml.Class', attributes: ['code: String', 'id: UUID', 'count: int'], attributeSemantics: [{ role: 'code' }, { role: 'identifier' }, { role: 'count' }] },
      { id: 'three', name: 'Three', type: 'uml.Class', attributes: ['createdAt: date', 'id: UUID'], attributeSemantics: [{ role: 'created' }, { role: 'identifier' }] },
    ];
    const current = { elements: classes, connections: [], metadata: { version: 'reactflow' } };
    diagrams.getDiagram.mockResolvedValueOnce({ id: 'current', content: current });
    respond({ intent: 'edit', message: 'Removed identifiers.', actions: classes.map(({ id }) => ({ type: 'modify_element', data: { targetId: id, removeAttributes: ['id'] } })) });

    const result = await service.chat('owner', { message: 'Remove ids', diagramId: 'current' });

    expect((result as any).content.elements.map(({ attributes, attributeSemantics }) => ({ attributes, attributeSemantics }))).toEqual([
      { attributes: ['name: String', 'active: boolean'], attributeSemantics: [{ role: 'display' }, { role: 'state' }] },
      { attributes: ['code: String', 'count: int'], attributeSemantics: [{ role: 'code' }, { role: 'count' }] },
      { attributes: ['createdAt: date'], attributeSemantics: [{ role: 'created' }] },
    ]);
  });

  it('keeps a question with an image read-only and returns natural language', async () => {
    respond({ intent: 'ask', message: 'The drawing shows a class.', actions: [] });
    expect(await service.chat('viewer', { message: 'What is this?', diagramId: 'current', attachments: [image] }))
      .toMatchObject({ success: true, mode: ChatAiMode.ASK, message: 'The drawing shows a class.', actions: [] });
    expect(diagrams.compareAndSave).not.toHaveBeenCalled();
  });

  it('logs rejected model responses with a bounded length and does not warn for successful responses', async () => {
    const warning = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    const response = `not-json ${'x'.repeat(5991)}${'y'.repeat(1000)}`;
    respond(response);

    expect(await service.chat('owner', { message: 'Change this', diagramId: 'current' })).toMatchObject({ success: false });

    expect(warning).toHaveBeenCalledTimes(1);
    const logged = warning.mock.calls[0][0] as string;
    expect(logged).toContain('length=7000, truncated=true');
    expect(logged).toContain(response.slice(0, 6000));
    expect(logged).toContain('[truncated]');
    expect(logged).not.toContain(response.slice(6000));

    warning.mockClear();
    respond({ intent: 'ask', message: 'Looks good.', actions: [] });
    expect(await service.chat('owner', { message: 'Explain this', diagramId: 'current' })).toMatchObject({ success: true });
    expect(warning).not.toHaveBeenCalled();
  });

  it('rejects invalid mixed action sets without partial persistence or raw JSON', async () => {
    respond({ intent: 'edit', message: 'Done', actions: [
      { type: 'create_class', data: { id: 'new', name: 'New' } },
      { type: 'create_relationship', data: { sourceId: 'new', targetId: 'missing' } },
    ] });
    expect(await service.chat('owner', { message: 'Extend this', diagramId: 'current' })).toMatchObject({ success: false, actions: [] });
    expect(diagrams.compareAndSave).not.toHaveBeenCalled();
    expect(interactions.save).not.toHaveBeenCalled();
  });

  it('rejects unauthorized and stale edits and does not report persistence', async () => {
    diagrams.getDiagram.mockRejectedValueOnce(new NotFoundException());
    await expect(service.chat('stranger', { message: 'Do something', diagramId: 'current' })).rejects.toBeInstanceOf(NotFoundException);
    expect(service.callOpenAI).toBeDefined();
    respond({ intent: 'edit', message: 'Updated.', actions: [{ type: 'delete_element', data: { targetId: 'existing' } }] });
    diagrams.compareAndSave.mockRejectedValueOnce(new ConflictException('Diagram changed'));
    await expect(service.chat('owner', { message: 'Remove the class', diagramId: 'current' })).rejects.toBeInstanceOf(ConflictException);
    expect(interactions.save).not.toHaveBeenCalled();
  });

  it('propagates provider failures without saving a response', async () => {
    jest.spyOn(service, 'callOpenAI').mockRejectedValue(new Error('provider down'));
    await expect(service.chat('owner', { message: 'Change this', diagramId: 'current' })).rejects.toThrow('Internal server error');
    expect(diagrams.compareAndSave).not.toHaveBeenCalled();
  });

  it('sends images as multimodal provider input', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"intent":"ask","message":"Looks good","actions":[]}' }] }] } });
    await service.chat('owner', { message: 'Explain', diagramId: 'current', attachments: [image] });
    expect(axios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ input: [{ role: 'user', content: expect.arrayContaining([{ type: 'input_image', image_url: 'data:image/png;base64,YQ==' }]) }] }), expect.any(Object));
  });

  it('logs sanitized provider rejection diagnostics without request secrets', async () => {
    config.get.mockImplementation((key?: string) => key === 'OPENAI_API_KEY' ? 'secret-api-key' : 'gpt-test');
    const warning = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    const failure = { response: { status: 400, headers: { 'x-request-id': 'req-123' }, data: { error: { code: 'invalid_parameter', param: 'input', message: 'Invalid input\r\nplease fix' } } } };
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    (axios.post as jest.Mock).mockRejectedValue(failure);
    await expect(service.callOpenAI('private system instructions', [{ type: 'input_text', text: 'private prompt text' }], ChatAiMode.AGENT))
      .rejects.toMatchObject({ response: { message: 'AI provider rejected the request. Check the configured model and input format.' } });
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('message=Invalid inputplease fix'));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('model=gpt-test mode=agent request_id=req-123'));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('code=invalid_parameter parameter=input'));
    const logged = warning.mock.calls.flat().join(' ');
    expect(logged).not.toContain('secret-api-key');
    expect(logged).not.toContain('private prompt text');
    expect(logged).not.toContain('private system instructions');
  });
});

describe('durable diagram compare-and-save', () => {
  const lockedQuery = { setLock: jest.fn(), where: jest.fn(), getOne: jest.fn() };
  const transactionalRepository = { createQueryBuilder: jest.fn(() => lockedQuery), update: jest.fn() };
  const manager = { getRepository: jest.fn(() => transactionalRepository) };
  const repository = { findOne: jest.fn(), manager: { transaction: jest.fn(async (work) => work(manager)) } };
  const projects = { findOne: jest.fn() };
  const broadcast = { publishDiagramContent: jest.fn() };
  const service = new DiagramsService(repository as any, projects as any, {} as any, {} as any, {} as any, broadcast as any);
  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({ id: 'current', projectId: 'project', isActive: true });
    projects.findOne.mockResolvedValue({ ownerId: 'owner', projectMembers: [{ userId: 'editor', role: 'editor' }, { userId: 'viewer', role: 'viewer' }] });
    lockedQuery.setLock.mockReturnValue(lockedQuery);
    lockedQuery.where.mockReturnValue(lockedQuery);
    lockedQuery.getOne.mockResolvedValue({ id: 'current', projectId: 'project', isActive: true, content: { elements: [], connections: [], metadata: {} } });
    transactionalRepository.update.mockResolvedValue({ affected: 1 });
  });
  it('requires editor rights for quick updates and AI commits', async () => {
    await expect(service.compareAndSave('viewer', 'current', { elements: [] }, { elements: [] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.quickUpdate('viewer', 'current', { elements: [] }, { elements: [] })).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });
  it('takes a pessimistic row lock and broadcasts only after persistence succeeds', async () => {
    const expected = { elements: [], connections: [], metadata: {} };
    const next = { elements: [{ id: 'new' }], connections: [], metadata: {} };
    await service.compareAndSave('editor', 'current', expected, next);
    expect(lockedQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(transactionalRepository.update).toHaveBeenCalledWith({ id: 'current', isActive: true }, { content: next });
    expect(transactionalRepository.update.mock.invocationCallOrder[0]).toBeLessThan(broadcast.publishDiagramContent.mock.invocationCallOrder[0]);
    expect(broadcast.publishDiagramContent).toHaveBeenCalledWith('current', next);
    transactionalRepository.update.mockRejectedValueOnce(new Error('storage down'));
    await expect(service.compareAndSave('owner', 'current', expected, next)).rejects.toThrow('storage down');
    expect(broadcast.publishDiagramContent).toHaveBeenCalledTimes(1);
  });
});

it('broadcasts the committed content to the entire room, including the sender', () => {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const gateway = new CollaborationGateway({} as any, {} as any, {} as any, {} as any);
  gateway.server = { to } as any;
  const content = { elements: [{ id: 'new' }] };
  gateway.publishDiagramContent('current', content);
  expect(to).toHaveBeenCalledWith('diagram:current');
  expect(emit).toHaveBeenCalledWith('diagramContentSaved', { diagramId: 'current', content });
});
