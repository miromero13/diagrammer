import { Column, Entity, Index, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';

import { BaseEntity } from '../../common/entities/base.entity';
import { UserRole } from '../enums/user-role.enum';
import { ProjectEntity } from '../../projects/entities/project.entity';
import { ProjectMemberEntity } from '../../projects/entities/project-member.entity';
import { DiagramVersionEntity } from '../../diagrams/entities/diagram-version.entity';
import { AIInteractionEntity } from '../../ai/entities/ai-interaction.entity';

@Entity({ name: 'users' })
@Index(['username'], { unique: true })
@Index(['email'], { unique: true })
export class UserEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  username: string;

  @Column({ type: 'varchar', length: 100 })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  password: string;

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'varchar', length: 255, name: 'avatar_url', nullable: true })
  avatarUrl?: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', name: 'email_verified', default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp with time zone', name: 'last_login', nullable: true })
  lastLogin?: Date | null;

  @Column({ type: 'timestamp with time zone', name: 'last_login_at', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company?: string | null;

  @OneToMany(() => ProjectEntity, (project) => project.owner)
  ownedProjects: ProjectEntity[];

  @OneToMany(() => ProjectMemberEntity, (member) => member.user)
  projectMemberships: ProjectMemberEntity[];

  @OneToMany(() => DiagramVersionEntity, (version) => version.createdBy)
  createdDiagramVersions: DiagramVersionEntity[];

  @OneToMany(() => AIInteractionEntity, (interaction) => interaction.user)
  aiInteractions: AIInteractionEntity[];
}
