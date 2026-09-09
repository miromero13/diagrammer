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
  generate(@Param('diagramId') diagramId: string, @Body() body: GenerateCodeDto) {
    return this.codeGenerationService.generateBackend(diagramId, body);
  }

  @Get(':generatedCodeId/download')
  download(@Param('generatedCodeId') generatedCodeId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.codeGenerationService.downloadProject(generatedCodeId, reply);
  }

  @Get('diagrams/:diagramId/history')
  history(@Param('diagramId') diagramId: string) {
    return this.codeGenerationService.getGeneratedCodeHistory(diagramId);
  }

  @Get(':generatedCodeId')
  details(@Param('generatedCodeId') generatedCodeId: string) {
    return this.codeGenerationService.getGeneratedCodeDetails(generatedCodeId);
  }

  @Delete(':generatedCodeId')
  delete(@Param('generatedCodeId') generatedCodeId: string) {
    return this.codeGenerationService.deleteGeneratedCode(generatedCodeId);
  }

  @Get(':generatedCodeId/files/*')
  getFile(@Param('generatedCodeId') generatedCodeId: string, @Req() req: any, @Res({ passthrough: true }) reply: FastifyReply) {
    const filePath = req.params?.filePath || req.params?.['*'] || req.params?.[0] || '';
    return this.codeGenerationService.getGeneratedFile(generatedCodeId, filePath, reply);
  }
}
