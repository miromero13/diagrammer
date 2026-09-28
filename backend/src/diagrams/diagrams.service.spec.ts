import { NotFoundException } from '@nestjs/common';

import { DiagramsService } from './diagrams.service';

describe('legacy diagram PUT persistence', () => {
  const initialContent = { elements: [{ id: 'old' }], connections: [], metadata: {} };
  const diagram = { id: 'diagram', projectId: 'project', isActive: true, name: 'Before', description: 'Before', content: initialContent };
  const lockedQuery = { setLock: jest.fn(), where: jest.fn(), getOne: jest.fn() };
  const transactionalRepository = { createQueryBuilder: jest.fn(() => lockedQuery), update: jest.fn() };
  const manager = { getRepository: jest.fn(() => transactionalRepository) };
  const repository = {
    manager: { transaction: jest.fn(async (work) => work(manager)) },
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const projects = { findOne: jest.fn() };
  const broadcast = { publishDiagramContent: jest.fn() };
  const service = new DiagramsService(repository as any, projects as any, {} as any, {} as any, {} as any, broadcast as any);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({ ...diagram, project: undefined });
    repository.findOneBy.mockResolvedValue({ ...diagram, content: { elements: [{ id: 'new' }], connections: [], metadata: {} } });
    projects.findOne.mockResolvedValue({ ownerId: 'owner', projectMembers: [{ userId: 'editor', role: 'editor' }] });
    lockedQuery.setLock.mockReturnValue(lockedQuery);
    lockedQuery.where.mockReturnValue(lockedQuery);
    lockedQuery.getOne.mockResolvedValue({ ...diagram });
    transactionalRepository.update.mockResolvedValue({ affected: 1 });
  });

  it('locks the latest row, merges concurrent distinct IDs, persists before broadcasting canonical content', async () => {
    const content = { elements: [{ id: 'old' }, { id: 'local' }], connections: [], metadata: {} };
    lockedQuery.getOne.mockResolvedValueOnce({ ...diagram, content: { elements: [{ id: 'old' }, { id: 'remote' }], connections: [], metadata: {} } });
    const saved = await service.updateDiagram('editor', 'diagram', { content });
    expect(lockedQuery.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalRepository.update).toHaveBeenCalledWith({ id: 'diagram', isActive: true }, { content: expect.objectContaining({ elements: expect.arrayContaining([{ id: 'old' }, { id: 'local' }, { id: 'remote' }]) }) });
    expect(broadcast.publishDiagramContent).toHaveBeenCalledWith('diagram', expect.objectContaining({ elements: expect.arrayContaining([{ id: 'remote' }, { id: 'local' }]) }));
    expect(saved).toBeDefined();
  });

  it.each([undefined, 0])('does not broadcast when persistence affects %s rows', async (affected) => {
    transactionalRepository.update.mockResolvedValueOnce({ affected });
    await expect(service.compareAndSave('owner', 'diagram', initialContent, initialContent)).rejects.toThrow('Diagram changed');
    expect(broadcast.publishDiagramContent).not.toHaveBeenCalled();
  });

  it('does not broadcast when the transaction fails', async () => {
    const failure = new Error('transaction failed');
    repository.manager.transaction.mockRejectedValueOnce(failure);
    await expect(service.compareAndSave('owner', 'diagram', initialContent, initialContent)).rejects.toBe(failure);
    expect(broadcast.publishDiagramContent).not.toHaveBeenCalled();
  });

  it('applies same-ID updates from the later serialized transaction', async () => {
    const base = { elements: [{ id: 'same', name: 'base' }], connections: [], metadata: {} };
    const proposed = { ...base, elements: [{ id: 'same', name: 'later' }] };
    lockedQuery.getOne.mockResolvedValueOnce({ ...diagram, content: { ...base, elements: [{ id: 'same', name: 'earlier' }] } });
    await service.compareAndSave('owner', 'diagram', base, proposed);
    expect(transactionalRepository.update).toHaveBeenCalledWith({ id: 'diagram', isActive: true }, { content: expect.objectContaining({ elements: [{ id: 'same', name: 'later' }] }) });
  });

  it('applies a later same-ID delete over an earlier serialized update', async () => {
    const base = { elements: [{ id: 'same', name: 'base' }], connections: [], metadata: {} };
    lockedQuery.getOne.mockResolvedValueOnce({ ...diagram, content: { ...base, elements: [{ id: 'same', name: 'earlier' }] } });
    await service.compareAndSave('owner', 'diagram', base, { ...base, elements: [] });
    expect(transactionalRepository.update).toHaveBeenCalledWith({ id: 'diagram', isActive: true }, { content: expect.objectContaining({ elements: [] }) });
  });

  it('preserves distinct-ID edits from concurrent transactions', async () => {
    const base = { elements: [{ id: 'base', name: 'Base' }], connections: [], metadata: {} };
    let persistedContent = base;
    let transactionTail = Promise.resolve();
    repository.manager.transaction.mockImplementation(async (work) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await work(manager);
      } finally {
        release();
      }
    });
    lockedQuery.getOne.mockImplementation(async () => ({ ...diagram, content: persistedContent }));
    transactionalRepository.update.mockImplementation(async (_criteria, patch) => {
      persistedContent = patch.content;
      return { affected: 1 };
    });

    await Promise.all([
      service.compareAndSave('owner', 'diagram', base, { ...base, elements: [...base.elements, { id: 'first', name: 'First' }] }),
      service.compareAndSave('owner', 'diagram', base, { ...base, elements: [...base.elements, { id: 'second', name: 'Second' }] }),
    ]);

    expect(persistedContent.elements).toEqual(expect.arrayContaining([
      { id: 'base', name: 'Base' }, { id: 'first', name: 'First' }, { id: 'second', name: 'Second' },
    ]));
    expect(repository.manager.transaction).toHaveBeenCalledTimes(2);
  });

  it('retains authorization for legacy PUT', async () => {
    projects.findOne.mockResolvedValueOnce({ isPublic: true, ownerId: 'owner', projectMembers: [{ userId: 'viewer', role: 'viewer' }] });
    await expect(service.updateDiagram('viewer', 'diagram', { content: { elements: [] } })).rejects.toThrow('Sin permisos para editar diagrama');
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });
});
