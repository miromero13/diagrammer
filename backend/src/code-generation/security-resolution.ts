import { UmlAnalysis, UmlConnection, UmlElement } from './uml-analysis';
import { promises as fs } from 'fs';
import { dirname, join, relative, sep } from 'path';

export type AuthenticationConfig = {
  enabled?: boolean;
  principalClassId?: unknown;
  roleClassId?: unknown;
  permissionClassId?: unknown;
  bootstrap?: { roleNames?: unknown; permissionNames?: unknown };
};

export type SecurityCase = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SecurityResolution = {
  case: SecurityCase;
  principal?: UmlElement;
  role?: UmlElement;
  permission?: UmlElement;
  bootstrap: { roleNames: string[]; permissionNames: string[] };
  loginField?: string;
  credentialField?: string;
};

const plural = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}s`;
const camel = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}`;

const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const loginField = (principal: UmlElement) => {
  const attributes = principal.structuredAttributes;
  return attributes.find((attribute) => /^(?:email|mail|username|user|usuario|login|documentnumber|documento|dni|ci|cedula|legajo)$/.test(normalized(attribute.canonicalName)))?.canonicalName
    || attributes.find((attribute) => /(?:nombre|name|alias|codigo|code|identificador)/.test(normalized(attribute.canonicalName)))?.canonicalName
    || 'email';
};
const credentialField = (principal: UmlElement) => principal.structuredAttributes.find((attribute) => /(?:password|clave|contrasena|credential|secret|pin)/.test(normalized(attribute.canonicalName)))?.canonicalName || 'password';

const bootstrapNames = (value: unknown, label: string) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((name) => typeof name !== 'string' || !name.trim())) throw new Error(`${label} debe ser una lista de nombres no vacíos`);
  const names = value.map((name) => name.trim());
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error(`${label} no puede repetir nombres`);
  return names;
};

const selected = (analysis: UmlAnalysis, id: unknown, label: string, required = false) => {
  if (id == null || id === '') {
    if (required) throw new Error(`La configuración de autenticación requiere ${label}`);
    return undefined;
  }
  if (typeof id !== 'string') throw new Error(`La configuración de autenticación tiene un ${label} inválido`);
  const element = analysis.elements.find((candidate) => candidate.id === id);
  if (!element) throw new Error(`La configuración de autenticación (${label}) no referencia una clase del diagrama: ${id}`);
  return element;
};

const hasMany = (multiplicity: { upper: number | null }) => multiplicity.upper === null || multiplicity.upper > 1;

const relation = (analysis: UmlAnalysis, left: UmlElement, right: UmlElement): UmlConnection | undefined =>
  analysis.connections.find((connection) =>
    (connection.sourceId === left.id && connection.targetId === right.id) ||
    (connection.sourceId === right.id && connection.targetId === left.id),
  );

const cardinality = (connection: UmlConnection, left: UmlElement) =>
  connection.sourceId === left.id
    ? { left: connection.source, right: connection.target }
    : { left: connection.target, right: connection.source };

