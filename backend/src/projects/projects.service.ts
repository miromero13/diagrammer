import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { ProjectEntity } from './entities/project.entity';
import { ProjectMemberEntity } from './entities/project-member.entity';
import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { UserEntity } from '../users/entities/user.entity';
import { ProjectMemberRole } from './enums/project-member-role.enum';
import { ProjectMemberStatus } from './enums/project-member-status.enum';
import { CreateProjectDto, CreateDiagramDto, InviteMemberDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity) private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity) private readonly memberRepository: Repository<ProjectMemberEntity>,
    @InjectRepository(DiagramEntity) private readonly diagramRepository: Repository<DiagramEntity>,
    @InjectRepository(UserEntity) private readonly userRepository: Repository<UserEntity>,
  ) {}

  private async ensureProjectAccess(projectId: string, userId: string, permissions: Array<'owner' | 'member' | 'public'>) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: { owner: true, projectMembers: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');

    const isOwner = project.ownerId === userId;
    const isMember = project.projectMembers?.some((m) => m.userId === userId);
    const isPublic = project.isPublic;

    const allowed = permissions.some((p) => (p === 'owner' && isOwner) || (p === 'member' && isMember) || (p === 'public' && isPublic));
    if (!allowed) throw new NotFoundException('Proyecto no encontrado o sin permisos');
    return project;
  }

  async getProjects(userId: string, query: { page?: number; limit?: number; search?: string; visibility?: 'private' | 'public' }) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const offset = (page - 1) * limit;

    const qb = this.projectRepository.createQueryBuilder('project')
      .where('project.ownerId = :userId', { userId })
      .orWhere('EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project.id AND pm.user_id = :userId)', { userId });

    if (query.search) {
      qb.andWhere(new Brackets((qb2) => {
        qb2.where('project.name ILIKE :search', { search: `%${query.search}%` })
          .orWhere('project.description ILIKE :search', { search: `%${query.search}%` });
      }));
    }

    if (query.visibility) qb.andWhere('project.isPublic = :isPublic', { isPublic: query.visibility === 'public' });

    const total = await qb.clone().getCount();
    const projects = await qb.orderBy('project.updatedAt', 'DESC').skip(offset).take(limit).getMany();

    const ids = projects.map((project) => project.id);
    const fullProjects = ids.length
      ? await this.projectRepository.find({
          where: { id: In(ids) },
          relations: { owner: true, projectMembers: { user: true }, diagrams: true },
        })
      : [];
    const orderedProjects = ids.map((id) => fullProjects.find((project) => project.id === id)).filter(Boolean);

    return { projects: orderedProjects, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getProject(userId: string, id: string) {
    const project = await this.projectRepository.createQueryBuilder('project')
      .leftJoinAndSelect('project.owner', 'owner')
      .leftJoinAndSelect('project.projectMembers', 'projectMembers')
      .leftJoinAndSelect('projectMembers.user', 'memberUser')
      .leftJoinAndSelect('project.diagrams', 'diagrams')
      .where('project.id = :id', { id })
      .andWhere(new Brackets((qb) => {
        qb.where('project.ownerId = :userId', { userId })
          .orWhere('project.isPublic = true')
          .orWhere('EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project.id AND pm.user_id = :userId)', { userId });
      }))
      .getOne();

    if (!project) throw new NotFoundException('Proyecto no encontrado');
    const userRole = project.ownerId === userId ? 'owner' : (project.projectMembers?.find((m) => m.userId === userId)?.role || 'viewer');
    return { project, userRole };
  }

  async createProject(userId: string, dto: CreateProjectDto) {
    const now = new Date();
    const project = this.projectRepository.create({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      name: dto.name,
      description: dto.description,
      ownerId: userId,
      isPublic: dto.visibility === 'public',
      settings: dto.settings || {},
    });
    const saved = await this.projectRepository.save(project);
    return this.projectRepository.findOne({ where: { id: saved.id }, relations: { owner: true } });
  }

  async updateProject(userId: string, id: string, dto: UpdateProjectDto) {
    const project = await this.projectRepository.findOne({ where: { id }, relations: { projectMembers: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado o sin permisos');
    const isOwner = project.ownerId === userId;
    const role = project.projectMembers?.find((m) => m.userId === userId)?.role;
    if (!isOwner && !['admin', 'editor'].includes(role || '')) throw new NotFoundException('Proyecto no encontrado o sin permisos');

    await this.projectRepository.update(id, {
      name: dto.name,
      description: dto.description,
      isPublic: typeof dto.visibility === 'string' ? dto.visibility === 'public' : dto.visibility,
      settings: dto.settings,
    });
    return this.projectRepository.findOne({ where: { id }, relations: { owner: true, projectMembers: { user: true }, diagrams: true } });
  }

  async deleteProject(userId: string, id: string) {
    const project = await this.projectRepository.findOne({ where: { id, ownerId: userId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado o sin permisos');
    await this.projectRepository.remove(project);
    return { success: true, message: 'Proyecto eliminado exitosamente' };
  }

  async inviteMember(userId: string, projectId: string, dto: InviteMemberDto) {
    const project = await this.projectRepository.findOne({ where: { id: projectId }, relations: { projectMembers: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado o sin permisos');
    const isOwner = project.ownerId === userId;
    const isAdmin = project.projectMembers?.some((m) => m.userId === userId && m.role === 'admin');
    if (!isOwner && !isAdmin) throw new NotFoundException('Proyecto no encontrado o sin permisos');

    const userToInvite = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!userToInvite) throw new NotFoundException('Usuario no encontrado');

    const existing = await this.memberRepository.findOne({ where: { projectId, userId: userToInvite.id } });
    if (existing) throw new BadRequestException('El usuario ya es miembro del proyecto');

    const membership = this.memberRepository.create({
      id: randomUUID(),
      projectId,
      userId: userToInvite.id,
      role: (dto.role as ProjectMemberRole) || ProjectMemberRole.VIEWER,
      permissions: {},
      invitedBy: userId,
      invitedAt: new Date(),
      joinedAt: new Date(),
      status: ProjectMemberStatus.ACTIVE,
    });
    const saved = await this.memberRepository.save(membership);
    return { membership: { ...saved, user: userToInvite } };
  }

  async removeMember(userId: string, projectId: string, memberUserId: string) {
    const project = await this.projectRepository.findOne({ where: { id: projectId }, relations: { projectMembers: true } });
    if (!project) throw new NotFoundException('Miembro no encontrado o sin permisos');
    const isOwner = project.ownerId === userId;
    const isAdmin = project.projectMembers?.some((m) => m.userId === userId && m.role === 'admin');
    if (!isOwner && !isAdmin) throw new NotFoundException('Miembro no encontrado o sin permisos');

    const membership = await this.memberRepository.findOne({ where: { projectId, userId: memberUserId } });
    if (!membership) throw new NotFoundException('Miembro no encontrado o sin permisos');
    await this.memberRepository.remove(membership);
    return { success: true, message: 'Miembro removido exitosamente' };
  }

  async getProjectDiagrams(userId: string, projectId: string, query: { page?: number; limit?: number }) {
    await this.ensureProjectAccess(projectId, userId, ['owner', 'member', 'public']);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const [diagrams, total] = await this.diagramRepository.findAndCount({
      where: { projectId, isActive: true },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { diagrams, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async createProjectDiagram(userId: string, projectId: string, dto: CreateDiagramDto) {
    const project = await this.projectRepository.findOne({ where: { id: projectId }, relations: { projectMembers: true } });
    if (!project) throw new NotFoundException('Proyecto no encontrado o sin permisos');
    const isOwner = project.ownerId === userId;
    const role = project.projectMembers?.find((m) => m.userId === userId)?.role;
    if (!isOwner && !['admin', 'editor'].includes(role || '')) throw new NotFoundException('Proyecto no encontrado o sin permisos');

    const diagram = this.diagramRepository.create({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      projectId,
      name: dto.name,
      description: dto.description,
      content: typeof dto.content === 'string' ? JSON.parse(dto.content) : (dto.content || { elements: [], connections: [], metadata: {} }),
      isActive: true,
    });
    return this.diagramRepository.save(diagram);
  }
}
