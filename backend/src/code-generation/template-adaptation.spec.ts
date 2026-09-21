import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { CodeGenerationService } from './code-generation.service';
import { adaptCaseFiveTemplate, resolveSecurityCase } from './security-resolution';
import { adaptTemplateSource, relocateTemplateFeaturePath } from './template-adaptation';

describe('authentication template adaptation', () => {
  it('relocates feature files without flattening common infrastructure', () => {
    expect(relocateTemplateFeaturePath('src/main/java/backend/users/entity/UserEntity.java', 'com.example.generated')).toBe('src/main/java/com.example.generated/users/UserEntity.java');
    expect(relocateTemplateFeaturePath('src/main/java/backend/users/service', 'com.example.generated')).toBe('src/main/java/com.example.generated/users');
    expect(relocateTemplateFeaturePath('src/main/java/backend/common/entity/BaseEntity.java', 'com.example.generated')).toBe('src/main/java/backend/common/entity/BaseEntity.java');
  });

  it('writes direct feature package declarations and imports', () => {
    const source = adaptTemplateSource(
      'package backend.users.entity;\nimport backend.users.repository.UserRepository;\nimport backend.common.entity.BaseEntity;',
      'com.example.generated',
      'DemoApplication',
      'demo',
    );
    expect(source).toContain('package com.example.generated.users;');
    expect(source).toContain('import com.example.generated.users.UserRepository;');
    expect(source).toContain('import com.example.generated.common.entity.BaseEntity;');
    expect(source).not.toMatch(/users\.(?:entity|repository|service|controller|dto|filter|provider)/);
  });

  it('keeps the active copied and adapted template in one lowercase feature package', async () => {
    const workRoot = await mkdtemp(join(tmpdir(), 'diagrammer-template-layout-'));
    try {
      const service = new CodeGenerationService({} as any, {} as any);
      const projectRoot = await (service as any).copyTemplate(workRoot, 'acme', 'demo');
      const principal = {
        id: 'account',
        name: 'EmailNotificationService',
        kind: 'class',
        attributes: [],
        structuredAttributes: [
          { name: 'email', sourceName: 'email', canonicalName: 'email', sourceType: 'String', javaType: 'String', visibility: null, multiplicity: { lower: null, upper: null } },
          { name: 'passwordHash', sourceName: 'passwordHash', canonicalName: 'passwordHash', sourceType: 'String', javaType: 'String', visibility: null, multiplicity: { lower: null, upper: null } },
        ],
        methods: [],
        structuredMethods: [],
        literals: [],
      } as any;
      await adaptCaseFiveTemplate(projectRoot, resolveSecurityCase({ elements: [principal] } as any, {
        principalClassId: 'account',
        loginField: 'email',
        credentialField: 'passwordHash',
        testUserLogin: 'test@example.com',
        testUserPassword: 'safe-test-password',
      }));

      const javaRoot = join(projectRoot, 'src', 'main', 'java', 'com', 'acme', 'demo');
      const paths = await readdir(javaRoot, { recursive: true });
      expect(paths).toContain('emailnotificationservices/EmailNotificationServiceEntity.java');
      expect(paths).toContain('common/entity/BaseEntity.java');
      expect(paths).toContain('common/enums/GenderEnum.java');
      expect(paths).toContain('config/DataInitializer.java');
      expect(paths.filter((path) => path.startsWith('emailnotificationservices/')).some((path) => path.split('/').length > 2)).toBe(false);
      expect(paths).not.toEqual(expect.arrayContaining([expect.stringMatching(/^emailnotificationservices\/(?:entity|repository|service|controller|dto|filter|provider)\//)]));
      expect(await readFile(join(javaRoot, 'emailnotificationservices', 'EmailNotificationServiceEntity.java'), 'utf8')).toContain('package com.acme.demo.emailnotificationservices;');
    } finally {
      await rm(workRoot, { recursive: true, force: true });
    }
  });
});
