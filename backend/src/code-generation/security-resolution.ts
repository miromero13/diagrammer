import { promises as fs } from 'fs';
import { dirname, join, relative, sep } from 'path';

import { UmlAnalysis, UmlElement } from './uml-analysis';

export type AuthenticationConfig = {
  enabled?: boolean;
  principalClassId?: unknown;
  loginField?: unknown;
  credentialField?: unknown;
  testUserLogin?: unknown;
  testUserPassword?: unknown;
};

export type SecurityResolution = {
  enabled: boolean;
  principal?: UmlElement;
  loginField?: string;
  credentialField?: string;
  testUserLogin?: string;
  testUserPassword?: string;
};

const selected = (analysis: UmlAnalysis, id: unknown) => {
  if (typeof id !== 'string' || !id) throw new Error('La configuración de autenticación requiere principalClassId');
  const principal = analysis.elements.find((element) => element.id === id);
  if (!principal) throw new Error(`La configuración de autenticación (principalClassId) no referencia una clase del diagrama: ${id}`);
  if (principal.kind !== 'class') throw new Error('La entidad principal debe ser una clase concreta');
  return principal;
};

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`La configuración de autenticación requiere ${label}`);
  return value.trim();
};

export function resolveSecurityCase(analysis: UmlAnalysis, config: AuthenticationConfig): SecurityResolution {
  if (config.enabled === false) return { enabled: false };
  const principal = selected(analysis, config.principalClassId);
  const loginField = requiredString(config.loginField, 'loginField');
  const credentialField = requiredString(config.credentialField, 'credentialField');
  const fields = new Set(principal.structuredAttributes.map((attribute) => attribute.canonicalName));
  if (!fields.has(loginField)) throw new Error(`El atributo de inicio de sesión (${loginField}) no existe en la entidad principal`);
  if (!fields.has(credentialField)) throw new Error(`El atributo de credencial (${credentialField}) no existe en la entidad principal`);
  if (loginField === credentialField) throw new Error('El atributo de inicio de sesión y el de credencial deben ser distintos');
  return {
    enabled: true,
    principal,
    loginField,
    credentialField,
    testUserLogin: requiredString(config.testUserLogin, 'testUserLogin'),
    testUserPassword: requiredString(config.testUserPassword, 'testUserPassword'),
  };
}

export async function adaptCaseFiveTemplate(projectRoot: string, security: SecurityResolution) {
  if (!security.enabled) return removeAuthenticationTemplate(projectRoot);
  if (!security.principal || !security.loginField || !security.credentialField || security.testUserLogin == null || security.testUserPassword == null) {
    throw new Error('La configuración de seguridad no tiene los campos básicos requeridos');
  }

  await renameTemplateTerms(projectRoot, [
    ['Users', `${security.principal.name}s`], ['users', plural(security.principal.name)],
    ['User', security.principal.name], ['user', camel(security.principal.name)],
  ]);
  await adaptBasicAuthentication(projectRoot, security);
}

