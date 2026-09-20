import { Allow, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateCodeDto {
  @ApiProperty({ description: 'Company name used to derive the Java package segment' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ description: 'Lowercase backend project name' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,62}$/)
  backendName: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Allow()
  authentication?: {
    enabled: boolean;
    principalClassId?: string;
    roleClassId?: string;
    permissionClassId?: string;
  };

  // Kept for clients of the old route; Phase 1 does not use these values.
  @ApiPropertyOptional({ default: 'spring-boot' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  databaseConfig?: Record<string, unknown>;
}
