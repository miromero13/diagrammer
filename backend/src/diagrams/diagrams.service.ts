import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { DiagramEntity } from './entities/diagram.entity';
import { DiagramVersionEntity } from './entities/diagram-version.entity';
import { ProjectEntity } from '../projects/entities/project.entity';
import { ProjectMemberEntity } from '../projects/entities/project-member.entity';
import { CreateDiagramDto } from '../projects/dto/project.dto';
import { UserEntity } from '../users/entities/user.entity';
import { CollaborationGateway } from '../collaboration/collaboration.gateway';

@Injectable()
export class DiagramsService {
  constructor(
    @InjectRepository(DiagramEntity) private readonly diagramRepository: Repository<DiagramEntity>,
    @InjectRepository(ProjectEntity) private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity) private readonly memberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(DiagramVersionEntity) private readonly versionRepository: Repository<DiagramVersionEntity>,
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  private async ensureAccess(diagramId: string, userId: string) {
    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId, isActive: true }, relations: { project: true } });
    if (!diagram) throw new NotFoundException('Diagrama no encontrado');
    const project = await this.projectRepository.findOne({ where: { id: diagram.projectId }, relations: { projectMembers: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const isOwner = project.ownerId === userId;
    const isPublic = project.isPublic;
    const isMember = project.projectMembers?.some((m) => m.userId === userId);
    if (!isOwner && !isPublic && !isMember) throw new NotFoundException('Diagrama no encontrado');
    return { diagram, project };
  }

  async getEditableDiagram(userId: string, id: string) {
    const { diagram, project } = await this.ensureAccess(id, userId);
    const role = project.projectMembers?.find((member) => member.userId === userId)?.role;
    if (project.ownerId !== userId && !['admin', 'editor'].includes(role || '')) throw new NotFoundException('Sin permisos para editar diagrama');
    return diagram;
  }

  private equalJson(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private mergeById<T extends Record<string, any>>(baseValue: unknown, proposedValue: unknown, latestValue: unknown): T[] {
    const base = Array.isArray(baseValue) ? baseValue : [];
    const proposed = Array.isArray(proposedValue) ? proposedValue : [];
    const latest = Array.isArray(latestValue) ? latestValue : [];
    const baseById = new Map(base.filter((item) => item && item.id != null).map((item) => [String(item.id), item]));
    const proposedById = new Map(proposed.filter((item) => item && item.id != null).map((item) => [String(item.id), item]));
    const latestById = new Map(latest.filter((item) => item && item.id != null).map((item) => [String(item.id), item]));

    for (const [id, oldItem] of baseById) {
      const nextItem = proposedById.get(id);
      if (!nextItem) latestById.delete(id);
      else if (!this.equalJson(oldItem, nextItem)) latestById.set(id, nextItem);
    }
    for (const [id, nextItem] of proposedById) {
      if (!baseById.has(id)) latestById.set(id, nextItem);
    }
    return [...latestById.values()] as T[];
  }

  private mergeContent(base: Record<string, any>, proposed: Record<string, any>, latest: Record<string, any>) {
    const merged: Record<string, any> = { ...latest };
    for (const key of new Set([...Object.keys(base), ...Object.keys(proposed)])) {
      if (key === 'elements' || key === 'connections' || key === 'metadata') continue;
      if (this.equalJson(base[key], proposed[key])) continue;
      if (Object.prototype.hasOwnProperty.call(proposed, key)) merged[key] = proposed[key];
      else delete merged[key];
    }
    merged.elements = this.mergeById(base.elements, proposed.elements, latest.elements);
    merged.connections = this.mergeById(base.connections, proposed.connections, latest.connections);
    const baseMetadata = base.metadata && typeof base.metadata === 'object' ? base.metadata : {};
    const proposedMetadata = proposed.metadata && typeof proposed.metadata === 'object' ? proposed.metadata : {};
    const latestMetadata = latest.metadata && typeof latest.metadata === 'object' ? latest.metadata : {};
    const metadata = { ...latestMetadata };
    for (const key of new Set([...Object.keys(baseMetadata), ...Object.keys(proposedMetadata)])) {
      if (this.equalJson(baseMetadata[key], proposedMetadata[key])) continue;
      if (Object.prototype.hasOwnProperty.call(proposedMetadata, key)) metadata[key] = proposedMetadata[key];
      else delete metadata[key];
    }
    merged.metadata = metadata;
    return merged;
  }

  async compareAndSave(userId: string, id: string, expected: unknown, content: Record<string, unknown>) {
    await this.getEditableDiagram(userId, id);
    if (!expected || typeof expected !== 'object' || Array.isArray(expected) || !content || typeof content !== 'object' || Array.isArray(content)) {
      throw new ConflictException('Diagram content is invalid');
    }
    const base = expected as Record<string, any>;
    const proposed = content as Record<string, any>;
    const canonical = await this.diagramRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(DiagramEntity);
      const latest = await repository.createQueryBuilder('diagram').setLock('pessimistic_write')
        .where('diagram.id = :id AND diagram.isActive = true', { id }).getOne();
      if (!latest) throw new NotFoundException('Diagrama no encontrado');
      const merged = this.mergeContent(base, proposed, (latest.content ?? {}) as Record<string, any>);
      const result = await repository.update({ id, isActive: true }, { content: merged });
      if (result.affected !== 1) throw new ConflictException('Diagram changed. Reload and try again.');
      return merged;
    });
    this.collaborationGateway.publishDiagramContent(id, canonical);
    return canonical;
  }

  async getDiagram(userId: string, id: string) {
    const { diagram } = await this.ensureAccess(id, userId);
    return diagram;
  }

  async updateDiagram(userId: string, id: string, body: Partial<CreateDiagramDto> & { content?: any }) {
    const { diagram, project } = await this.ensureAccess(id, userId);
    const isOwner = project.ownerId === userId;
    const role = project.projectMembers?.find((m) => m.userId === userId)?.role;
    if (!isOwner && !['admin', 'editor'].includes(role || '')) throw new NotFoundException('Sin permisos para editar diagrama');
    if (body.content !== undefined) {
      const content = typeof body.content === 'string' ? JSON.parse(body.content) : body.content;
      await this.compareAndSave(userId, id, diagram.content, content);
    }
    if (body.name !== undefined || body.description !== undefined) {
      await this.diagramRepository.update(diagram.id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      });
    }
    return this.diagramRepository.findOneBy({ id });
  }

  async deleteDiagram(userId: string, id: string) {
    const { diagram, project } = await this.ensureAccess(id, userId);
    const isOwner = project.ownerId === userId;
    const role = project.projectMembers?.find((m) => m.userId === userId)?.role;
    if (!isOwner && role !== 'admin') throw new NotFoundException('Sin permisos para eliminar diagrama');
    await this.diagramRepository.update(diagram.id, { isActive: false });
    return { success: true, message: 'Diagrama eliminado exitosamente' };
  }

  async getDiagramVersions(userId: string, id: string, query: { page?: number; limit?: number }) {
    await this.ensureAccess(id, userId);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const [versions, total] = await this.versionRepository.findAndCount({
      where: { diagramId: id },
      relations: { createdBy: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { versions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async createDiagramVersion(userId: string, id: string, body: { versionName?: string; changes?: string; content?: any }) {
    const { diagram, project } = await this.ensureAccess(id, userId);
    const isOwner = project.ownerId === userId;
    const role = project.projectMembers?.find((m) => m.userId === userId)?.role;
    if (!isOwner && !['admin', 'editor'].includes(role || '')) throw new NotFoundException('Sin permisos para crear versión');

    const currentMax = await this.versionRepository.createQueryBuilder('v')
      .select('COALESCE(MAX(v.versionNumber), 0)', 'max')
      .where('v.diagramId = :id', { id })
      .getRawOne<{ max: string }>();

    const version = this.versionRepository.create({
      id: randomUUID(),
      createdAt: new Date(),
      diagramId: id,
      versionNumber: Number(currentMax?.max || 0) + 1,
      content: body.content || diagram.content,
      changesSummary: body.changes || 'Sin descripción de cambios',
      createdById: userId,
    });
    const saved = await this.versionRepository.save(version);
    return this.versionRepository.findOne({ where: { id: saved.id }, relations: { createdBy: true } });
  }

  async quickUpdate(userId: string, id: string, content: any, expected: unknown) {
    const next = typeof content === 'string' ? JSON.parse(content) : content;
    await this.compareAndSave(userId, id, expected, next);
    return this.diagramRepository.findOneBy({ id });
  }
}