const plural = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}s`;
const camel = (name: string) => `${name.charAt(0).toLowerCase()}${name.slice(1)}`;

async function filesUnder(directory: string, predicate: (name: string) => boolean = () => true) {
  const files: string[] = [];
  const walk = async (path: string) => {
    for (const entry of await fs.readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (predicate(entry.name)) files.push(target);
    }
  };
  await walk(directory);
  return files;
}

async function renameTemplateTerms(projectRoot: string, replacements: ReadonlyArray<readonly [string, string]>) {
  const files = await filesUnder(projectRoot, (name) => /\.(?:java|sql|properties|json|md|example)$/.test(name));
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
  const files = await filesUnder(packageRoot, (name) => name.endsWith('.java'));
  const remove = /\/(?:[^/]*(?:Role|Permission)[^/]*|RequirePermission|PermissionCheckAspect|DataInitializer)\.java$/;
  const principalCrud = new RegExp(`\/(?:${principal.name}Service|${principal.name}Controller|Create${principal.name}Dto|Update${principal.name}Dto)\\.java$`);
  await Promise.all(files.filter((file) => remove.test(file) || principalCrud.test(file)).map((file) => fs.rm(file)));

  const remaining = files.filter((file) => !remove.test(file) && !principalCrud.test(file));
  const entity = remaining.find((file) => file.endsWith(`${principal.name}Entity.java`));
  const details = remaining.find((file) => file.endsWith(`Custom${principal.name}DetailsService.java`));
  const session = remaining.find((file) => file.endsWith(`${principal.name}SessionDto.java`));
  const auth = remaining.find((file) => file.endsWith(`${principal.name}AuthService.java`));
  const repository = remaining.find((file) => file.endsWith(`${principal.name}Repository.java`));
  if (!entity || !details || !session || !auth || !repository) throw new Error('La plantilla no contiene las capas de autenticación esperadas');

  for (const file of remaining) {
    let source = await fs.readFile(file, 'utf8');
    source = source
      .replace(/^import jakarta\.validation\.constraints\.Email;\n/gm, '')
      .replace(/^\s*@Email\([^\n]+\)\n/gm, '')
      .replace(/\bfindByEmail\b/g, `findBy${capitalize(security.loginField!)}`)
      .replace(/\bemail\b/g, security.loginField!)
      .replace(/(?<!org\.springframework\.security\.crypto\.)\bpassword\b/g, security.credentialField!)
      .replace(/org\.springframework\.security\.core\.accountdetails\.Account/g, 'org.springframework.security.core.userdetails.User')
      .replace(/org\.springframework\.security\.core\.accountdetails\.AccountDetailsService/g, 'org.springframework.security.core.userdetails.UserDetailsService')
      .replace(/\bAccountDetailsService\b/g, 'UserDetailsService')
      .replace(/\bAccountDetails\b/g, 'UserDetails')
      .replace(/Accountname/g, 'Username')
      .replace(/loadAccountByUsername/g, 'loadUserByUsername')
      .replace(/^import backend\.common\.annotation\.RequirePermission;\n|^import backend\.common\.constants\.(?:Permission|Role)Constants;\n/gm, '')
      .replace(/^\s*@RequirePermission\([^\n]+\)\n/gm, '');
    await fs.writeFile(file, source, 'utf8');
  }

  let entitySource = await fs.readFile(entity, 'utf8');
  entitySource = entitySource
    .replace(/^import jakarta\.persistence\.(?:JoinColumn|ManyToOne);\n/gm, '')
    .replace(/\s*@ManyToOne\s*@JoinColumn\([^\n]+\)\s*public \w+Entity \w+;\s*/g, '\n');
  await fs.writeFile(entity, entitySource, 'utf8');

  let repositorySource = await fs.readFile(repository, 'utf8');
  repositorySource = repositorySource
    .replace(/^import org\.springframework\.data\.jpa\.repository\.EntityGraph;\n/gm, '')
    .replace(/^\s*@EntityGraph\([^\n]*\)\n/gm, '')
    .replace(/^\s*@Override\n\s*List<[^>]+> findAll\(\);\n/gm, '');
  await fs.writeFile(repository, repositorySource, 'utf8');

  let detailsSource = await fs.readFile(details, 'utf8');
  detailsSource = detailsSource
    .replace(/^import java\.util\.(?:Set|Collections);\n|^import java\.util\.stream\.Collectors;\n|^import org\.springframework\.security\.core\.(?:GrantedAuthority|authority\.SimpleGrantedAuthority);\n/gm, '')
    .replace(/\s*Set<GrantedAuthority> authorities =[\s\S]*?\n\s*return new org\.springframework\.security\.core\.userdetails\.User\((\w+)\.(\w+), \1\.(\w+), authorities\);/, '        return new org.springframework.security.core.userdetails.User($1.$2, $1.$3, java.util.Collections.emptyList());');
  await fs.writeFile(details, detailsSource, 'utf8');

  let sessionSource = await fs.readFile(session, 'utf8');
  const sessionPackage = sessionSource.match(/^package ([^;]+);/m)?.[1];
  if (!sessionPackage) throw new Error('La sesión principal no declara un paquete Java');
  sessionSource = `package ${sessionPackage};

