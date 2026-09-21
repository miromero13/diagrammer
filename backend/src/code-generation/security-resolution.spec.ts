import { cp, mkdtemp, readFile, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { adaptCaseFiveTemplate, resolveSecurityCase } from './security-resolution';
import { UmlAnalysis } from './uml-analysis';

const principal = (attributes = ['email:String', 'passwordHash:String']) => ({
  id: 'account', name: 'Account', kind: 'class' as const, attributes, literals: [], persistible: true, metadata: {},
  structuredAttributes: attributes.map((attribute) => {
    const [canonicalName, sourceType] = attribute.split(':');
    return { name: canonicalName, sourceName: canonicalName, canonicalName, visibility: null, sourceType, javaType: 'String', multiplicity: { lower: null, upper: null } };
  }),
});

const analysis = (element = principal()) => ({
  elements: [element], connections: [], errors: [], warnings: [], structuredWarnings: [],
  normalizedModel: { elements: [element], relationships: [], excludedElements: [] },
  relationalModel: { inheritanceStrategy: 'joined', relationshipRule: '', tables: [], enums: [], relationships: [], excludedElements: [] },
}) as UmlAnalysis;

const config = {
  principalClassId: 'account', loginField: 'email', credentialField: 'passwordHash', testUserLogin: 'test@example.com', testUserPassword: 'safe-test-password',
};

describe('basic JWT security generation', () => {
  it('requires all selected authentication fields and verifies them on the principal', () => {
    expect(() => resolveSecurityCase(analysis(), {})).toThrow('principalClassId');
    expect(() => resolveSecurityCase(analysis(), { ...config, credentialField: '' })).toThrow('credentialField');
    expect(() => resolveSecurityCase(analysis(), { ...config, loginField: 'username' })).toThrow('no existe');
    expect(resolveSecurityCase(analysis(), config)).toMatchObject({ enabled: true, loginField: 'email', credentialField: 'passwordHash' });
  });

  it('adapts the real basic template with encoded test credentials and no authorization dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-basic-auth-'));
    await cp(join(__dirname, 'templates', 'backend'), root, { recursive: true });

    await adaptCaseFiveTemplate(root, resolveSecurityCase(analysis(), config));

    const javaRoot = join(root, 'src/main/java/backend/accounts');
    expect(await readdir(join(root, 'src/main/java/backend'))).toContain('accounts');
    const source = await readFile(join(javaRoot, 'service/AccountAuthService.java'), 'utf8');
    const initializer = await readFile(join(javaRoot, 'config/DataInitializer.java'), 'utf8');
    const generated = (await Promise.all((await readdir(join(root, 'src/main/java'), { recursive: true })).filter((file) => file.endsWith('.java')).map((file) => readFile(join(root, 'src/main/java', file), 'utf8')))).join('\n');
    expect(source).toContain('org.springframework.security.crypto.password.PasswordEncoder');
    expect(source).not.toContain('security.crypto.passwordHash');
    expect(generated).toContain('implements UserDetailsService');
    expect(generated).toContain('loadUserByUsername');
    expect(initializer).toContain('account.passwordHash = passwordEncoder.encode("safe-test-password")');
    expect(initializer).toContain('findByEmail("test@example.com")');
    expect(generated).toContain('java.util.Collections.emptyList()');
    expect(generated).not.toContain('account.password = passwordEncoder.encode(password)');
    expect(generated).not.toContain('user.role.permissions');
    expect(generated).not.toMatch(/Role|Permission|RequirePermission/);
    expect(await readFile(join(root, 'build.gradle.kts'), 'utf8')).not.toContain('aop');
  });
});
