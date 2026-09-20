import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AIInteractionEntity } from './entities/ai-interaction.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserEntity } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AIInteractionEntity, UserEntity])],
  controllers: [AiController],
  providers: [AiService, JwtAuthGuard],
  exports: [AiService],
})
export class AiModule {}
