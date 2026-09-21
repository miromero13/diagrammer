import { SecurityResolution } from './security-resolution';
import { featureName } from './feature-name';
import { UmlElement } from './uml-analysis';

export type GeneratedDomainFile = { path: string; source: string };

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const tableName = (name: string) => `${name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}s`;
const imports = {
  BigDecimal: 'java.math.BigDecimal',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
  List: 'java.util.List',
  Map: 'java.util.Map',
  Set: 'java.util.Set',
  UUID: 'java.util.UUID',
};

const javaType = (type: string) => type.replace(/\bArray<([^<>]+)>/g, '$1[]').replace(/\bMap</g, 'Map<String, ');
const typeImports = (element: UmlElement) => [...new Set(element.structuredAttributes.flatMap((attribute) => (javaType(attribute.javaType).match(/[A-Z][A-Za-z0-9_]*/g) || []).map((name) => imports[name as keyof typeof imports]).filter(Boolean)))].sort().map((value) => `import ${value};\n`).join('');

const attributes = (element: UmlElement, entity = false, security?: SecurityResolution) => element.structuredAttributes.map((attribute) => {
  const annotations = entity
    ? [
      attribute.canonicalName === security?.credentialField ? '    @JsonIgnore\n' : '',
      attribute.canonicalName === security?.loginField ? '    @Column(nullable = false, unique = true)\n' : '    @Column\n',
    ].join('')
    : '';
  return `${annotations}    public ${javaType(attribute.javaType)} ${attribute.canonicalName};`;
}).join('\n\n');

const sourceFor = (element: UmlElement, packageName: string, basePackage: string, security?: SecurityResolution) => {
  const importsForElement = typeImports(element);
  if (element.kind === 'interface') return `package ${packageName};\n\n${importsForElement}\npublic interface ${element.name} {\n${attributes(element)}\n}\n`;
  if (element.kind === 'abstract') return `package ${packageName};\n\n${importsForElement}\npublic abstract class ${element.name} {\n${attributes(element)}\n}\n`;
  const isPrincipal = security?.enabled && security.principal?.id === element.id;
  return `package ${packageName};\n\n${isPrincipal ? 'import com.fasterxml.jackson.annotation.JsonIgnore;\n' : ''}import ${basePackage}.common.entity.BaseEntity;\nimport jakarta.persistence.Column;\nimport jakarta.persistence.Entity;\nimport jakarta.persistence.Table;\n${importsForElement}\n@Entity\n@Table(name = "${tableName(element.name)}")\npublic class ${element.name}Entity extends BaseEntity {\n${attributes(element, true, security)}\n}\n`;
};

export function generateDomainModel(elements: UmlElement[], basePackage: string, security: SecurityResolution): GeneratedDomainFile[] {
  return elements
    .filter((element) => element.kind !== 'enum')
    .map((element) => {
      const packageName = `${basePackage}.${featureName(element.name)}.${element.kind === 'class' ? 'entity' : 'model'}`;
      const fileName = element.kind === 'class' ? `${element.name}Entity.java` : `${element.name}.java`;
      return { path: `src/main/java/${packagePath(packageName)}/${fileName}`, source: sourceFor(element, packageName, basePackage, security) };
    });
}
