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

  it('edits existing content from free-form text without losing literals or connections', async () => {
    respond({ intent: 'edit', message: 'Updated.', actions: [
      { type: 'create_enum', data: { id: 'status', name: 'Status', literals: ['OPEN'] } },
      { type: 'modify_element', data: { targetId: 'existing', addAttributes: ['status: Status'] } },
      { type: 'create_relationship', data: { id: 'edge', sourceId: 'existing', targetId: 'status', type: 'association' } },
    ] });
    const result = await service.chat('owner', { message: 'Could this have a status?', diagramId: 'current' });
    expect(result).toMatchObject({ success: true, content: { elements: [{ attributes: ['status: Status'] }, { type: 'uml.Enumeration', literals: ['OPEN'] }], connections: [{ id: 'edge' }] } });
  });

  it('keeps a question with an image read-only and returns natural language', async () => {
    respond({ intent: 'ask', message: 'The drawing shows a class.', actions: [] });
    expect(await service.chat('viewer', { message: 'What is this?', diagramId: 'current', attachments: [image] }))
      .toMatchObject({ success: true, mode: ChatAiMode.ASK, message: 'The drawing shows a class.', actions: [] });
    expect(diagrams.compareAndSave).not.toHaveBeenCalled();
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
