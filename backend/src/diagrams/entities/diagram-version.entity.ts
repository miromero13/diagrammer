import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

import { DiagramEntity } from './diagram.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity({ name: 'diagram_versions' })
@Index(['diagramId'])
export class DiagramVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'diagram_id' })
  diagramId: string;

  @ManyToOne(() => DiagramEntity, (diagram) => diagram.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'diagram_id' })
  diagram: DiagramEntity;

  @Column({ type: 'integer', name: 'version_number' })
  versionNumber: number;

  @Column({ type: 'jsonb' })
  content: Record<string, unknown>;

  @Column({ type: 'text', name: 'changes_summary', nullable: true })
  changesSummary?: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById: string;

  @ManyToOne(() => UserEntity, (user) => user.createdDiagramVersions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  createdBy: UserEntity;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
