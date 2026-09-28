import { ConflictException } from '@nestjs/common';

import { DiagramsService } from './diagrams.service';

describe('legacy diagram PUT persistence', () => {
  const initialContent = { elements: [{ id: 'old' }], connections: [], metadata: {} };
  const diagram = { id: 'diagram', projectId: 'project', isActive: true, name: 'Before', description: 'Before', content: initialContent };
  const execute = jest.fn();
  const query = { update: jest.fn(), set: jest.fn(), where: jest.fn(), execute };
  const repository = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => query),
  };
  const projects = { findOne: jest.fn() };
  const broadcast = { publishDiagramContent: jest.fn() };
  const service = new DiagramsService(repository as any, projects as any, {} as any, {} as any, {} as any, broadcast as any);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({ ...diagram, project: undefined });
    repository.findOneBy.mockResolvedValue({ ...diagram, content: { elements: [{ id: 'new' }], connections: [], metadata: {} } });
    projects.findOne.mockResolvedValue({ ownerId: 'owner', projectMembers: [{ userId: 'editor', role: 'editor' }] });
    query.update.mockReturnValue(query);
    query.set.mockReturnValue(query);
    query.where.mockReturnValue(query);
    execute.mockResolvedValue({ affected: 1 });
  });

  it('uses content compare-and-save and broadcasts committed content for PUT', async () => {
    const content = { elements: [{ id: 'new' }], connections: [], metadata: {} };
    await service.updateDiagram('editor', 'diagram', { content });

    expect(query.where).toHaveBeenCalledWith(expect.stringContaining('CAST(content AS jsonb) = CAST(:expected AS jsonb)'), {
      id: 'diagram', expected: JSON.stringify(initialContent),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(broadcast.publishDiagramContent).toHaveBeenCalledWith('diagram', content);
  });

  it('does not broadcast or report success when the PUT snapshot is stale', async () => {
    execute.mockResolvedValueOnce({ affected: 0 });
    await expect(service.updateDiagram('owner', 'diagram', { content: { elements: [], connections: [] } })).rejects.toBeInstanceOf(ConflictException);
    expect(broadcast.publishDiagramContent).not.toHaveBeenCalled();
  });

  it('retains authorization for legacy PUT', async () => {
    projects.findOne.mockResolvedValueOnce({ isPublic: true, ownerId: 'owner', projectMembers: [{ userId: 'viewer', role: 'viewer' }] });
    await expect(service.updateDiagram('viewer', 'diagram', { content: { elements: [] } })).rejects.toThrow('Sin permisos para editar diagrama');
    expect(execute).not.toHaveBeenCalled();
  });
});
