import { IsBoolean, IsDefined, IsNotEmpty, IsObject, IsOptional, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class AuthenticationConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((config) => config.enabled !== false)
  @IsString()
  @IsNotEmpty()
  principalClassId: string;

  @ValidateIf((config) => config.enabled !== false)
  @IsString()
  @IsNotEmpty()
  loginField: string;

  @ValidateIf((config) => config.enabled !== false)
  @IsString()
  @IsNotEmpty()
  credentialField: string;

  @ValidateIf((config) => config.enabled !== false)
  @IsString()
  @IsNotEmpty()
  testUserLogin: string;

  @ValidateIf((config) => config.enabled !== false)
  @IsString()
  @IsNotEmpty()
  testUserPassword: string;
}

export class GenerateCodeDto {
  @ApiProperty({ description: 'Company name used to derive the Java package segment' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ description: 'Lowercase backend project name' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,62}$/)
  backendName: string;

  @ApiProperty({ description: 'Basic JWT authentication configuration' })
  @IsDefined()
  @ValidateNested()
  @Type(() => AuthenticationConfigDto)
  authentication: AuthenticationConfigDto;

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
