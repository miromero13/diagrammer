import { UmlAnalysis, UmlConnection, UmlElement } from './uml-analysis';
import { promises as fs } from 'fs';
import { dirname, join, relative, sep } from 'path';

export type AuthenticationConfig = {
  enabled?: boolean;
  principalClassId?: unknown;
  roleClassId?: unknown;
  permissionClassId?: unknown;
};

export type SecurityCase = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SecurityResolution = {
  case: SecurityCase;
  principal?: UmlElement;
  role?: UmlElement;
  permission?: UmlElement;
};

const plural = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}s`;
const camel = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}`;

const loginFields = new Set(['email', 'username', 'login', 'documentnumber']);
const credentialFields = new Set(['password', 'passwordhash', 'credential']);

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
  if (config.enabled !== true) return { case: 1 };

  const principal = selected(analysis, config.principalClassId, 'principalClassId', true)!;
  const role = selected(analysis, config.roleClassId, 'roleClassId');
  const permission = selected(analysis, config.permissionClassId, 'permissionClassId');
  if (new Set([principal, role, permission].filter(Boolean).map((element) => element!.id)).size !== [principal, role, permission].filter(Boolean).length) {
    throw new Error('Una misma clase no puede ser principal, rol y permiso a la vez');
  }
  if (principal.kind !== 'class') throw new Error('La entidad principal debe ser una clase concreta');
  if (role && role.kind !== 'class') throw new Error('La entidad de roles debe ser una clase concreta');
  if (permission && permission.kind !== 'class') throw new Error('La entidad de permisos debe ser una clase concreta');
  const fields = principal.structuredAttributes.map((attribute) => attribute.canonicalName.toLowerCase());
  if (!fields.some((field) => loginFields.has(field)) || !fields.some((field) => credentialFields.has(field))) {
    throw new Error(`La entidad seleccionada para iniciar sesión (${principal.name}) necesita un identificador y una credencial`);
  }
  if (!role && !permission) {
    return { case: fields.includes('role') ? 3 : 2, principal };
  }
  if (role && !permission) {
    const principalRole = relation(analysis, principal, role);
    if (!principalRole) throw new Error('La entidad principal y la entidad de roles deben estar relacionadas');
    if (hasMany(cardinality(principalRole, principal).right)) throw new Error('Los roles múltiples requieren una entidad de permisos');
    return { case: 4, principal, role };
  }
  if (!role && permission) {
    const principalPermission = relation(analysis, principal, permission);
    if (!principalPermission || !hasMany(cardinality(principalPermission, principal).left) || !hasMany(cardinality(principalPermission, principal).right)) {
      throw new Error('Los permisos directos requieren una relación muchos a muchos con la entidad principal');
    }
    return { case: 7, principal, permission };
  }

  const principalRole = relation(analysis, principal, role!);
  const rolePermission = relation(analysis, role!, permission!);
  if (!principalRole || !rolePermission) throw new Error('La configuración de roles y permisos no coincide con las relaciones UML');
  const principalRoleCardinality = cardinality(principalRole, principal);
  const rolePermissionCardinality = cardinality(rolePermission, role!);
  if (!hasMany(rolePermissionCardinality.left) || !hasMany(rolePermissionCardinality.right)) {
    throw new Error('Los roles y permisos requieren una relación muchos a muchos');
  }
  if (hasMany(principalRoleCardinality.left) && hasMany(principalRoleCardinality.right)) return { case: 6, principal, role, permission };
  if (hasMany(principalRoleCardinality.left) && !hasMany(principalRoleCardinality.right)) return { case: 5, principal, role, permission };
  throw new Error('La relación entre principal y rol debe ser muchos a uno o muchos a muchos');
}

export async function adaptCaseFiveTemplate(projectRoot: string, security: SecurityResolution) {
  if (security.case === 1) return removeAuthenticationTemplate(projectRoot);
  if (security.case !== 5 || !security.principal || !security.role || !security.permission) {
    throw new Error(`El modelo de seguridad resuelto es el Caso ${security.case}; la plantilla actual solo genera el Caso 5 de forma determinista`);
  }

  const replacements = [
    ['Users', `${security.principal.name}s`], ['users', plural(security.principal.name)], ['User', security.principal.name], ['user', camel(security.principal.name)],
    ['Roles', `${security.role.name}s`], ['roles', plural(security.role.name)], ['Role', security.role.name], ['role', camel(security.role.name)],
    ['Permissions', `${security.permission.name}s`], ['permissions', plural(security.permission.name)], ['Permission', security.permission.name], ['permission', camel(security.permission.name)],
  ] as const;
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
