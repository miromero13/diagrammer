import { mkdtemp, mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { adaptCaseFiveTemplate, resolveSecurityCase } from './security-resolution';
import { UmlAnalysis } from './uml-analysis';

const element = (id: string, name: string, attributes = ['email:String', 'password:String']) => ({
  id, name, kind: 'class' as const, attributes, literals: [], persistible: true, metadata: {},
  structuredAttributes: attributes.map((value) => {
    const [sourceName, sourceType] = value.split(':');
    return { name: sourceName, sourceName, canonicalName: sourceName, visibility: null, sourceType, javaType: 'String', multiplicity: { lower: null, upper: null } };
  }),
});

const analysis = (elements: any[], connections: any[] = []) => ({ elements, connections, errors: [], warnings: [], structuredWarnings: [], normalizedModel: { elements, relationships: connections, excludedElements: [] }, relationalModel: { inheritanceStrategy: 'joined', relationshipRule: '', tables: [], enums: [], relationships: [], excludedElements: [] } }) as UmlAnalysis;
const connection = (sourceId: string, targetId: string, sourceMany: boolean, targetMany: boolean) => ({ id: `${sourceId}-${targetId}`, type: 'association', sourceId, targetId, sourceName: sourceId, targetName: targetId, sourceMultiplicity: sourceMany ? '*' : '1', targetMultiplicity: targetMany ? '*' : '1', source: { lower: sourceMany ? 0 : 1, upper: sourceMany ? null : 1 }, target: { lower: targetMany ? 0 : 1, upper: targetMany ? null : 1 } });

describe('resolveSecurityCase', () => {
  it('resolves the template topology as case 5', () => {
    const principal = element('principal', 'Account'); const role = element('role', 'Role', []); const permission = element('permission', 'Permission', []);
    expect(resolveSecurityCase(analysis([principal, role, permission], [connection('principal', 'role', true, false), connection('role', 'permission', true, true)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role', permissionClassId: 'permission' }).case).toBe(5);
  });

  it('rejects an authenticated principal without login credentials', () => {
    expect(() => resolveSecurityCase(analysis([element('principal', 'Account', ['name:String'])]), { enabled: true, principalClassId: 'principal' })).toThrow('identificador y una credencial');
  });

  it('renames the case 5 template consistently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-template-'));
    await mkdir(join(root, 'src/main/java/demo/users/entity'), { recursive: true });
    await writeFile(join(root, 'src/main/java/demo/users/entity/UserEntity.java'), 'class UserEntity { RoleEntity role; PermissionEntity permission; }');
    const principal = element('principal', 'Account'); const role = element('role', 'Profile', []); const permission = element('permission', 'Privilege', []);
    const security = resolveSecurityCase(analysis([principal, role, permission], [connection('principal', 'role', true, false), connection('role', 'permission', true, true)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role', permissionClassId: 'permission' });

    await adaptCaseFiveTemplate(root, security);

    expect(await readFile(join(root, 'src/main/java/demo/accounts/entity/AccountEntity.java'), 'utf8')).toContain('ProfileEntity profile; PrivilegeEntity privilege;');
  });

  it('removes authentication source files when it is disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-disabled-'));
    await mkdir(join(root, 'src/main/java/demo/users/entity'), { recursive: true });
    await mkdir(join(root, 'src/main/java/demo/config'), { recursive: true });
    await writeFile(join(root, 'src/main/java/demo/users/entity/UserEntity.java'), 'class UserEntity {}');
    await writeFile(join(root, 'src/main/java/demo/config/SecurityConfig.java'), 'class SecurityConfig {}');
    await writeFile(join(root, 'build.gradle.kts'), 'implementation("org.springframework.boot:spring-boot-starter-security")');
    await mkdir(join(root, 'src/main/resources'), { recursive: true });
    await writeFile(join(root, 'src/main/resources/application.properties'), 'jwt.secret=x\nsuperadmin.email=x');

    await adaptCaseFiveTemplate(root, resolveSecurityCase(analysis([]), { enabled: false }));

    await expect(readFile(join(root, 'src/main/java/demo/users/entity/UserEntity.java'))).rejects.toThrow();
    await expect(readFile(join(root, 'src/main/java/demo/config/SecurityConfig.java'))).rejects.toThrow();
  });
});
