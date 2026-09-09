import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EnvConfig } from './config/app.config';
import { DataSourceConfig } from './config/data.source';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { AiModule } from './ai/ai.module';
import { CodeGenerationModule } from './code-generation/code-generation.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { ProvidersModule } from './providers/providers.module';
import { CommonModule } from './common/common.module';
import { SeederModule } from './seeder/seeder.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', load: [EnvConfig] }),
    TypeOrmModule.forRoot({ ...DataSourceConfig, autoLoadEntities: true }),

    ProvidersModule,
    CommonModule,

    UsersModule,
    AuthModule,
    ProjectsModule,
    DiagramsModule,
    AiModule,
    CodeGenerationModule,
    CollaborationModule,

    SeederModule,
  ],
  controllers: [AppController],
})
export class AppModule { }
