import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { UserEntity } from '../../users/entities/user.entity';
import { DiagramEntity } from '../../diagrams/entities/diagram.entity';
import { AIInteractionType } from '../enums/ai-interaction-type.enum';

@Entity({ name: 'ai_interactions' })
@Index(['userId'])
@Index(['diagramId'])
@Index(['interactionType'])
@Index(['createdAt'])
export class AIInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.aiInteractions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'uuid', name: 'diagram_id', nullable: true })
  diagramId?: string | null;

  @ManyToOne(() => DiagramEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'diagram_id' })
  diagram?: DiagramEntity | null;

  @Column({ type: 'enum', enum: AIInteractionType, name: 'interaction_type', default: AIInteractionType.ASK })
  interactionType: AIInteractionType;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text' })
  response: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  context: Record<string, unknown>;

  @Column({ type: 'float', name: 'confidence_score', nullable: true })
  confidenceScore?: number | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt: Date;
}
