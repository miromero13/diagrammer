import { SecurityResolution } from './security-resolution';
import { featurePackageName } from './feature-name';
import { UmlConnection, UmlElement } from './uml-analysis';
import { importForType, isPromotedAbstract, operationImports, relationshipDeclaration, renderedType, renderOperations } from './uml-java';

export type GeneratedDomainFile = { path: string; source: string };

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const tableName = (name: string) => `${name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()}s`;
const baseEntityAttributes = new Set(['id', 'createdAt', 'updatedAt']);

const typeImports = (element: UmlElement, elements: Map<string, UmlElement>, basePackage: string) => {
  const result = new Set<string>();
  element.structuredAttributes.filter((attribute) => !baseEntityAttributes.has(attribute.canonicalName)).forEach((attribute) => importForType(attribute.sourceType || attribute.javaType, elements, basePackage, result));
  return result;
};
const interfaceDefault = (type: string, value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed || type !== 'String') return trimmed || 'null';
  if (/^"(?:\\.|[^"\\])*"$/.test(trimmed) || trimmed.startsWith('"') || trimmed === 'null' || /^new\b/.test(trimmed) || /^[A-Z_$][A-Z0-9_$]*(?:\.[A-Z_$][A-Z0-9_$]*)*$/.test(trimmed) || trimmed.includes('.') || trimmed.includes('(') || trimmed.includes(')')) return trimmed;
  return JSON.stringify(trimmed);
};

const attributes = (element: UmlElement, elements: Map<string, UmlElement>, entity = false, security?: SecurityResolution, interfaceFields = false) => element.structuredAttributes.filter((attribute) => !baseEntityAttributes.has(attribute.canonicalName)).map((attribute) => {
  const type = renderedType(attribute.sourceType || attribute.javaType, elements);
  if (interfaceFields) return `    public static final ${type} ${attribute.canonicalName} = ${interfaceDefault(type, attribute.defaultValue)};`;
  const annotations = entity
    ? [
      attribute.canonicalName === security?.credentialField ? '    @JsonIgnore\n' : '',
      attribute.canonicalName === security?.loginField ? '    @Column(nullable = false, unique = true)\n' : '    @Column\n',
    ].join('')
    : '';
  return `${annotations}    public ${type} ${attribute.canonicalName};`;
}).join('\n\n');

const sourceFor = (element: UmlElement, packageName: string, basePackage: string, elements: UmlElement[], relationships: UmlConnection[], security?: SecurityResolution) => {
  const declaration = relationshipDeclaration(element, elements, relationships, basePackage, element.kind === 'class' ? 'BaseEntity' : undefined);
  const typeElements = new Map(elements.map((candidate) => [candidate.name.toLowerCase(), candidate]));
  const methodImports = operationImports(element, elements, relationships, basePackage);
  const principalImport = security?.enabled && security.principal?.id === element.id ? 'import com.fasterxml.jackson.annotation.JsonIgnore;' : '';
  const fixedImports = element.kind === 'class'
    ? [
      principalImport,
      `import ${basePackage}.common.entity.BaseEntity;`,
      'import jakarta.persistence.Column;',
      'import jakarta.persistence.Entity;',
      'import jakarta.persistence.Table;',
    ].filter(Boolean)
    : [];
  const dynamicImports = [...typeImports(element, typeElements, basePackage), ...methodImports, ...declaration.imports]
    .filter((item) => !item.startsWith(`${packageName}.`))
    .map((item) => `import ${item};`);
  const importsForElement = [...new Set([...fixedImports, ...dynamicImports])].sort().map((item) => `${item}\n`).join('');
  const operations = renderOperations(element, elements, relationships);
  const members = [attributes(element, typeElements), operations].filter(Boolean).join('\n\n');
  if (element.kind === 'interface') return `package ${packageName};\n\n${importsForElement}\npublic interface ${element.name}${declaration.extendsTypes.length ? ` extends ${declaration.extendsTypes.join(', ')}` : ''} {\n${[attributes(element, typeElements, false, undefined, true), operations].filter(Boolean).join('\n\n')}\n}\n`;
  if (element.kind === 'abstract') return `package ${packageName};\n\n${importsForElement}\npublic abstract class ${element.name}${declaration.extendsType ? ` extends ${declaration.extendsType}` : ''}${declaration.implementsTypes.length ? ` implements ${declaration.implementsTypes.join(', ')}` : ''} {\n${members}\n}\n`;
  const classModifier = isPromotedAbstract(element) ? 'abstract ' : '';
  return `package ${packageName};\n\n${importsForElement}\n@Entity\n@Table(name = "${tableName(element.name)}")\npublic ${classModifier}class ${element.name}Entity${declaration.extendsType ? ` extends ${declaration.extendsType}` : ''}${declaration.implementsTypes.length ? ` implements ${declaration.implementsTypes.join(', ')}` : ''} {\n${[attributes(element, typeElements, true, security), operations].filter(Boolean).join('\n\n')}\n}\n`;
};

export function generateDomainModel(elements: UmlElement[], basePackage: string, security: SecurityResolution, relationships: UmlConnection[] = []): GeneratedDomainFile[] {
  return elements
    .filter((element) => element.kind !== 'enum')
    .map((element) => {
      const packageName = `${basePackage}.${featurePackageName(element.name)}`;
      const fileName = element.kind === 'class' ? `${element.name}Entity.java` : `${element.name}.java`;
      return { path: `src/main/java/${packagePath(packageName)}/${fileName}`, source: sourceFor(element, packageName, basePackage, elements, relationships, security) };
    });
}
