import { BadRequestException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, relative, sep } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { DiagramEntity } from '../diagrams/entities/diagram.entity';
import { GeneratedCodeEntity } from './entities/generated-code.entity';
import { GenerateCodeDto } from './dto/generate-code.dto';
import { normalizeAndValidateUml, renderUmlAnalysis } from './uml-analysis';
import { adaptCaseFiveTemplate, resolveSecurityCase } from './security-resolution';

const archiver: any = require('archiver');
const exec = promisify(execFile);
const TEMPLATE_ROOT = existsSync(join(__dirname, 'templates', 'backend'))
  ? join(__dirname, 'templates', 'backend')
  : join(process.cwd(), 'src', 'code-generation', 'templates', 'backend');
const PHASE_STEPS = [
  { id: 'PARSING_DIAGRAM', label: 'Diagrama analizado' },
  { id: 'VALIDATING_DIAGRAM', label: 'Validando diagrama' },
  { id: 'COPYING_TEMPLATE', label: 'Copiando plantilla' },
  { id: 'GENERATING_SECURITY', label: 'Generando autenticación y seguridad' },
  { id: 'COMPILING', label: 'Compilando con Gradle' },
  { id: 'PACKAGING_ZIP', label: 'Creando ZIP' },
];

const normalizeCompanySlug = (companyName: string) => {
  if (typeof companyName !== 'string') throw new BadRequestException('El nombre de la empresa es obligatorio');
  const slug = companyName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!slug || !/^[a-z][a-z0-9]*$/.test(slug)) throw new BadRequestException('El nombre de la empresa no produce un segmento válido para el paquete Java');
  return slug;
};

@Injectable()
export class CodeGenerationService implements OnModuleInit {
  constructor(
    @InjectRepository(GeneratedCodeEntity) private readonly generatedCodeRepository: Repository<GeneratedCodeEntity>,
    @InjectRepository(DiagramEntity) private readonly diagramRepository: Repository<DiagramEntity>,
  ) {}

  async onModuleInit() {
    const pending = await this.generatedCodeRepository.find({
      where: { status: In(['QUEUED', 'PARSING_DIAGRAM', 'VALIDATING_DIAGRAM', 'COPYING_TEMPLATE', 'GENERATING_SECURITY', 'COMPILING', 'PACKAGING_ZIP']) },
    });

    for (const generation of pending) {
      const companyName = generation.codeStructure?.companyName;
      if (typeof companyName !== 'string' || !companyName) {
        await this.generatedCodeRepository.update(generation.id, {
          status: 'FAILED',
          isValid: false,
           message: 'La generación no puede reanudarse porque falta el nombre de la empresa',
        });
        continue;
      }
      void this.runGeneration(generation.id, normalizeCompanySlug(companyName), generation.backendName, generation.codeStructure?.diagramSnapshot as Record<string, unknown>, generation.authentication);
    }
  }

  async generateBackend(userId: string, diagramId: string, body: GenerateCodeDto) {
    const companySlug = normalizeCompanySlug(body.companyName);
    const diagram = await this.diagramRepository.findOne({ where: { id: diagramId }, relations: { project: true } });
     if (!diagram) throw new NotFoundException('No se encontró el diagrama');
     if (diagram.project.ownerId !== userId) throw new UnauthorizedException('Solo el propietario del proyecto puede generar un backend');
     if (!diagram.content) throw new BadRequestException('El diagrama no tiene contenido');
    const diagramSnapshot = JSON.parse(JSON.stringify(diagram.content)) as Record<string, unknown>;

    const generation = await this.generatedCodeRepository.save(this.generatedCodeRepository.create({
      id: randomUUID(), diagramId, ownerId: userId, version: '1.0.0', language: 'spring-boot',
       backendName: body.backendName, authentication: body.authentication || { enabled: false },
       codeStructure: { projectName: body.backendName, companyName: body.companyName, diagramSnapshot }, files: {}, isValid: false,
      createdAt: new Date(),
       status: 'QUEUED', steps: PHASE_STEPS.map((step) => ({ ...step, status: 'PENDING' })), message: 'La generación está en espera',
    }));

    void this.runGeneration(generation.id, companySlug, body.backendName, diagramSnapshot, body.authentication || { enabled: false });
    return { success: true, generationId: generation.id, statusUrl: `/api/code-generation/${generation.id}` };
  }