export function resolveSecurityCase(analysis: UmlAnalysis, config: AuthenticationConfig): SecurityResolution {
  const bootstrap = {
    roleNames: bootstrapNames(config.bootstrap?.roleNames, 'Los roles iniciales'),
    permissionNames: bootstrapNames(config.bootstrap?.permissionNames, 'Los permisos iniciales'),
  };
  if (config.enabled !== true) {
    if (bootstrap.roleNames.length || bootstrap.permissionNames.length) throw new Error('No se pueden definir roles o permisos sin autenticación');
    return { case: 1, bootstrap };
  }

  const principal = selected(analysis, config.principalClassId, 'principalClassId', true)!;
  const role = selected(analysis, config.roleClassId, 'roleClassId');
  const permission = selected(analysis, config.permissionClassId, 'permissionClassId');
  if (new Set([principal, role, permission].filter(Boolean).map((element) => element!.id)).size !== [principal, role, permission].filter(Boolean).length) {
    throw new Error('Una misma clase no puede ser principal, rol y permiso a la vez');
  }
  if (principal.kind !== 'class') throw new Error('La entidad principal debe ser una clase concreta');
  if (role && role.kind !== 'class') throw new Error('La entidad de roles debe ser una clase concreta');
  if (permission && permission.kind !== 'class') throw new Error('La entidad de permisos debe ser una clase concreta');
  const fields = principal.structuredAttributes.map((attribute) => normalized(attribute.canonicalName));
  const identity = { loginField: loginField(principal), credentialField: credentialField(principal) };
  if (!role && !permission) {
    if (bootstrap.roleNames.length || bootstrap.permissionNames.length) throw new Error('La configuración inicial no coincide con el modelo de autenticación');
    return { case: fields.includes('role') ? 3 : 2, principal, bootstrap, ...identity };
  }
  if (role && !permission) {
    const principalRole = relation(analysis, principal, role);
    if (!principalRole) throw new Error('La entidad principal y la entidad de roles deben estar relacionadas');
    if (hasMany(cardinality(principalRole, principal).right)) throw new Error('Los roles múltiples requieren una entidad de permisos');
    if (bootstrap.permissionNames.length) throw new Error('No se pueden definir permisos sin una entidad de permisos');
    return { case: 4, principal, role, bootstrap, ...identity };
  }
  if (!role && permission) {
    const principalPermission = relation(analysis, principal, permission);
    if (!principalPermission || !hasMany(cardinality(principalPermission, principal).left) || !hasMany(cardinality(principalPermission, principal).right)) {
      throw new Error('Los permisos directos requieren una relación muchos a muchos con la entidad principal');
    }
    if (bootstrap.roleNames.length) throw new Error('No se pueden definir roles sin una entidad de roles');
    return { case: 7, principal, permission, bootstrap, ...identity };
  }

  const principalRole = relation(analysis, principal, role!);
  const rolePermission = relation(analysis, role!, permission!);
  if (!principalRole || !rolePermission) throw new Error('La configuración de roles y permisos no coincide con las relaciones UML');
  const principalRoleCardinality = cardinality(principalRole, principal);
  const rolePermissionCardinality = cardinality(rolePermission, role!);
  if (!hasMany(rolePermissionCardinality.left) || !hasMany(rolePermissionCardinality.right)) {
    throw new Error('Los roles y permisos requieren una relación muchos a muchos');
  }
  if (hasMany(principalRoleCardinality.left) && hasMany(principalRoleCardinality.right)) return { case: 6, principal, role, permission, bootstrap, ...identity };
  if (hasMany(principalRoleCardinality.left) && !hasMany(principalRoleCardinality.right)) return { case: 5, principal, role, permission, bootstrap, ...identity };
  throw new Error('La relación entre principal y rol debe ser muchos a uno o muchos a muchos');
}

export async function adaptCaseFiveTemplate(projectRoot: string, security: SecurityResolution) {
  if (security.case === 1) return removeAuthenticationTemplate(projectRoot);
  if (!security.principal) throw new Error('La configuración de seguridad no tiene una entidad principal');
  if (![2, 3, 4, 5, 6, 7].includes(security.case)) throw new Error(`El modelo de seguridad resuelto es el Caso ${security.case}; su transformación determinista todavía no está implementada`);

  const replacements: Array<[string, string]> = [
    ['Users', `${security.principal.name}s`], ['users', plural(security.principal.name)], ['User', security.principal.name], ['user', camel(security.principal.name)],
  ];
  if (security.role) replacements.push(['Roles', `${security.role.name}s`], ['roles', plural(security.role.name)], ['Role', security.role.name], ['role', camel(security.role.name)]);
  if (security.permission) replacements.push(['Permissions', `${security.permission.name}s`], ['permissions', plural(security.permission.name)], ['Permission', security.permission.name], ['permission', camel(security.permission.name)]);
  await renameTemplateTerms(projectRoot, replacements);
  await adaptPrincipalCredentials(projectRoot, security);
  if (security.case === 2 || security.case === 3) await adaptBasicAuthentication(projectRoot, security);
  if (security.case === 4) await adaptRoleAuthentication(projectRoot, security);
  if (security.case === 6) await adaptMultipleRoleAuthentication(projectRoot, security);
  if (security.case === 7) await adaptDirectPermissionAuthentication(projectRoot, security);
}

