import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { DiagramEntity } from '../../diagrams/entities/diagram.entity';

@Entity({ name: 'generated_code' })
@Index(['diagramId'])
@Index(['language'])
@Index(['createdAt'])
@Index(['ownerId'])
export class GeneratedCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'diagram_id' })
  diagramId: string;

  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId?: string | null;

  @ManyToOne(() => DiagramEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'diagram_id' })
  diagram: DiagramEntity;

  @Column({ type: 'varchar', length: 20, default: '1.0.0' })
  version: string;

  @Column({ type: 'varchar', length: 50 })
  language: string;

  @Column({ type: 'varchar', length: 30, default: 'QUEUED' })
  status: string;

  @Column({ type: 'varchar', length: 100, name: 'backend_name' })
  backendName: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  authentication: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  steps: Array<Record<string, string>>;

  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @Column({ type: 'jsonb', name: 'code_structure' })
  codeStructure: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  files: Record<string, string>;

  @Column({ type: 'bytea', nullable: true, name: 'zip_data' })
  zipData?: Buffer | null;

  @Column({ type: 'boolean', name: 'is_valid', default: true })
  isValid: boolean;

  @Column({ type: 'text', name: 'compilation_errors', nullable: true })
  compilationErrors?: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
