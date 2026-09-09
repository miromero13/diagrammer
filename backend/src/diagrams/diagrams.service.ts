import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { DiagramEntity } from './entities/diagram.entity';
import { DiagramVersionEntity } from './entities/diagram-version.entity';
import { ProjectEntity } from '../projects/entities/project.entity';
import { ProjectMemberEntity } from '../projects/entities/project-member.entity';
import { CreateDiagramDto } from '../projects/dto/project.dto';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class DiagramsService {
  constructor(
    @InjectRepository(DiagramEntity) private readonly diagramRepository: Repository<DiagramEntity>,
    @InjectRepository(ProjectEntity) private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity) private readonly memberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(DiagramVersionEntity) private readonly versionRepository: Repository<DiagramVersionEntity>,
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
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

  async getDiagram(userId: string, id: string) {
    const { diagram } = await this.ensureAccess(id, userId);
    return diagram;
  }

  async updateDiagram(userId: string, id: string, body: Partial<CreateDiagramDto> & { content?: any }) {
    const { diagram, project } = await this.ensureAccess(id, userId);
    const isOwner = project.ownerId === userId;
    const role = project.projectMembers?.find((m) => m.userId === userId)?.role;
    if (!isOwner && !['admin', 'editor'].includes(role || '')) throw new NotFoundException('Sin permisos para editar diagrama');
    await this.diagramRepository.update(diagram.id, {
      name: body.name ?? diagram.name,
      description: body.description ?? diagram.description,
      content: body.content !== undefined ? (typeof body.content === 'string' ? JSON.parse(body.content) : body.content) : diagram.content,
    });
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

  async quickUpdate(userId: string, id: string, content: any) {
    const { diagram } = await this.ensureAccess(id, userId);
    await this.diagramRepository.update(diagram.id, { content: typeof content === 'string' ? JSON.parse(content) : content });
    return this.diagramRepository.findOneBy({ id });
  }
}