async function adaptPrincipalCredentials(projectRoot: string, security: SecurityResolution) {
  const login = security.loginField || 'email';
  const credential = security.credentialField || 'password';
  if (login === 'email' && credential === 'password') return;
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:java|sql|properties|json|md|example)$/.test(entry.name)) files.push(path);
    }
  };
  await walk(projectRoot);
  for (const file of files) {
    let source = await fs.readFile(file, 'utf8');
    if (login !== 'email') {
      const capitalizedLogin = `${login.charAt(0).toUpperCase()}${login.slice(1)}`;
      source = source.replace(/import jakarta\.validation\.constraints\.Email;\n/g, '').replace(/\s*@Email\([^\n]+\)\n/g, '').split('findByEmail').join(`findBy${capitalizedLogin}`).replace(/\bemail\b/g, login);
    }
    if (credential !== 'password') source = source.replace(/\bpassword\b/g, credential);
    await fs.writeFile(file, source, 'utf8');
  }
}

async function renameTemplateTerms(projectRoot: string, replacements: ReadonlyArray<readonly [string, string]>) {
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:java|sql|properties|json|md|example)$/.test(entry.name)) files.push(path);
    }
  };
  await walk(projectRoot);
  for (const file of files) {
    let content = await fs.readFile(file, 'utf8');
    for (const [from, to] of replacements) content = content.split(from).join(to);
    await fs.writeFile(file, content, 'utf8');
  }
  for (const file of files.sort((a, b) => b.length - a.length)) {
    const path = relative(projectRoot, file).split(sep).join('/');
    let target = path;
    for (const [from, to] of replacements) target = target.split(from).join(to);
    if (target !== path) {
      const destination = join(projectRoot, target);
      await fs.mkdir(dirname(destination), { recursive: true });
      await fs.rename(file, destination);
    }
  }
}

