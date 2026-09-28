import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { DiagramEntity } from '../../diagrams/entities/diagram.entity';
import { ProjectMemberEntity } from './project-member.entity';

@Entity({ name: 'projects' })
@Index(['name'])
export class ProjectEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => UserEntity, (user) => user.ownedProjects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: UserEntity;

  @Column({ type: 'boolean', name: 'is_public', default: false })
  isPublic: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: Record<string, unknown>;

  @OneToMany(() => DiagramEntity, (diagram) => diagram.project, { cascade: true })
  diagrams: DiagramEntity[];

  @OneToMany(() => ProjectMemberEntity, (member) => member.project, { cascade: true })
  projectMembers: ProjectMemberEntity[];
}
