import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { UserEntity } from '../users/entities/user.entity';
import { CollaborationGateway } from './collaboration.gateway';
import { CollaborationStateService } from './collaboration-state.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, DiagramEntity])],
  providers: [CollaborationGateway, CollaborationStateService],
})
export class CollaborationModule {}
