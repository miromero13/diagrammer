import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { GeneratedCodeEntity } from './entities/generated-code.entity';
import { GenerateCodeDto } from './dto/generate-code.dto';
import { SpringBootGenerator } from './spring-boot-generator';

const archiver: any = require('archiver');

@Injectable()
export class CodeGenerationService {
  constructor(
    @InjectRepository(GeneratedCodeEntity)
    private readonly generatedCodeRepository: Repository<GeneratedCodeEntity>,
    @InjectRepository(DiagramEntity)
    private readonly diagramRepository: Repository<DiagramEntity>,
  ) {}

  async generateBackend(diagramId: string, body: GenerateCodeDto) {
    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId }, relations: { project: true } });
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    const content = diagram.content as any;
    const elements = content?.elements || content?.cells || [];
    const classElements = elements.filter((element: any) => element?.type && (element.type.includes('uml.Class') || element.type.includes('Class') || element.type === 'uml.Class'));

    if (classElements.length === 0) {
      throw new BadRequestException('El diagrama no contiene clases UML válidas');
    }

    const language = body.language || 'spring-boot';
    if (language !== 'spring-boot') {
      throw new BadRequestException('Lenguaje no soportado. Usa "spring-boot"');
    }

    if (!content) {
      throw new BadRequestException('El diagrama no tiene contenido');
    }

    const generator = new SpringBootGenerator({
      projectName: body.projectName || 'generated-project',
      packageName: body.packageName || 'com.example.generated',
      databaseConfig: body.databaseConfig || {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
    });

    const result = await generator.generateProject(content);

    const generatedCode = await this.generatedCodeRepository.save(
      this.generatedCodeRepository.create({
        id: randomUUID(),
        createdAt: new Date(),
        diagramId,
        version: '1.0.0',
        language,
        codeStructure: result.structure,
        files: result.files,
        isValid: true,
      }),
    );

    const generatedFiles = result.files as Record<string, string>;
    const fileCategories = {
      entities: Object.keys(generatedFiles).filter((f) => f.includes('/entity/')).length,
      repositories: Object.keys(generatedFiles).filter((f) => f.includes('/repository/')).length,
      services: Object.keys(generatedFiles).filter((f) => f.includes('/service/')).length,
      controllers: Object.keys(generatedFiles).filter((f) => f.includes('/controller/')).length,
      dtos: Object.keys(generatedFiles).filter((f) => f.includes('/dto/')).length,
      mappers: Object.keys(generatedFiles).filter((f) => f.includes('/mapper/')).length,
      config: Object.keys(generatedFiles).filter((f) => f.includes('/config/')).length,
      other: Object.keys(generatedFiles).filter((f) => !f.includes('/entity/') && !f.includes('/repository/') && !f.includes('/service/') && !f.includes('/controller/') && !f.includes('/dto/') && !f.includes('/mapper/') && !f.includes('/config/')).length,
    };

    return {
      success: true,
      generatedCodeId: generatedCode.id,
      structure: result.structure,
      fileCount: Object.keys(generatedFiles).length,
      fileCategories,
      classesFound: classElements.length,
      downloadUrl: `/api/code-generation/${generatedCode.id}/download`,
      message: `Código Spring Boot generado exitosamente para ${classElements.length} clases`,
    };
  }

  async downloadProject(generatedCodeId: string, reply: FastifyReply) {
    const generatedCode = await this.generatedCodeRepository.findOne({ where: { id: generatedCodeId }, relations: { diagram: true } });
    if (!generatedCode) {
      throw new NotFoundException('Código generado no encontrado');
    }

    const projectName = (generatedCode.codeStructure as any)?.projectName || 'generated-project';
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${projectName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    await new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      reply.raw.on('close', () => resolve());
      archive.pipe(reply.raw);
      Object.entries(generatedCode.files as Record<string, string>).forEach(([filePath, content]) => {
        archive.append(content, { name: filePath });
      });
      archive.finalize().catch(reject);
    });
  }

  async getGeneratedCodeHistory(diagramId: string) {
    const generatedCodes = await this.generatedCodeRepository.find({
      where: { diagramId },
      order: { createdAt: 'DESC' },
      select: ['id', 'version', 'language', 'isValid', 'createdAt', 'codeStructure'],
    });

    return { success: true, history: generatedCodes };
  }

  async getGeneratedCodeDetails(generatedCodeId: string) {
    const generatedCode = await this.generatedCodeRepository.findOne({ where: { id: generatedCodeId }, relations: { diagram: true } });
    if (!generatedCode) {
      throw new NotFoundException('Código generado no encontrado');
    }

    return {
      success: true,
      generatedCode: {
        id: generatedCode.id,
        version: generatedCode.version,
        language: generatedCode.language,
        structure: generatedCode.codeStructure,
        isValid: generatedCode.isValid,
        compilationErrors: generatedCode.compilationErrors,
        createdAt: generatedCode.createdAt,
        diagram: generatedCode.diagram,
        fileList: Object.keys(generatedCode.files as Record<string, string>),
      },
    };
  }

  async deleteGeneratedCode(generatedCodeId: string) {
    const deleted = await this.generatedCodeRepository.delete({ id: generatedCodeId });
    if (!deleted.affected) {
      throw new NotFoundException('Código generado no encontrado');
    }

    return { success: true, message: 'Código generado eliminado correctamente' };
  }

  async getGeneratedFile(generatedCodeId: string, filePath: string, reply: FastifyReply) {
    const generatedCode = await this.generatedCodeRepository.findOneBy({ id: generatedCodeId });
    if (!generatedCode) {
      throw new NotFoundException('Código generado no encontrado');
    }

    const decodedFilePath = decodeURIComponent(filePath);
    const fileContent = (generatedCode.files as Record<string, string>)[decodedFilePath];
    if (!fileContent) {
      throw new NotFoundException('Archivo no encontrado');
    }

    let contentType = 'text/plain';
    if (decodedFilePath.endsWith('.java')) contentType = 'text/x-java-source';
    else if (decodedFilePath.endsWith('.xml')) contentType = 'application/xml';
    else if (decodedFilePath.endsWith('.yml') || decodedFilePath.endsWith('.yaml')) contentType = 'text/yaml';

    reply.header('Content-Type', contentType);
    return fileContent;
  }
}
