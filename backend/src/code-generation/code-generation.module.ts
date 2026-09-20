import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { GeneratedCodeEntity } from './entities/generated-code.entity';
import { CodeGenerationController } from './code-generation.controller';
import { CodeGenerationService } from './code-generation.service';
import { UserEntity } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([GeneratedCodeEntity, DiagramEntity, UserEntity]), AiModule],
  controllers: [CodeGenerationController],
  providers: [CodeGenerationService, JwtAuthGuard],
})
export class CodeGenerationModule {}
