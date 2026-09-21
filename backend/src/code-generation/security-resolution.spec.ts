import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'fs/promises';
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

  it('adapts the basic template with encoded test credentials and no authorization dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-basic-auth-'));
    const base = join(root, 'src/main/java/demo/users');
    await Promise.all(['entity', 'service', 'dto', 'repository', 'controller', 'common/annotation', 'common/aspect', 'common/constants'].map((directory) => mkdir(join(base, directory), { recursive: true })));
    await writeFile(join(base, 'entity/UserEntity.java'), 'package demo.users.entity;\nimport jakarta.persistence.JoinColumn;\nimport jakarta.persistence.ManyToOne;\nclass UserEntity { String email; String password; @ManyToOne @JoinColumn(name = "role_id") public RoleEntity role; }');
    await writeFile(join(base, 'repository/UserRepository.java'), 'package demo.users.repository;\nimport org.springframework.data.jpa.repository.EntityGraph;\ninterface UserRepository { @EntityGraph(attributePaths = {"role"}) java.util.Optional<UserEntity> findByEmail(String email); }');
    await writeFile(join(base, 'service/CustomUserDetailsService.java'), 'import org.springframework.security.core.userdetails.UserDetails;\nimport org.springframework.security.core.userdetails.UserDetailsService;\nimport org.springframework.security.core.userdetails.UsernameNotFoundException;\nclass CustomUserDetailsService implements UserDetailsService { public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException { Set<GrantedAuthority> authorities = user.role == null ? Collections.emptySet() : user.role.permissions.stream().map(permission -> new SimpleGrantedAuthority(permission.name)).collect(Collectors.toSet());\nreturn new org.springframework.security.core.userdetails.User(user.email, user.password, authorities); } }');
    await writeFile(join(base, 'service/UserAuthService.java'), 'import backend.users.dto.RoleSessionDto;\nimport backend.users.dto.PermissionSessionDto;\nimport org.springframework.security.crypto.password.PasswordEncoder;\nimport java.util.stream.Collectors;\nclass UserAuthService {\n        if (user.role != null) {\n            userSessionDto.role = roleSessionDto;\n        }\n\n        return userSessionDto;\n}');
    await writeFile(join(base, 'dto/UserSessionDto.java'), 'class UserSessionDto { public RoleSessionDto role; }');
    await Promise.all(['RoleEntity.java', 'PermissionEntity.java'].map((name) => writeFile(join(base, `entity/${name}`), `class ${name.slice(0, -5)} {}`)));
    await Promise.all(['RoleRepository.java', 'PermissionRepository.java'].map((name) => writeFile(join(base, `repository/${name}`), `interface ${name.slice(0, -5)} {}`)));
    await Promise.all(['RoleService.java', 'PermissionService.java'].map((name) => writeFile(join(base, `service/${name}`), `class ${name.slice(0, -5)} {}`)));
    await Promise.all(['RoleController.java', 'PermissionController.java', 'UserController.java'].map((name) => writeFile(join(base, `controller/${name}`), `class ${name.slice(0, -5)} {}`)));
    await Promise.all(['RoleSessionDto.java', 'PermissionSessionDto.java', 'CreateRoleDto.java', 'UpdateRoleDto.java', 'CreatePermissionDto.java', 'UpdatePermissionDto.java', 'CreateUserDto.java', 'UpdateUserDto.java'].map((name) => writeFile(join(base, `dto/${name}`), `class ${name.slice(0, -5)} {}`)));
    await writeFile(join(base, 'common/annotation/RequirePermission.java'), 'class RequirePermission {}');
    await writeFile(join(base, 'common/aspect/PermissionCheckAspect.java'), 'class PermissionCheckAspect {}');
    await writeFile(join(base, 'common/constants/PermissionConstants.java'), 'class PermissionConstants {}');
    await writeFile(join(root, 'build.gradle.kts'), 'implementation("org.springframework.boot:spring-boot-starter-aop")\ntestImplementation("org.springframework.security:spring-security-test")');

    await adaptCaseFiveTemplate(root, resolveSecurityCase(analysis(), config));

    const javaRoot = join(root, 'src/main/java/demo/accounts');
    const source = await readFile(join(javaRoot, 'service/AccountAuthService.java'), 'utf8');
    const initializer = await readFile(join(javaRoot, 'config/DataInitializer.java'), 'utf8');
    const generated = (await Promise.all((await readdir(join(root, 'src/main/java'), { recursive: true })).filter((file) => file.endsWith('.java')).map((file) => readFile(join(root, 'src/main/java', file), 'utf8')))).join('\n');
    expect(source).toContain('org.springframework.security.crypto.password.PasswordEncoder');
    expect(source).not.toContain('security.crypto.passwordHash');
    expect(generated).toContain('implements UserDetailsService');
    expect(generated).toContain('loadUserByUsername');
    expect(initializer).toContain('account.passwordHash = passwordEncoder.encode("safe-test-password")');
    expect(initializer).toContain('findByEmail("test@example.com")');
    expect(generated).not.toMatch(/Role|Permission|RequirePermission/);
    expect(await readFile(join(root, 'build.gradle.kts'), 'utf8')).not.toContain('aop');
  });
});
