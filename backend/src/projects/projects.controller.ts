import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService } from './projects.service';
@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  getProjects(@Req() req: any, @Query() query: any) {
    return this.projectsService.getProjects(req.user.id, query);
  }

  @Get(':id')
  getProject(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.getProject(req.user.id, id);
  }

  @Post()
  createProject(@Req() req: any, @Body() body: any) {
    return this.projectsService.createProject(req.user.id, body);
  }

  @Put(':id')
  updateProject(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.projectsService.updateProject(req.user.id, id, body);
  }

  @Delete(':id')
  deleteProject(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.deleteProject(req.user.id, id);
  }

  @Post(':id/members')
  inviteMember(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.projectsService.inviteMember(req.user.id, id, body);
  }

  @Delete(':id/members/:userId')
  removeMember(@Req() req: any, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projectsService.removeMember(req.user.id, id, userId);
  }

  @Get(':id/diagrams')
  getProjectDiagrams(@Req() req: any, @Param('id') id: string, @Query() query: any) {
    return this.projectsService.getProjectDiagrams(req.user.id, id, query);
  }

  @Post(':id/diagrams')
  createProjectDiagram(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.projectsService.createProjectDiagram(req.user.id, id, body);
  }
}
