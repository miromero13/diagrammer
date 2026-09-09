import { Allow, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateCodeDto {
  @ApiPropertyOptional({ default: 'spring-boot' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ default: 'generated-project' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ default: 'com.example.generated' })
  @IsOptional()
  @IsString()
  packageName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  databaseConfig?: Record<string, unknown>;
}
