import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DiagramEntity } from './entities/diagram.entity';
import { DiagramVersionEntity } from './entities/diagram-version.entity';
import { ProjectEntity } from '../projects/entities/project.entity';
import { ProjectMemberEntity } from '../projects/entities/project-member.entity';
import { UserEntity } from '../users/entities/user.entity';
import { DiagramsController } from './diagrams.controller';
import { DiagramsService } from './diagrams.service';

@Module({
  imports: [TypeOrmModule.forFeature([DiagramEntity, DiagramVersionEntity, ProjectEntity, ProjectMemberEntity, UserEntity])],
  controllers: [DiagramsController],
  providers: [DiagramsService],
  exports: [DiagramsService],
})
export class DiagramsModule {}
