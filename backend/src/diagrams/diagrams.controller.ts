import { Body, Controller, Delete, Get, Param, Post, Put, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiagramsService } from './diagrams.service';

@ApiTags('Diagrams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('diagrams')
export class DiagramsController {
  constructor(private readonly diagramsService: DiagramsService) {}

  @Get(':id')
  getDiagram(@Req() req: any, @Param('id') id: string) {
    return this.diagramsService.getDiagram(req.user.id, id);
  }

  @Put(':id')
  updateDiagram(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.diagramsService.updateDiagram(req.user.id, id, body);
  }

  @Delete(':id')
  deleteDiagram(@Req() req: any, @Param('id') id: string) {
    return this.diagramsService.deleteDiagram(req.user.id, id);
  }

  @Get(':id/versions')
  getVersions(@Req() req: any, @Param('id') id: string, @Query() query: any) {
    return this.diagramsService.getDiagramVersions(req.user.id, id, query);
  }

  @Post(':id/versions')
  createVersion(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.diagramsService.createDiagramVersion(req.user.id, id, body);
  }

  @Patch(':id/quick-update')
  quickUpdate(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.diagramsService.quickUpdate(req.user.id, id, body.content);
  }
}
