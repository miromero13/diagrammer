import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatAiDto } from './dto/chat-ai.dto';
import { buildChatPayloadFromMultipart } from './multipart-chat.utils';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiConsumes('application/json', 'multipart/form-data')
  async chat(@Req() req: any, @Body() body: ChatAiDto) {
    const contentType = String(req.headers?.['content-type'] || '');
    const payload = contentType.includes('multipart/form-data') ? await buildChatPayloadFromMultipart(req) : body;
    const message = payload?.message?.trim();

    if (!message) {
      throw new BadRequestException('Message is required');
    }

    return this.aiService.chat(req.user.id, payload);
  }

  @Get('diagrams/:diagramId/messages')
  getDiagramMessages(@Req() req: any, @Param('diagramId') diagramId: string, @Query('limit') limit?: string) {
    return this.aiService.getDiagramChatMessages(req.user.id, diagramId, Number(limit || 100));
  }
}