async function adaptBasicAuthentication(projectRoot: string, security: SecurityResolution) {
  const principal = security.principal!;
  const packageRoot = join(projectRoot, 'src', 'main', 'java');
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path);
    }
  };
  await walk(packageRoot);
  const remove = files.filter((file) => /\/(?:Role|Permission)(?:Entity|Repository|Service|Controller|SessionDto|Constants|Dto)\.java$|\/(?:RequirePermission|PermissionCheckAspect)\.java$|\/DataInitializer\.java$/.test(file) || new RegExp(`\/(?:${principal.name}Service|${principal.name}Controller|Create${principal.name}Dto|Update${principal.name}Dto)\\.java$`).test(file));
  await Promise.all(remove.map((file) => fs.rm(file)));

  const principalEntity = files.find((file) => file.endsWith(`${principal.name}Entity.java`));
  const details = files.find((file) => file.endsWith(`Custom${principal.name}DetailsService.java`));
  const session = files.find((file) => file.endsWith(`${principal.name}SessionDto.java`));
  const auth = files.find((file) => file.endsWith(`${principal.name}AuthService.java`));
  const repository = files.find((file) => file.endsWith(`${principal.name}Repository.java`));
  if (!principalEntity || !details || !session || !auth || !repository) throw new Error('La plantilla no contiene las capas de autenticación esperadas');

  let entity = await fs.readFile(principalEntity, 'utf8');
  entity = entity.replace(/import jakarta\.persistence\.(?:JoinColumn|ManyToOne);\n/g, '').replace(/\s*@ManyToOne\s*@JoinColumn\([^\n]+\)\s*public \w+Entity \w+;\s*/g, '\n');
  if (security.case === 3) {
    const roleField = principal.structuredAttributes.find((attribute) => attribute.canonicalName.toLowerCase() === 'role');
    if (!roleField) throw new Error('El Caso 3 requiere un atributo role en la entidad principal');
    entity = entity.replace(/\n}\s*$/, `\n    @Column(nullable = false)\n    public String role;\n}\n`);
  }
  await fs.writeFile(principalEntity, entity, 'utf8');

  let repositorySource = await fs.readFile(repository, 'utf8');
  repositorySource = repositorySource.replace(/^import org\.springframework\.data\.jpa\.repository\.EntityGraph;\n/gm, '').replace(/^\s*@EntityGraph\([^\n]*\)\n/gm, '');
  await fs.writeFile(repository, repositorySource, 'utf8');

  let detailsSource = await fs.readFile(details, 'utf8');
  detailsSource = detailsSource.replace(/import java\.util\.Set;\nimport java\.util\.stream\.Collectors;\n/, '');
  detailsSource = detailsSource.replace(/Set<GrantedAuthority> authorities =[\s\S]*?return new org\.springframework\.security\.core\.userdetails\.User\((\w+)\.email, \1\.password, authorities\);/, security.case === 3
    ? 'return new org.springframework.security.core.userdetails.User($1.email, $1.password, java.util.List.of(new SimpleGrantedAuthority($1.role)));'
    : 'return new org.springframework.security.core.userdetails.User($1.email, $1.password, Collections.emptyList());');
  await fs.writeFile(details, detailsSource, 'utf8');

  let sessionSource = await fs.readFile(session, 'utf8');
  sessionSource = sessionSource.replace(/^.*RoleSessionDto role;\n/m, '');
  if (security.case === 3) sessionSource = sessionSource.replace(/\n}\s*$/, '\n    public String role;\n}\n');
  await fs.writeFile(session, sessionSource, 'utf8');

  let authSource = await fs.readFile(auth, 'utf8');
  authSource = authSource.replace(/^import .*?(?:RoleSessionDto|PermissionSessionDto);\n/gm, '').replace(/^import java\.util\.stream\.Collectors;\n/gm, '');
  authSource = authSource.replace(/\n        if \(\w+\.role != null\) \{[\s\S]*?\n        \}\n(?=\n        return)/, security.case === 3 ? '\n        userSessionDto.role = user.role;\n' : '\n');
  await fs.writeFile(auth, authSource, 'utf8');

  const entityPackage = (await fs.readFile(principalEntity, 'utf8')).match(/^package ([^;]+);/m)?.[1];
  if (!entityPackage) throw new Error('La entidad principal no declara un paquete Java');
  const basePackage = entityPackage.replace(/\.entity$/, '');
  const initializer = `package ${basePackage}.config;

import ${entityPackage}.${principal.name}Entity;
import ${basePackage}.repository.${principal.name}Repository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {
    private final ${principal.name}Repository repository;
    private final PasswordEncoder passwordEncoder;
    @Value("${'${INITIAL_ACCOUNT_EMAIL:}'}") private String email;
    @Value("${'${INITIAL_ACCOUNT_PASSWORD:}'}") private String password;
${security.case === 3 ? '    @Value("${INITIAL_ACCOUNT_ROLE:USER}") private String role;\n' : ''}
    public DataInitializer(${principal.name}Repository repository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }
    @Override public void run(String... args) {
        if (email.isBlank() || password.isBlank() || repository.findByEmail(email).isPresent()) return;
        ${principal.name}Entity account = new ${principal.name}Entity();
        account.name = "Initial account";
        account.email = email;
        account.password = passwordEncoder.encode(password);
${security.case === 3 ? '        account.role = role;\n' : ''}        repository.save(account);
    }
}

`;
  const initializerPath = join(projectRoot, 'src', 'main', 'java', ...basePackage.split('.'), 'config', 'DataInitializer.java');
  await fs.mkdir(dirname(initializerPath), { recursive: true });
  await fs.writeFile(initializerPath, initializer, 'utf8');
  const properties = join(projectRoot, 'src', 'main', 'resources', 'application.properties');
  await fs.appendFile(properties, '\n# Initial account (set these in .env before starting the application)\ninitial.account.email=${INITIAL_ACCOUNT_EMAIL:}\ninitial.account.password=${INITIAL_ACCOUNT_PASSWORD:}\n');

  const buildFile = join(projectRoot, 'build.gradle.kts');
  const build = await fs.readFile(buildFile, 'utf8');
  await fs.writeFile(buildFile, build.split('\n').filter((line) => !/spring-boot-starter-aop|spring-security-test/.test(line)).join('\n'), 'utf8');
}