import java.util.UUID;

public class ${principal.name}SessionDto {
    public UUID id;
    public String ${security.loginField};
}
`;
  await fs.writeFile(session, sessionSource, 'utf8');

  let authSource = await fs.readFile(auth, 'utf8');
  authSource = authSource
    .replace(/^import .*?(?:RoleSessionDto|PermissionSessionDto);\n|^import java\.util\.stream\.Collectors;\n/gm, '')
    .replace(/\n\s*if \(\w+\.role != null\) \{[\s\S]*?\n\s*\}\n(?=\n\s*return)/, '\n')
    .replace(new RegExp(`private ${principal.name}SessionDto build${principal.name}Session\\(${principal.name}Entity (\\w+)\\) \\{[\\s\\S]*?\\n    \\}`), `private ${principal.name}SessionDto build${principal.name}Session(${principal.name}Entity account) {\n        ${principal.name}SessionDto session = new ${principal.name}SessionDto();\n        session.id = account.getId();\n        session.${security.loginField} = account.${security.loginField};\n        return session;\n    }`);
  await fs.writeFile(auth, authSource, 'utf8');

  const entityPackage = (await fs.readFile(entity, 'utf8')).match(/^package ([^;]+);/m)?.[1];
  if (!entityPackage) throw new Error('La entidad principal no declara un paquete Java');
  const basePackage = entityPackage.replace(/\.entity$/, '');
  const initializer = `package ${basePackage}.config;

import ${entityPackage}.${principal.name}Entity;
import ${basePackage}.repository.${principal.name}Repository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {
    private final ${principal.name}Repository repository;
    private final PasswordEncoder passwordEncoder;

    public DataInitializer(${principal.name}Repository repository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override public void run(String... args) {
        if (repository.findBy${capitalize(security.loginField!)}(${javaString(security.testUserLogin!)}).isPresent()) return;
        ${principal.name}Entity account = new ${principal.name}Entity();
        account.${security.loginField!} = ${javaString(security.testUserLogin!)};
        account.${security.credentialField!} = passwordEncoder.encode(${javaString(security.testUserPassword!)});
        repository.save(account);
    }
}
`;
  const initializerPath = join(projectRoot, 'src', 'main', 'java', ...basePackage.split('.'), 'config', 'DataInitializer.java');
  await fs.mkdir(dirname(initializerPath), { recursive: true });
  await fs.writeFile(initializerPath, initializer, 'utf8');

  const buildFile = join(projectRoot, 'build.gradle.kts');
  const build = await fs.readFile(buildFile, 'utf8');
  await fs.writeFile(buildFile, build.split('\n').filter((line) => !/spring-boot-starter-aop|spring-security-test/.test(line)).join('\n'), 'utf8');
}

const capitalize = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
const javaString = (value: string) => JSON.stringify(value);

async function removeAuthenticationTemplate(projectRoot: string) {
  const paths = await filesUnder(join(projectRoot, 'src', 'main'));
  await Promise.all(paths.filter((file) => /\/(?:users\/.+|config\/(?:SecurityConfig|DataInitializer)\.java|common\/(?:annotation\/RequirePermission|aspect\/PermissionCheckAspect|constants\/(?:RoleConstants|PermissionConstants))\.java|resources\/db\/migration\/V1__identity_and_access\.sql)$/.test(file)).map((file) => fs.rm(file)));
  const buildFile = join(projectRoot, 'build.gradle.kts');
  const build = await fs.readFile(buildFile, 'utf8');
  await fs.writeFile(buildFile, build.split('\n').filter((line) => !/spring-boot-starter-(?:aop|security)|jjwt-|spring-security-test/.test(line)).join('\n'), 'utf8');
}
