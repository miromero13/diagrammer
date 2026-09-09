import { Allow, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ChatAiMode {
  ASK = 'ask',
  AGENT = 'agent',
}

export class ChatAiAttachmentDto {
  @ApiPropertyOptional({ enum: ['image', 'document', 'text'] })
  @IsOptional()
  @Allow()
  kind?: 'image' | 'document' | 'text';

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  base64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  text?: string;
}

export class ChatAiDto {
  @ApiPropertyOptional()
  @IsString()
  message: string;

  @ApiPropertyOptional({ enum: ChatAiMode })
  @IsOptional()
  @IsEnum(ChatAiMode)
  mode?: ChatAiMode;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  diagramId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  diagramData?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  conversationHistory?: Array<{ user: string; ai: string }> | null;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @Allow()
  attachments?: ChatAiAttachmentDto[] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  sourceText?: string | null;
}
