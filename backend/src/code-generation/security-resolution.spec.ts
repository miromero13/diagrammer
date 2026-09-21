import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { adaptCaseFiveTemplate, resolveSecurityCase } from './security-resolution';
import { normalizeAndValidateUml, UmlAnalysis } from './uml-analysis';

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

  it('resolves case 5 from normalized 1..0 and 0..* multiplicities without AI', () => {
    const umlAnalysis = normalizeAndValidateUml({
      elements: [
        { id: 'principal', type: 'uml.Class', name: 'Account', attributes: ['email:String', 'password:String'] },
        { id: 'role', type: 'uml.Class', name: 'Role' },
        { id: 'permission', type: 'uml.Class', name: 'Permission' },
      ],
      connections: [
        { id: 'account-role', type: 'association', sourceId: 'principal', targetId: 'role', sourceMultiplicity: '1..0', targetMultiplicity: '0..*' },
        { id: 'role-permission', type: 'association', sourceId: 'role', targetId: 'permission', sourceMultiplicity: '0..*', targetMultiplicity: '0..*' },
      ],
    });

    expect(umlAnalysis.errors).toEqual([]);
    expect(umlAnalysis.connections.find((connection) => connection.id === 'account-role')).toMatchObject({
      source: { lower: 0, upper: 1 },
      target: { lower: 0, upper: null },
      sourceMultiplicity: '0..1',
      sourceMultiplicityOriginal: '1..0',
      targetMultiplicity: '0..*',
    });
    expect(resolveSecurityCase(umlAnalysis, { enabled: true, principalClassId: 'principal', roleClassId: 'role', permissionClassId: 'permission' }).case).toBe(5);
  });

  it('resolves case 5 when the principal-role multiplicity direction is reversed', () => {
    const principal = element('principal', 'Account'); const role = element('role', 'Role', []); const permission = element('permission', 'Permission', []);
    expect(resolveSecurityCase(analysis([principal, role, permission], [connection('principal', 'role', false, true), connection('role', 'permission', true, true)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role', permissionClassId: 'permission' }).case).toBe(5);
  });

  it('detects common login and credential names, then falls back to email and password', () => {
    const detected = resolveSecurityCase(analysis([element('principal', 'Account', ['usuario:String', 'contrasena:String'])]), { enabled: true, principalClassId: 'principal' });
    const fallback = resolveSecurityCase(analysis([element('principal', 'Account', ['telefono:String'])]), { enabled: true, principalClassId: 'principal' });
    const weakName = resolveSecurityCase(analysis([element('principal', 'Account', ['nombreCompleto:String'])]), { enabled: true, principalClassId: 'principal' });
    expect(detected).toMatchObject({ loginField: 'usuario', credentialField: 'contrasena' });
    expect(fallback).toMatchObject({ loginField: 'email', credentialField: 'password' });
    expect(weakName).toMatchObject({ loginField: 'nombreCompleto' });
  });

  it('rejects duplicated bootstrap names', () => {
    expect(() => resolveSecurityCase(analysis([]), { enabled: false, bootstrap: { roleNames: ['ADMIN', 'admin'] } })).toThrow('no puede repetir');
  });

  it('rejects invalid role-only principal-role topologies', () => {
    const principal = element('principal', 'Account'); const role = element('role', 'Role', []);
    const config = { enabled: true, principalClassId: 'principal', roleClassId: 'role' };
    expect(() => resolveSecurityCase(analysis([principal, role], [connection('principal', 'role', false, false)]), config)).toThrow('exactamente un extremo muchos');
    expect(() => resolveSecurityCase(analysis([principal, role], [connection('principal', 'role', true, true)]), config)).toThrow('seleccione una entidad de permisos');
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

  it('rewrites the generated login and credential fields when detected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-login-fields-'));
    await mkdir(join(root, 'src/main/java/demo/users/entity'), { recursive: true });
    await writeFile(join(root, 'src/main/java/demo/users/entity/UserEntity.java'), 'class UserEntity { String email; String password; }');
    await writeFile(join(root, 'README.md'), 'findByEmail(email) password PasswordEncoder');
    const principal = element('principal', 'Account', ['usuario:String', 'contrasena:String']); const role = element('role', 'Role', []); const permission = element('permission', 'Permission', []);
    const security = resolveSecurityCase(analysis([principal, role, permission], [connection('principal', 'role', true, false), connection('role', 'permission', true, true)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role', permissionClassId: 'permission' });

    await adaptCaseFiveTemplate(root, security);

    expect(await readFile(join(root, 'src/main/java/demo/accounts/entity/AccountEntity.java'), 'utf8')).toContain('String usuario; String contrasena;');
    expect(await readFile(join(root, 'README.md'), 'utf8')).toContain('findByUsuario(usuario) contrasena PasswordEncoder');
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

  it.each([2, 3] as const)('adapts case %i without role or permission layers', async (securityCase) => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-basic-'));
    const base = join(root, 'src/main/java/demo/users');
    await Promise.all(['entity', 'service', 'dto', 'repository', 'config', 'roles'].map((directory) => mkdir(join(base, directory), { recursive: true })));
    await writeFile(join(base, 'entity/UserEntity.java'), 'package demo.users.entity;\nimport jakarta.persistence.ManyToOne;\nimport jakarta.persistence.JoinColumn;\nclass UserEntity { @ManyToOne @JoinColumn(name = "role_id") public RoleEntity role; }');
    await writeFile(join(base, 'service/CustomUserDetailsService.java'), 'import java.util.Set;\nimport java.util.stream.Collectors;\nimport java.util.Collections;\nclass CustomUserDetailsService {\nSet<GrantedAuthority> authorities = user.role == null || user.role.permissions == null ? Collections.emptySet() : user.role.permissions.stream().map(permission -> new SimpleGrantedAuthority(permission.name)).collect(Collectors.toSet());\nreturn new org.springframework.security.core.userdetails.User(user.email, user.password, authorities); }');
    await writeFile(join(base, 'service/UserAuthService.java'), 'import backend.users.dto.RoleSessionDto;\nimport backend.users.dto.PermissionSessionDto;\nimport java.util.stream.Collectors;\nclass UserAuthService {\n        if (user.role != null) {\n            userSessionDto.role = roleSessionDto;\n        }\n\n        return userSessionDto;\n}');
    await writeFile(join(base, 'dto/UserSessionDto.java'), 'class UserSessionDto { public RoleSessionDto role;\n}');
    await writeFile(join(base, 'entity/RoleEntity.java'), 'class RoleEntity {}');
    await writeFile(join(base, 'repository/UserRepository.java'), 'interface UserRepository {}');
    await writeFile(join(root, 'build.gradle.kts'), 'implementation("org.springframework.boot:spring-boot-starter-aop")\ntestImplementation("org.springframework.security:spring-security-test")');
    await mkdir(join(root, 'src/main/resources'), { recursive: true });
    await writeFile(join(root, 'src/main/resources/application.properties'), '');
    const principal = element('principal', 'Account', securityCase === 3 ? ['email:String', 'password:String', 'role:String'] : undefined);
    const security = resolveSecurityCase(analysis([principal]), { enabled: true, principalClassId: 'principal' });

    await adaptCaseFiveTemplate(root, security);

    const entity = await readFile(join(root, 'src/main/java/demo/accounts/entity/AccountEntity.java'), 'utf8');
    expect(entity).not.toContain('RoleEntity');
    expect(await readFile(join(root, 'build.gradle.kts'), 'utf8')).not.toContain('aop');
    if (securityCase === 3) expect(entity).toContain('String role');
  });

  it('adapts case 4 with a role authority and no permission artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-role-'));
    const base = join(root, 'src/main/java/demo/users');
    await Promise.all(['entity', 'service', 'dto', 'repository', 'controller', 'config', 'common/annotation', 'common/aspect', 'common/constants'].map((directory) => mkdir(join(base, directory), { recursive: true })));
    await writeFile(join(base, 'entity/UserEntity.java'), 'package demo.users.entity; class UserEntity { RoleEntity role; }');
    await writeFile(join(base, 'entity/RoleEntity.java'), 'import jakarta.persistence.ManyToMany;\nimport jakarta.persistence.JoinTable;\nimport java.util.Set;\nimport java.util.HashSet;\nclass RoleEntity { @ManyToMany @JoinTable(name = "role_permissions") public Set<PermissionEntity> permissions = new HashSet<>(); }');
    await writeFile(join(base, 'entity/PermissionEntity.java'), 'class PermissionEntity {}');
    await writeFile(join(base, 'repository/UserRepository.java'), 'interface UserRepository {}');
    await writeFile(join(base, 'repository/RoleRepository.java'), 'interface RoleRepository {}');
    await writeFile(join(base, 'repository/PermissionRepository.java'), 'interface PermissionRepository {}');
    await writeFile(join(base, 'service/CustomUserDetailsService.java'), 'import java.util.Set;\nimport java.util.stream.Collectors;\nimport java.util.Collections;\nclass CustomUserDetailsService { Set<GrantedAuthority> authorities = user.role == null || user.role.permissions == null ? Collections.emptySet() : user.role.permissions.stream().map(permission -> new SimpleGrantedAuthority(permission.name)).collect(Collectors.toSet());\nreturn new org.springframework.security.core.userdetails.User(user.email, user.password, authorities); }');
    await writeFile(join(base, 'service/UserAuthService.java'), 'import backend.users.dto.PermissionSessionDto;\nimport java.util.stream.Collectors;\nclass UserAuthService { roleSessionDto.permissions = user.role.permissions == null ? java.util.List.of() : user.role.permissions.stream().map(permission -> new PermissionSessionDto()).collect(Collectors.toList()); }');
    await writeFile(join(base, 'service/RoleService.java'), 'import backend.users.entity.PermissionEntity;\nimport backend.users.repository.PermissionRepository;\nimport java.util.Set;\nclass RoleService { @Autowired private PermissionRepository permissionRepository;\n// Asociar los permisos usando UUID\nSet<PermissionEntity> permissions = new HashSet<>();\nrole.permissions = permissions; }');
    await writeFile(join(base, 'dto/RoleSessionDto.java'), 'import java.util.List;\nclass RoleSessionDto { public List<PermissionSessionDto> permissions; }');
    await writeFile(join(base, 'dto/PermissionSessionDto.java'), 'class PermissionSessionDto {}');
    await writeFile(join(base, 'controller/RoleController.java'), 'import backend.common.annotation.RequirePermission;\nimport backend.common.constants.PermissionConstants;\nclass RoleController {\n@RequirePermission(PermissionConstants.LISTAR_ROL)\nvoid list() {} }');
    await writeFile(join(base, 'common/annotation/RequirePermission.java'), 'class RequirePermission {}');
    await writeFile(join(base, 'common/aspect/PermissionCheckAspect.java'), 'class PermissionCheckAspect {}');
    await writeFile(join(base, 'common/constants/PermissionConstants.java'), 'class PermissionConstants {}');
    await writeFile(join(root, 'build.gradle.kts'), 'implementation("org.springframework.boot:spring-boot-starter-aop")\ntestImplementation("org.springframework.security:spring-security-test")');
    await mkdir(join(root, 'src/main/resources'), { recursive: true });
    await writeFile(join(root, 'src/main/resources/application.properties'), '');
    const principal = element('principal', 'Account'); const role = element('role', 'Profile', []);
    const security = resolveSecurityCase(analysis([principal, role], [connection('principal', 'role', true, false)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role', bootstrap: { roleNames: ['MEMBER'] } });

    await adaptCaseFiveTemplate(root, security);

    const javaRoot = join(root, 'src/main/java/demo/accounts');
    expect(security.case).toBe(4);
    expect(await readFile(join(javaRoot, 'service/CustomAccountDetailsService.java'), 'utf8')).toContain('new SimpleGrantedAuthority("ROLE_" + account.profile.name)');
    expect(await readFile(join(javaRoot, 'entity/ProfileEntity.java'), 'utf8')).not.toContain('Permission');
    expect(await readFile(join(javaRoot, 'service/AccountAuthService.java'), 'utf8')).not.toContain('Permission');
    await expect(readFile(join(javaRoot, 'entity/PermissionEntity.java'))).rejects.toThrow();
    expect(await readFile(join(root, 'build.gradle.kts'), 'utf8')).not.toContain('aop');
    const java = await Promise.all((await readdir(join(root, 'src/main/java'), { recursive: true })).filter((file) => file.endsWith('.java')).map((file) => readFile(join(root, 'src/main/java', file), 'utf8')));
    expect(java.join('\n')).not.toContain('Permission');
  });

  it('resolves case 4 when the principal-role multiplicity direction is reversed', () => {
    const principal = element('principal', 'Account'); const role = element('role', 'Role', []);
    expect(resolveSecurityCase(analysis([principal, role], [connection('principal', 'role', false, true)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role' }).case).toBe(4);
  });

  it('adapts case 6 to multiple role authorities', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-multi-role-'));
    const base = join(root, 'src/main/java/demo/users');
    await Promise.all(['entity', 'service', 'dto', 'repository'].map((directory) => mkdir(join(base, directory), { recursive: true })));
    await writeFile(join(base, 'entity/UserEntity.java'), 'package demo.users.entity;\nimport jakarta.persistence.ManyToOne;\nimport jakarta.persistence.JoinColumn;\nclass UserEntity { @ManyToOne @JoinColumn(name = "role_id") public RoleEntity role; }');
    await writeFile(join(base, 'entity/RoleEntity.java'), 'class RoleEntity { Set<PermissionEntity> permissions; }');
    await writeFile(join(base, 'entity/PermissionEntity.java'), 'class PermissionEntity {}');
    await writeFile(join(base, 'service/CustomUserDetailsService.java'), 'class CustomUserDetailsService { Set<GrantedAuthority> authorities = user.role == null ? Collections.emptySet() : user.role.permissions.stream().map(permission -> new SimpleGrantedAuthority(permission.name)).collect(Collectors.toSet());\nreturn new org.springframework.security.core.userdetails.User(user.email, user.password, authorities); }');
    await writeFile(join(base, 'service/UserAuthService.java'), 'class UserAuthService {\n        if (user.role != null) {\n            userSessionDto.role = roleSessionDto;\n        }\n\n        return userSessionDto;\n}');
    await writeFile(join(base, 'dto/UserSessionDto.java'), 'class UserSessionDto { public RoleSessionDto role; }');
    await writeFile(join(base, 'repository/UserRepository.java'), 'interface UserRepository {}');
    const principal = element('principal', 'Account'); const role = element('role', 'Profile', []); const permission = element('permission', 'Privilege', []);
    const security = resolveSecurityCase(analysis([principal, role, permission], [connection('principal', 'role', true, true), connection('role', 'permission', true, true)]), { enabled: true, principalClassId: 'principal', roleClassId: 'role', permissionClassId: 'permission' });

    await adaptCaseFiveTemplate(root, security);

    const javaRoot = join(root, 'src/main/java/demo/accounts');
    expect(security.case).toBe(6);
    expect(await readFile(join(javaRoot, 'entity/AccountEntity.java'), 'utf8')).toContain('ManyToMany');
    expect(await readFile(join(javaRoot, 'service/CustomAccountDetailsService.java'), 'utf8')).toContain('profiles.stream().flatMap');
    expect(await readFile(join(javaRoot, 'dto/AccountSessionDto.java'), 'utf8')).toContain('List<ProfileSessionDto> profiles');
  });

  it('adapts case 7 to direct permissions without roles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammer-security-direct-permission-'));
    const base = join(root, 'src/main/java/demo/users');
    await Promise.all(['entity', 'service', 'dto', 'repository'].map((directory) => mkdir(join(base, directory), { recursive: true })));
    await writeFile(join(base, 'entity/UserEntity.java'), 'package demo.users.entity;\nimport jakarta.persistence.ManyToOne;\nimport jakarta.persistence.JoinColumn;\nclass UserEntity { @ManyToOne @JoinColumn(name = "role_id") public RoleEntity role; }');
    await writeFile(join(base, 'entity/RoleEntity.java'), 'class RoleEntity {}');
    await writeFile(join(base, 'entity/PermissionEntity.java'), 'import java.util.Set; class PermissionEntity { Set<RoleEntity> roles; }');
    await writeFile(join(base, 'service/CustomUserDetailsService.java'), 'class CustomUserDetailsService { Set<GrantedAuthority> authorities = user.role == null ? Collections.emptySet() : user.role.permissions.stream().map(permission -> new SimpleGrantedAuthority(permission.name)).collect(Collectors.toSet());\nreturn new org.springframework.security.core.userdetails.User(user.email, user.password, authorities); }');
    await writeFile(join(base, 'service/UserAuthService.java'), 'class UserAuthService {\n        if (user.role != null) {\n            userSessionDto.role = roleSessionDto;\n        }\n\n        return userSessionDto;\n}');
    await writeFile(join(base, 'dto/UserSessionDto.java'), 'class UserSessionDto { public RoleSessionDto role; }');
    await writeFile(join(base, 'dto/PermissionSessionDto.java'), 'class PermissionSessionDto {}');
    await writeFile(join(base, 'repository/UserRepository.java'), 'interface UserRepository {}');
    const principal = element('principal', 'Account'); const permission = element('permission', 'Privilege', []);
    const security = resolveSecurityCase(analysis([principal, permission], [connection('principal', 'permission', true, true)]), { enabled: true, principalClassId: 'principal', permissionClassId: 'permission' });

    await adaptCaseFiveTemplate(root, security);

    const javaRoot = join(root, 'src/main/java/demo/accounts');
    expect(security.case).toBe(7);
    expect(await readFile(join(javaRoot, 'entity/AccountEntity.java'), 'utf8')).toContain('ManyToMany');
    expect(await readFile(join(javaRoot, 'entity/PrivilegeEntity.java'), 'utf8')).toContain('Set<AccountEntity> accounts');
    expect(await readFile(join(javaRoot, 'service/CustomAccountDetailsService.java'), 'utf8')).toContain('account.privileges.stream()');
    await expect(readFile(join(javaRoot, 'entity/RoleEntity.java'))).rejects.toThrow();
  });
});
