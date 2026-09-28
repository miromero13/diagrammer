import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';

import { ProjectMemberRole } from '../enums/project-member-role.enum';
import { ProjectMemberStatus } from '../enums/project-member-status.enum';
import { ProjectEntity } from './project.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'project_members' })
@Unique(['projectId', 'userId'])
export class ProjectMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'project_id' })
  projectId: string;

  @ManyToOne(() => ProjectEntity, (project) => project.projectMembers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.projectMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'enum', enum: ProjectMemberRole, default: ProjectMemberRole.VIEWER })
  role: ProjectMemberRole;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  permissions: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'invited_by', nullable: true })
  invitedBy?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invited_by' })
  inviter?: UserEntity | null;

  @Column({ type: 'timestamp with time zone', name: 'invited_at', default: () => 'CURRENT_TIMESTAMP' })
  invitedAt: Date;

  @Column({ type: 'timestamp with time zone', name: 'joined_at', nullable: true })
  joinedAt?: Date | null;

  @Column({ type: 'enum', enum: ProjectMemberStatus, default: ProjectMemberStatus.PENDING })
  status: ProjectMemberStatus;
}
