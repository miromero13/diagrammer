import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'My Project' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'private', enum: ['private', 'public'] })
  @IsOptional()
  @IsString()
  visibility?: 'private' | 'public';

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateProjectDto extends CreateProjectDto {}

export class InviteMemberDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsString()
  email: string;

  @ApiPropertyOptional({ example: 'viewer', enum: ['viewer', 'editor', 'admin'] })
  @IsOptional()
  @IsString()
  role?: 'viewer' | 'editor' | 'admin';
}

export class CreateDiagramDto {
  @ApiProperty({ example: 'Class Diagram' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: 'Diagram description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  content?: Record<string, unknown> | string;
}
