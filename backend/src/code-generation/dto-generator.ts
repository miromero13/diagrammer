import { featurePackageName } from './feature-name';
import { RelationalModel, UmlAnalysis, UmlAttribute, UmlElement } from './uml-analysis';
import { importForType, renderedType } from './uml-java';

export type GeneratedDtoFile = { path: string; source: string };

type Table = RelationalModel['tables'][number];

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const baseEntityAttributes = new Set(['id', 'createdAt', 'updatedAt']);
const scalarTypes = new Set(['String', 'Integer', 'Long', 'Float', 'Double', 'BigDecimal', 'Boolean', 'LocalDate', 'LocalDateTime', 'UUID']);

const entityName = (element: UmlElement) => `${element.name}Entity`;
const dtoName = (prefix: string, element: UmlElement) => `${prefix}${element.name}Dto`;
const fieldName = (attribute: UmlAttribute) => attribute.canonicalName;

const scalarAttributes = (element: UmlElement, table: Table, enumNames: Set<string>) => element.structuredAttributes
  .filter((attribute) => !baseEntityAttributes.has(attribute.canonicalName))
  .filter((attribute) => table.columns.some((column) => column.source === 'attribute' && (column.sourceName === attribute.sourceName || column.canonicalName === attribute.canonicalName)))
  .filter((attribute) => scalarTypes.has(attribute.javaType) || enumNames.has(attribute.sourceType.toLowerCase()))
  .sort((a, b) => fieldName(a).localeCompare(fieldName(b)) || a.sourceName.localeCompare(b.sourceName));

const renderImports = (imports: Set<string>) => [...imports].sort().map((item) => `import ${item};`).join('\n');

const renderDto = (packageName: string, name: string, fields: string[], imports: Set<string>) => [
  `package ${packageName};`,
  '',
  renderImports(imports),
  '',
  `public class ${name} {`,
  fields.map((field) => `    ${field}`).join('\n'),
  '}',
  '',
].join('\n');

const renderMapper = (packageName: string, element: UmlElement, attributes: UmlAttribute[], imports: Set<string>) => {
  const entity = entityName(element), create = dtoName('Create', element), update = dtoName('Update', element), response = `${element.name}ResponseDto`;
  const assignments = attributes.map((attribute) => `        entity.${fieldName(attribute)} = dto.${fieldName(attribute)};`).join('\n');
  const responseAssignments = attributes.map((attribute) => `        response.${fieldName(attribute)} = entity.${fieldName(attribute)};`).join('\n');
  const updateAssignments = attributes.map((attribute) => `        if (dto.${fieldName(attribute)} != null) entity.${fieldName(attribute)} = dto.${fieldName(attribute)};`).join('\n');
  const createMethod = element.kind === 'abstract'
    ? [`    public static ${entity} toEntity(${create} dto, ${entity} entity) {`, '        if (dto == null || entity == null) return entity;', assignments, '        return entity;', '    }']
    : [`    public static ${entity} toEntity(${create} dto) {`, '        if (dto == null) return null;', `        ${entity} entity = new ${entity}();`, assignments, '        return entity;', '    }'];
  return [
    `package ${packageName};`,
    '',
    renderImports(imports),
    '',
    `public final class ${element.name}Mapper {`,
    `    private ${element.name}Mapper() {}`,
    '',
    ...createMethod,
    '',
    `    public static void updateEntity(${update} dto, ${entity} entity) {`,
    '        if (dto == null || entity == null) return;',
    updateAssignments,
    '    }',
    '',
    `    public static ${response} toResponse(${entity} entity) {`,
    '        if (entity == null) return null;',
    `        ${response} response = new ${response}();`,
    '        response.id = entity.getId();',
    responseAssignments,
    '        return response;',
    '    }',
    '}',
    '',
  ].join('\n');
};

const dtoFields = (attributes: UmlAttribute[], typeFor: (attribute: UmlAttribute) => string, required: boolean, imports: Set<string>) => attributes.map((attribute) => {
  if (required && attribute.multiplicity.lower !== null && attribute.multiplicity.lower > 0) imports.add('jakarta.validation.constraints.NotNull');
  const annotation = required && attribute.multiplicity.lower !== null && attribute.multiplicity.lower > 0 ? '@NotNull\n    ' : '';
  return `${annotation}public ${typeFor(attribute)} ${fieldName(attribute)};`;
});

export function generateDtos(analysis: UmlAnalysis, basePackage: string): GeneratedDtoFile[] {
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.name.toLowerCase(), element]));
  const enumNames = new Set(analysis.relationalModel.enums.map((item) => item.name.toLowerCase()));
  const files: GeneratedDtoFile[] = [];

  analysis.relationalModel.tables
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((table) => {
      const element = analysis.normalizedModel.elements.find((candidate) => candidate.id === table.sourceElementId);
      if (!element || (element.kind !== 'class' && element.kind !== 'abstract')) return;
      const attributes = scalarAttributes(element, table, enumNames);
      const dtoPackage = `${basePackage}.${featurePackageName(element.name)}.dto`;
      const mapperPackage = `${basePackage}.${featurePackageName(element.name)}.mapper`;
      const typeFor = (attribute: UmlAttribute) => renderedType(attribute.sourceType, elements);
      const commonImports = new Set<string>();
      attributes.forEach((attribute) => importForType(attribute.sourceType, elements, basePackage, commonImports));

      const createImports = new Set(commonImports);
      const updateImports = new Set(commonImports);
      const responseImports = new Set(['java.util.UUID', ...commonImports]);
      const queryImports = new Set<string>();
      files.push(
        { path: `src/main/java/${packagePath(dtoPackage)}/${dtoName('Create', element)}.java`, source: renderDto(dtoPackage, dtoName('Create', element), dtoFields(attributes, typeFor, true, createImports), createImports) },
        { path: `src/main/java/${packagePath(dtoPackage)}/${dtoName('Update', element)}.java`, source: renderDto(dtoPackage, dtoName('Update', element), dtoFields(attributes, typeFor, false, updateImports), updateImports) },
        { path: `src/main/java/${packagePath(dtoPackage)}/${element.name}ResponseDto.java`, source: renderDto(dtoPackage, `${element.name}ResponseDto`, ['public UUID id;', ...dtoFields(attributes, typeFor, false, responseImports)], responseImports) },
        { path: `src/main/java/${packagePath(dtoPackage)}/${element.name}QueryDto.java`, source: renderDto(dtoPackage, `${element.name}QueryDto`, ['public Integer page;', 'public Integer size;'], queryImports) },
      );

      const mapperImports = new Set<string>([
        `${basePackage}.${featurePackageName(element.name)}.${entityName(element)}`,
        `${dtoPackage}.${dtoName('Create', element)}`,
        `${dtoPackage}.${dtoName('Update', element)}`,
        `${dtoPackage}.${element.name}ResponseDto`,
      ]);
      attributes.forEach((attribute) => importForType(attribute.sourceType, elements, basePackage, mapperImports));
      files.push({
        path: `src/main/java/${packagePath(mapperPackage)}/${element.name}Mapper.java`,
        source: renderMapper(mapperPackage, element, attributes, mapperImports),
      });
    });

  return files;
}

export const generateApiModel = generateDtos;