  private async runGeneration(id: string, companySlug: string, backendName: string, diagramSnapshot: Record<string, unknown>, authentication: Record<string, unknown> = { enabled: false }) {
    const workRoot = join(tmpdir(), `diagrammer-generation-${id}`);
    try {
       await this.updateStep(id, 'PARSING_DIAGRAM', 'IN_PROGRESS', 'Analizando diagrama');
       const analysis = normalizeAndValidateUml(diagramSnapshot || {});
       await this.generatedCodeRepository.update(id, { codeStructure: { ...(await this.generatedCodeRepository.findOneBy({ id }))?.codeStructure, umlAnalysis: analysis } });
       await this.updateStep(id, 'PARSING_DIAGRAM', 'COMPLETED', 'Diagrama analizado');
       await this.updateStep(id, 'VALIDATING_DIAGRAM', 'IN_PROGRESS', 'Validando diagrama UML');
      const selectedIds = ['principalClassId', 'roleClassId', 'permissionClassId'];
      if (authentication.enabled === true) selectedIds.forEach((key) => {
        const value = authentication[key];
         if (value && !analysis.elements.some((element) => element.id === value)) analysis.errors.push(`La configuración de autenticación (${key}) no referencia una clase del diagrama: ${value}`);
      });
       await this.updateStep(id, 'VALIDATING_DIAGRAM', analysis.errors.length ? 'FAILED' : 'COMPLETED', analysis.errors.length ? 'La validación del UML falló' : 'UML validado correctamente');
      if (analysis.errors.length) throw new Error(analysis.errors.join('\n'));
       await this.updateStep(id, 'COPYING_TEMPLATE', 'IN_PROGRESS', 'Copiando plantilla');
      const projectRoot = await this.copyTemplate(workRoot, companySlug, backendName);
       await fs.writeFile(join(projectRoot, 'UML_ANALYSIS.md'), renderUmlAnalysis(analysis, authentication));
       await fs.writeFile(join(projectRoot, 'uml-analysis.json'), JSON.stringify(analysis, null, 2));
        await this.updateStep(id, 'COPYING_TEMPLATE', 'COMPLETED', 'Plantilla copiada');
        await this.updateStep(id, 'GENERATING_SECURITY', 'IN_PROGRESS', 'Generando autenticación y seguridad');
          await adaptCaseFiveTemplate(projectRoot, resolveSecurityCase(analysis, authentication));
        await this.updateStep(id, 'GENERATING_SECURITY', 'COMPLETED', 'Autenticación y seguridad adaptadas');
        await this.updateStep(id, 'COMPILING', 'IN_PROGRESS', 'Compilando con Gradle');
      await exec('./gradlew', ['compileJava', '--no-daemon'], { cwd: projectRoot, timeout: 300000 });
       await this.updateStep(id, 'COMPILING', 'COMPLETED', 'Plantilla compilada correctamente');
       await this.updateStep(id, 'PACKAGING_ZIP', 'IN_PROGRESS', 'Creando ZIP');
      const files = await this.readProjectFiles(projectRoot);
      const zipData = await this.createZip(backendName, files);
       await this.generatedCodeRepository.update(id, { files, zipData, isValid: true, status: 'COMPLETED', message: 'Backend generado correctamente' });
       await this.updateStep(id, 'PACKAGING_ZIP', 'COMPLETED', 'ZIP creado correctamente');
    } catch (error: any) {
      await this.generatedCodeRepository.update(id, {
        status: 'FAILED', isValid: false, zipData: null,
         compilationErrors: String(error?.stderr || error?.message || error), message: 'No se pudo generar el backend. Revisá los detalles para corregir el problema.',
        steps: (await this.generatedCodeRepository.findOneBy({ id }))?.steps?.map((step) => step.status === 'IN_PROGRESS' ? { ...step, status: 'FAILED' } : step) || [],
      });
    } finally {
      await fs.rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async updateStep(id: string, stepId: string, status: string, message: string) {
    const generation = await this.generatedCodeRepository.findOneBy({ id });
    if (!generation) return;
    await this.generatedCodeRepository.update(id, {
      status: status === 'IN_PROGRESS' ? stepId : status === 'FAILED' ? 'FAILED' : generation.status,
      message,
      steps: generation.steps.map((step) => step.id === stepId ? { ...step, status } : step),
    });
  }

  private async copyTemplate(workRoot: string, companySlug: string, backendName: string) {
    const packageName = `com.${companySlug}.${backendName}`;
    const packagePath = packageName.replace(/\./g, '/');
    const className = backendName.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('') + 'Application';
    const projectRoot = join(workRoot, backendName);
    const copy = async (source: string, destination: string) => {
      const entries = await fs.readdir(source, { withFileTypes: true });
      await fs.mkdir(destination, { recursive: true });
      for (const entry of entries) {
        if (entry.name === '.env' || entry.name === '.gradle' || entry.name === 'build' || /secret|password|credential/i.test(entry.name)) continue;
        const sourcePath = join(source, entry.name);
        let targetRelative = relative(TEMPLATE_ROOT, sourcePath);
        if (targetRelative.startsWith(`src${sep}main${sep}java${sep}backend`)) targetRelative = targetRelative.replace(`src${sep}main${sep}java${sep}backend`, `src${sep}main${sep}java${sep}${packagePath}`);
        if (entry.name === 'BackendApplication.java') targetRelative = join('src', 'main', 'java', packagePath, `${className}.java`);
        const targetPath = join(projectRoot, targetRelative);
        if (entry.isDirectory()) await copy(sourcePath, targetPath);
        else if (entry.name.endsWith('.env') || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) continue;
        else {
          const data = await fs.readFile(sourcePath);
          if (/\.(java|kt|kts|md|properties|yml|yaml|xml|json|txt)$/.test(entry.name)) {
            let text = data.toString().replace(/package backend(?=[.;])/g, `package ${packageName}`).replace(/import backend(?=[.;])/g, `import ${packageName}`);
            text = text.replace(/\bBackendApplication\b/g, className).replace(/\bbackend\b/g, backendName).replace(/com\.example\.[a-z0-9_]+/g, packageName);
            await fs.writeFile(targetPath, text);
          } else await fs.writeFile(targetPath, data);
          if (entry.name === 'gradlew') await fs.chmod(targetPath, 0o755);
        }
      }
    };
    await copy(TEMPLATE_ROOT, projectRoot);
    return projectRoot;
  }

  private async readProjectFiles(projectRoot: string) {
    const files: Record<string, string> = {};
    const walk = async (directory: string) => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path);
        else files[relative(projectRoot, path).split(sep).join('/')] = (await fs.readFile(path)).toString('base64');
      }
    };
    await walk(projectRoot);
    return files;
  }

  private createZip(projectName: string, files: Record<string, string>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('error', reject);
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      Object.entries(files).forEach(([path, content]) => archive.append(Buffer.from(content, 'base64'), { name: `${projectName}/${path}` }));
      archive.finalize().catch(reject);
    });
  }

  private async owned(id: string, userId: string) {
    const generation = await this.generatedCodeRepository.findOne({ where: { id, ownerId: userId }, relations: { diagram: true } });
     if (!generation) throw new NotFoundException('No se encontró el código generado');
    return generation;
  }

  async downloadProject(userId: string, id: string, reply: FastifyReply) {
    const generation = await this.owned(id, userId);
     if (generation.status !== 'COMPLETED' || !generation.zipData) throw new BadRequestException('El backend generado todavía no está listo para descargar');
    reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${generation.backendName}.zip"`);
    return reply.send(generation.zipData);
  }

  async getGeneratedCodeHistory(userId: string, diagramId: string) {
    return { success: true, history: await this.generatedCodeRepository.find({ where: { diagramId, ownerId: userId }, order: { createdAt: 'DESC' }, select: ['id', 'version', 'language', 'status', 'backendName', 'isValid', 'createdAt', 'codeStructure', 'steps', 'message'] }) };
  }

  async getGeneratedCodeDetails(userId: string, id: string) {
    const generation = await this.owned(id, userId);
    return { success: true, generatedCode: { id: generation.id, status: generation.status, backendName: generation.backendName, authentication: generation.authentication, steps: generation.steps, message: generation.message, isValid: generation.isValid, compilationErrors: generation.compilationErrors, createdAt: generation.createdAt, diagram: generation.diagram, fileList: Object.keys(generation.files || {}) } };
  }

  async deleteGeneratedCode(userId: string, id: string) { await this.owned(id, userId); await this.generatedCodeRepository.delete({ id }); return { success: true }; }

  async getGeneratedFile(userId: string, id: string, filePath: string, reply: FastifyReply) {
    const generation = await this.owned(id, userId);
    const path = decodeURIComponent(filePath);
    const content = generation.files?.[path];
     if (!content) throw new NotFoundException('No se encontró el archivo');
    reply.header('Content-Type', path.endsWith('.java') ? 'text/x-java-source' : 'text/plain');
    return Buffer.from(content, 'base64').toString();
  }
}
