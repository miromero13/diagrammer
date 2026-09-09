import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectEntity } from './entities/project.entity';
import { ProjectMemberEntity } from './entities/project-member.entity';
import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { UserEntity } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity, ProjectMemberEntity, DiagramEntity, UserEntity])],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
