import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { BaseEntity } from '../../common/entities/base.entity';
import { ProjectEntity } from '../../projects/entities/project.entity';
import { DiagramVersionEntity } from './diagram-version.entity';

@Entity({ name: 'diagrams' })
@Index(['projectId'])
export class DiagramEntity extends BaseEntity {
  @Column({ type: 'uuid', name: 'project_id' })
  projectId: string;

  @ManyToOne(() => ProjectEntity, (project) => project.diagrams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'jsonb', default: () => "'{\"elements\":[],\"connections\":[],\"metadata\":{}}'::jsonb" })
  content: Record<string, unknown>;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => DiagramVersionEntity, (version) => version.diagram, { cascade: true })
  versions: DiagramVersionEntity[];
}