async function adaptRoleAuthentication(projectRoot: string, security: SecurityResolution) {
  const principal = security.principal!;
  const role = security.role!;
  const packageRoot = join(projectRoot, 'src', 'main', 'java');
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.java')) files.push(path);
    }
  };
  await walk(packageRoot);
  await Promise.all(files.filter((file) => /\/(?:Permission(?:Entity|Repository|Service|Controller|SessionDto|Constants|Dto)|RequirePermission|PermissionCheckAspect)\.java$/.test(file)).map((file) => fs.rm(file)));

  const remaining = files.filter((file) => !/\/(?:Permission(?:Entity|Repository|Service|Controller|SessionDto|Constants|Dto)|RequirePermission|PermissionCheckAspect)\.java$/.test(file));
  for (const file of remaining) {
    let source = await fs.readFile(file, 'utf8');
    source = source
      .replace(/^import backend\.common\.annotation\.RequirePermission;\n|^import backend\.common\.constants\.PermissionConstants;\n/gm, '')
      .replace(/^\s*@RequirePermission\(PermissionConstants\.[^)]+\)\n/gm, '');
    if (file.endsWith(`${role.name}Entity.java`)) {
      source = source
        .replace(/^import jakarta\.persistence\.(?:FetchType|JoinColumn|JoinTable|ManyToMany);\n/gm, '')
        .replace(/^import java\.util\.(?:HashSet|Set);\n/gm, '')
        .replace(/\s*@ManyToMany[\s\S]*?public Set<\w+Entity> permissions = new HashSet<>\(\);\s*/g, '\n');
    }
    if (file.endsWith(`Create${role.name}Dto.java`) || file.endsWith(`Update${role.name}Dto.java`)) {
      source = source
        .replace(/^import java\.util\.(?:Set|UUID);\n/gm, '')
        .replace(/^import jakarta\.validation\.constraints\.NotNull;\n/gm, '')
        .replace(/\n\s*@NotNull\([^\n]+\)\n\s*public Set<UUID> permissionIds;\n|\n\s*public Set<UUID> permissionIds;\s*/g, '\n');
    }
    if (file.endsWith(`${role.name}Service.java`)) {
      source = source
        .replace(/^import .*Permission(?:Entity|Repository);\n|^import java\.util\.(?:HashSet|Set);\n/gm, '')
        .replace(/\s*@Autowired\s*private PermissionRepository permissionRepository;\s*/g, '\n')
        .replace(/\s*\/\/ Asociar los permisos usando UUID[\s\S]*?\w+\.permissions = permissions;\s*/g, '\n')
        .replace(/\s*if \(update\w+Dto\.permissionIds != null && !update\w+Dto\.permissionIds\.isEmpty\(\)\) \{[\s\S]*?\w+\.permissions = permissions;\s*\}/g, '');
    }
    if (file.endsWith(`${role.name}SessionDto.java`)) {
      source = source.replace(/^import java\.util\.List;\n/gm, '').replace(/\s*public List<PermissionSessionDto> permissions;\s*/g, '');
    }
    if (file.endsWith(`Custom${principal.name}DetailsService.java`)) {
      source = source
        .replace(/^import java\.util\.Set;\nimport java\.util\.stream\.Collectors;\n/gm, '')
        .replace(/org\.springframework\.security\.core\.accountdetails\.Account/g, 'org.springframework.security.core.userdetails.User')
        .replace(/implements AccountDetailsService/g, 'implements UserDetailsService')
        .replace(/public AccountDetails loadUserByUsername/g, 'public UserDetails loadUserByUsername')
        .replace(/Set<GrantedAuthority> authorities =[\s\S]*?return new [^(]+\((\w+)\.email, \1\.password, authorities\);/, 'return new org.springframework.security.core.userdetails.User($1.email, $1.password, $1.' + camel(role.name) + ' == null ? Collections.emptyList() : java.util.List.of(new SimpleGrantedAuthority("ROLE_" + $1.' + camel(role.name) + '.name)));');
    }
    if (file.endsWith(`${principal.name}AuthService.java`)) {
      source = source
        .replace(/^import .*PermissionSessionDto;\n|^import java\.util\.stream\.Collectors;\n/gm, '')
        .replace(/\s*\w+\.permissions = \w+\.\w+\.permissions == null \? java\.util\.List\.of\(\) : \w+\.\w+\.permissions\.stream\(\)[\s\S]*?\.collect\(Collectors\.toList\(\)\);/, '');
    }
    await fs.writeFile(file, source, 'utf8');
  }

  const principalEntity = remaining.find((file) => file.endsWith(`${principal.name}Entity.java`));
  if (!principalEntity) throw new Error('La plantilla no contiene la entidad principal esperada');
  const entityPackage = (await fs.readFile(principalEntity, 'utf8')).match(/^package ([^;]+);/m)?.[1];
  if (!entityPackage) throw new Error('La entidad principal no declara un paquete Java');
  const basePackage = entityPackage.replace(/\.entity$/, '');
  const roleNames = security.bootstrap.roleNames.map((name) => `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(', ');
  const defaultRole = security.bootstrap.roleNames[0] ?? '';
  const initializer = `package ${basePackage}.config;

import ${entityPackage}.${principal.name}Entity;
import ${basePackage}.entity.${role.name}Entity;
import ${basePackage}.repository.${principal.name}Repository;
import ${basePackage}.repository.${role.name}Repository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {
    private final ${principal.name}Repository repository;
    private final ${role.name}Repository roleRepository;
    private final PasswordEncoder passwordEncoder;
    @Value("${'${INITIAL_ACCOUNT_EMAIL:}'}") private String email;
    @Value("${'${INITIAL_ACCOUNT_PASSWORD:}'}") private String password;
    @Value("${'${INITIAL_ACCOUNT_ROLE:' + defaultRole + '}'}") private String role;

    public DataInitializer(${principal.name}Repository repository, ${role.name}Repository roleRepository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
    }
    @Override public void run(String... args) {
        for (String name : java.util.List.of(${roleNames})) {
            if (roleRepository.findByName(name).isEmpty()) {
                ${role.name}Entity item = new ${role.name}Entity();
                item.name = name;
                roleRepository.save(item);
            }
        }
        if (email.isBlank() || password.isBlank() || role.isBlank() || repository.findByEmail(email).isPresent()) return;
        ${principal.name}Entity account = new ${principal.name}Entity();
        account.name = "Initial account";
        account.email = email;
        account.password = passwordEncoder.encode(password);
        account.${camel(role.name)} = roleRepository.findByName(role).orElseThrow();
        repository.save(account);
    }
}
`;
  const initializerPath = join(projectRoot, 'src', 'main', 'java', ...basePackage.split('.'), 'config', 'DataInitializer.java');
  await fs.mkdir(dirname(initializerPath), { recursive: true });
  await fs.writeFile(initializerPath, initializer, 'utf8');
  const properties = join(projectRoot, 'src', 'main', 'resources', 'application.properties');
  await fs.appendFile(properties, '\n# Initial account (set these in .env before starting the application)\ninitial.account.email=${INITIAL_ACCOUNT_EMAIL:}\ninitial.account.password=${INITIAL_ACCOUNT_PASSWORD:}\ninitial.account.role=${INITIAL_ACCOUNT_ROLE:}\n');
  const buildFile = join(projectRoot, 'build.gradle.kts');
  const build = await fs.readFile(buildFile, 'utf8');
  await fs.writeFile(buildFile, build.split('\n').filter((line) => !/spring-boot-starter-aop|spring-security-test/.test(line)).join('\n'), 'utf8');
}

async function adaptMultipleRoleAuthentication(projectRoot: string, security: SecurityResolution) {
  const principal = security.principal!;
  const role = security.role!;
  const packageRoot = join(projectRoot, 'src', 'main', 'java');
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.java')) files.push(path);
    }
  };
  await walk(packageRoot);
  const removable = new Set([`${principal.name}Service.java`, `${principal.name}Controller.java`, `Create${principal.name}Dto.java`, `Update${principal.name}Dto.java`, `${role.name}Service.java`, `${role.name}Controller.java`]);
  const remove = files.filter((file) => removable.has(file.split(sep).pop()!));
  await Promise.all(remove.map((file) => fs.rm(file)));
  const remaining = files.filter((file) => !remove.includes(file));
  const principalEntity = remaining.find((file) => file.endsWith(`${principal.name}Entity.java`));
  const details = remaining.find((file) => file.endsWith(`Custom${principal.name}DetailsService.java`));
  const session = remaining.find((file) => file.endsWith(`${principal.name}SessionDto.java`));
  const auth = remaining.find((file) => file.endsWith(`${principal.name}AuthService.java`));
  if (!principalEntity || !details || !session || !auth) throw new Error('La plantilla no contiene las capas de autenticación esperadas');

  let entity = await fs.readFile(principalEntity, 'utf8');
  entity = entity.replace(/import jakarta\.persistence\.(?:JoinColumn|ManyToOne);\n/g, '').replace(/\s*@ManyToOne\s*@JoinColumn\([^\n]+\)\s*public \w+Entity \w+;\s*/g, `\n    @jakarta.persistence.ManyToMany\n    @jakarta.persistence.JoinTable(name = "${plural(principal.name)}_${plural(role.name)}", joinColumns = @jakarta.persistence.JoinColumn(name = "${camel(principal.name)}_id"), inverseJoinColumns = @jakarta.persistence.JoinColumn(name = "${camel(role.name)}_id"))\n    public java.util.Set<${role.name}Entity> ${plural(role.name)} = new java.util.HashSet<>();\n`);
  await fs.writeFile(principalEntity, entity, 'utf8');

  let detailsSource = await fs.readFile(details, 'utf8');
  const pluralRole = plural(role.name);
  const pluralPermission = security.permission ? plural(security.permission.name) : 'permissions';
  detailsSource = detailsSource
    .split(`.${camel(role.name)}`).join(`.${pluralRole}`)
    .split(`.${pluralRole}.${pluralPermission}.stream()`).join(`.${pluralRole}.stream().flatMap(role -> role.${pluralPermission}.stream())`);
  await fs.writeFile(details, detailsSource, 'utf8');

  let sessionSource = await fs.readFile(session, 'utf8');
  sessionSource = sessionSource.split(`public ${role.name}SessionDto ${camel(role.name)};`).join(`public java.util.List<${role.name}SessionDto> ${plural(role.name)};`);
  await fs.writeFile(session, sessionSource, 'utf8');

  let authSource = await fs.readFile(auth, 'utf8');
  authSource = authSource.replace(/\n        if \(\w+\.role != null\) \{[\s\S]*?\n        \}\n(?=\n        return)/, `\n        userSessionDto.${plural(role.name)} = user.${plural(role.name)}.stream().map(role -> {\n            RoleSessionDto item = new RoleSessionDto();\n            item.id = role.getId();\n            item.name = role.name;\n            item.permissions = role.permissions.stream().map(permission -> {\n                PermissionSessionDto permissionItem = new PermissionSessionDto();\n                permissionItem.id = permission.getId();\n                permissionItem.name = permission.name;\n                permissionItem.description = permission.description;\n                return permissionItem;\n            }).toList();\n            return item;\n        }).toList();\n`);
  await fs.writeFile(auth, authSource, 'utf8');
}

async function adaptDirectPermissionAuthentication(projectRoot: string, security: SecurityResolution) {
  const principal = security.principal!;
  const permission = security.permission!;
  const packageRoot = join(projectRoot, 'src', 'main', 'java');
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.java')) files.push(path);
    }
  };
  await walk(packageRoot);
  const removeNames = new Set(['RoleEntity.java', 'RoleRepository.java', 'RoleService.java', 'RoleController.java', 'CreateRoleDto.java', 'UpdateRoleDto.java', 'RoleSessionDto.java', 'RoleConstants.java', 'DataInitializer.java', `${principal.name}Service.java`, `${principal.name}Controller.java`, `Create${principal.name}Dto.java`, `Update${principal.name}Dto.java`]);
  const removed = files.filter((file) => removeNames.has(file.split(sep).pop()!));
  await Promise.all(removed.map((file) => fs.rm(file)));
  const remaining = files.filter((file) => !removed.includes(file));
  const principalEntity = remaining.find((file) => file.endsWith(`${principal.name}Entity.java`));
  const permissionEntity = remaining.find((file) => file.endsWith(`${permission.name}Entity.java`));
  const details = remaining.find((file) => file.endsWith(`Custom${principal.name}DetailsService.java`));
  const session = remaining.find((file) => file.endsWith(`${principal.name}SessionDto.java`));
  const auth = remaining.find((file) => file.endsWith(`${principal.name}AuthService.java`));
  if (!principalEntity || !permissionEntity || !details || !session || !auth) throw new Error('La plantilla no contiene las capas de permisos esperadas');

  let principalSource = await fs.readFile(principalEntity, 'utf8');
  principalSource = principalSource.replace(/import jakarta\.persistence\.(?:JoinColumn|ManyToOne);\n/g, '').replace(/\s*@ManyToOne\s*@JoinColumn\([^\n]+\)\s*public \w+Entity \w+;\s*/g, `\n    @jakarta.persistence.ManyToMany\n    @jakarta.persistence.JoinTable(name = "${plural(principal.name)}_${plural(permission.name)}", joinColumns = @jakarta.persistence.JoinColumn(name = "${camel(principal.name)}_id"), inverseJoinColumns = @jakarta.persistence.JoinColumn(name = "${camel(permission.name)}_id"))\n    public java.util.Set<${permission.name}Entity> ${plural(permission.name)} = new java.util.HashSet<>();\n`);
  await fs.writeFile(principalEntity, principalSource, 'utf8');

  let permissionSource = await fs.readFile(permissionEntity, 'utf8');
  permissionSource = permissionSource.replace(new RegExp(`Set<${permission.name}Entity> ${plural(permission.name)}`), `Set<${principal.name}Entity> ${plural(principal.name)}`).split('RoleEntity').join(`${principal.name}Entity`).split('roles').join(plural(principal.name));
  await fs.writeFile(permissionEntity, permissionSource, 'utf8');

  let detailsSource = await fs.readFile(details, 'utf8');
  detailsSource = detailsSource.replace(/(\w+)\.role == null \? Collections\.emptySet\(\) : \1\.role\.\w+\.stream\(\)/, `$1.${plural(permission.name)}.stream()`);
  await fs.writeFile(details, detailsSource, 'utf8');

  let sessionSource = await fs.readFile(session, 'utf8');
  sessionSource = sessionSource.replace(/^.*RoleSessionDto role;\n/m, `    public java.util.List<${permission.name}SessionDto> ${plural(permission.name)};\n`);
  await fs.writeFile(session, sessionSource, 'utf8');

  let authSource = await fs.readFile(auth, 'utf8');
  authSource = authSource.replace(/^import .*?RoleSessionDto;\n/gm, '').replace(/\n        if \(\w+\.role != null\) \{[\s\S]*?\n        \}\n(?=\n        return)/, `\n        userSessionDto.${plural(permission.name)} = user.${plural(permission.name)}.stream().map(permission -> {\n            ${permission.name}SessionDto item = new ${permission.name}SessionDto();\n            item.id = permission.getId();\n            item.name = permission.name;\n            item.description = permission.description;\n            return item;\n        }).toList();\n`);
  await fs.writeFile(auth, authSource, 'utf8');
}

async function removeAuthenticationTemplate(projectRoot: string) {
  const paths: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else paths.push(path);
    }
  };
  await walk(join(projectRoot, 'src', 'main'));
  await Promise.all(paths.filter((file) => /\/(?:users\/.+|config\/(?:SecurityConfig|DataInitializer)\.java|common\/(?:annotation\/RequirePermission|aspect\/PermissionCheckAspect|constants\/(?:RoleConstants|PermissionConstants))\.java|resources\/db\/migration\/V1__identity_and_access\.sql)$/.test(file)).map((file) => fs.rm(file)));
  const buildFile = join(projectRoot, 'build.gradle.kts');
  const build = await fs.readFile(buildFile, 'utf8');
  await fs.writeFile(buildFile, build.split('\n').filter((line) => !/spring-boot-starter-(?:aop|security)|jjwt-|spring-security-test/.test(line)).join('\n'), 'utf8');
  const properties = join(projectRoot, 'src/main/resources/application.properties');
  const content = await fs.readFile(properties, 'utf8');
  await fs.writeFile(properties, content.split('\n').filter((line) => !/^(?:jwt\.|superadmin\.)/.test(line) && !/^(?:# Configuracion de la autenticacion JWT|# Superadmin credentials)$/.test(line)).join('\n'), 'utf8');
  const swagger = paths.find((file) => file.endsWith(`${sep}config${sep}SwaggerConfig.java`));
  if (swagger && await fs.stat(swagger).then(() => true).catch(() => false)) {
    const packageName = (await fs.readFile(swagger, 'utf8')).match(/^package ([^;]+);/m)?.[1];
    if (packageName) await fs.writeFile(swagger, `package ${packageName};\n\nimport io.swagger.v3.oas.models.OpenAPI;\nimport io.swagger.v3.oas.models.info.Info;\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\n\n@Configuration\npublic class SwaggerConfig {\n    @Bean\n    public OpenAPI customOpenAPI() {\n        return new OpenAPI().info(new Info().title("API").version("0.1.0"));\n    }\n}\n`, 'utf8');
  }
}
