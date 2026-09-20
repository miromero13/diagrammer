import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CodeGenerationService } from './code-generation.service';
import { GenerateCodeDto } from './dto/generate-code.dto';

@ApiTags('Code Generation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('code-generation')
export class CodeGenerationController {
  constructor(private readonly codeGenerationService: CodeGenerationService) {}

  @Post('diagrams/:diagramId/generate')
  generate(@Req() req: any, @Param('diagramId') diagramId: string, @Body() body: GenerateCodeDto) {
    return this.codeGenerationService.generateBackend(req.user.id, diagramId, body);
  }

  @Get(':generatedCodeId/download')
  download(@Req() req: any, @Param('generatedCodeId') generatedCodeId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.codeGenerationService.downloadProject(req.user.id, generatedCodeId, reply);
  }

  @Get('diagrams/:diagramId/history')
  history(@Req() req: any, @Param('diagramId') diagramId: string) {
    return this.codeGenerationService.getGeneratedCodeHistory(req.user.id, diagramId);
  }

  @Get(':generatedCodeId/status')
  status(@Req() req: any, @Param('generatedCodeId') generatedCodeId: string) {
    return this.codeGenerationService.getGeneratedCodeDetails(req.user.id, generatedCodeId);
  }

  @Get(':generatedCodeId')
  details(@Req() req: any, @Param('generatedCodeId') generatedCodeId: string) {
    return this.codeGenerationService.getGeneratedCodeDetails(req.user.id, generatedCodeId);
  }

  @Delete(':generatedCodeId')
  delete(@Req() req: any, @Param('generatedCodeId') generatedCodeId: string) {
    return this.codeGenerationService.deleteGeneratedCode(req.user.id, generatedCodeId);
  }

  @Get(':generatedCodeId/files/*')
  getFile(@Req() req: any, @Param('generatedCodeId') generatedCodeId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const filePath = req.params?.filePath || req.params?.['*'] || req.params?.[0] || '';
    return this.codeGenerationService.getGeneratedFile(req.user.id, generatedCodeId, filePath, reply);
  }
}
