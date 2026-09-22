import { featureName, featurePackageName } from './feature-name';
import { UmlAnalysis, UmlAttribute, UmlElement } from './uml-analysis';
import { importForType, isPromotedAbstract, renderedType } from './uml-java';

export type GeneratedDtoFile = { path: string; source: string };

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const baseEntityAttributes = new Set(['id', 'createdAt', 'updatedAt']);
const scalarTypes = new Set(['String', 'Integer', 'Long', 'Float', 'Double', 'BigDecimal', 'Boolean', 'LocalDate', 'LocalDateTime', 'UUID']);

const entityName = (element: UmlElement) => `${element.name}Entity`;
const dtoName = (prefix: string, element: UmlElement) => `${prefix}${element.name}Dto`;
const fieldName = (attribute: UmlAttribute) => attribute.canonicalName;
const camel = (value: string) => {
  const result = value.replace(/[^A-Za-z0-9_$]+(.)/g, (_, character) => String(character).toUpperCase());
  return result ? `${result.charAt(0).toLowerCase()}${result.slice(1)}` : 'relation';
};
const collection = (multiplicity: { lower: number | null; upper: number | null }) => multiplicity.lower !== null && multiplicity.upper !== 1;
const relationKind = (type: string) => ['association', 'aggregation', 'composition'].includes(type);
const classLike = (element?: UmlElement) => element?.kind === 'class' || element?.kind === 'abstract';
const fieldFromColumn = (column: string) => camel(column.replace(/_id$/, ''));

export type GeneratedRelation = {
  fieldName: string;
  target: UmlElement;
  collection: boolean;
  writable: boolean;
  required: boolean;
};

const inheritanceParents = (analysis: UmlAnalysis) => new Map(
  analysis.normalizedModel.relationships
    .filter((connection) => connection.type === 'inheritance')
    .map((connection) => [connection.sourceId, connection.targetId]),
);

const hierarchy = (element: UmlElement, elements: Map<string, UmlElement>, parents: Map<string, string>) => {
  const ancestors: UmlElement[] = [];
  const visit = (id: string) => {
    const parentId = parents.get(id), parent = parentId ? elements.get(parentId) : undefined;
    if (!parent) return;
    visit(parent.id);
    ancestors.push(parent);
  };
  visit(element.id);
  return [...ancestors, element];
};

const relationFieldsByElement = (analysis: UmlAnalysis) => {
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  const tables = new Map(analysis.relationalModel.tables.map((table) => [table.sourceElementId, table]));
  const relational = new Map(analysis.relationalModel.relationships.map((relationship) => [relationship.id, relationship]));
  const parents = inheritanceParents(analysis);
  const direct = new Map<string, GeneratedRelation[]>();
  const add = (element: UmlElement, relation: GeneratedRelation) => direct.set(element.id, [...(direct.get(element.id) || []), relation]);

  analysis.normalizedModel.relationships.filter((connection) => relationKind(connection.type)).forEach((connection) => {
    const source = elements.get(connection.sourceId), target = elements.get(connection.targetId);
    if (!source || !target || !classLike(source) || !classLike(target) || !tables.has(source.id) || !tables.has(target.id)) return;
    const sourceMany = collection(connection.source), targetMany = collection(connection.target);
    const model = relational.get(connection.id);

    if (connection.associationClassId) {
      const association = elements.get(connection.associationClassId), associationTable = association && tables.get(association.id);
      if (!association || !associationTable || !model) return;
      model.foreignKeys.forEach((foreignKey) => {
        const targetId = [...tables.entries()].find(([, table]) => table.name === foreignKey.referencedTable)?.[0];
        const related = targetId ? elements.get(targetId) : undefined;
        if (!related) return;
        const column = associationTable.columns.find((candidate) => candidate.name === foreignKey.column);
        add(association, { fieldName: fieldFromColumn(foreignKey.column), target: related, collection: false, writable: true, required: column?.nullable === false });
        add(related, { fieldName: featureName(association.name), target: association, collection: true, writable: false, required: false });
      });
      return;
    }

    if (sourceMany && targetMany) {
      add(source, { fieldName: featureName(target.name), target, collection: true, writable: true, required: false });
      add(target, { fieldName: featureName(source.name), target: source, collection: true, writable: false, required: false });
      return;
    }

    if (!sourceMany && !targetMany) {
      if (connection.source.lower === null || connection.target.lower === null) return;
      const sourceOwner = connection.sourceNavigable === true && connection.targetNavigable !== true;
      const targetOwner = connection.targetNavigable === true && connection.sourceNavigable !== true;
      const implicitSourceOwner = connection.sourceNavigable === undefined && connection.targetNavigable === undefined;
      const owner = implicitSourceOwner || sourceOwner ? source : target;
      const referenced = implicitSourceOwner || sourceOwner ? target : source;
      const referencedTable = tables.get(referenced.id)!;
      add(owner, {
        fieldName: camel(referencedTable.name),
        target: referenced,
        collection: false,
        writable: true,
        required: (implicitSourceOwner || sourceOwner ? connection.target : connection.source).lower !== 0,
      });
      add(referenced, { fieldName: camel(owner.name), target: owner, collection: false, writable: false, required: false });
      return;
    }

    const foreignKey = model?.foreignKeys[0];
    if (!foreignKey) return;
    const foreignElement = [...tables.entries()].find(([, table]) => table.name === foreignKey.table)?.[0];
    const referencedElement = [...tables.entries()].find(([, table]) => table.name === foreignKey.referencedTable)?.[0];
    const owner = foreignElement ? elements.get(foreignElement) : undefined;
    const referenced = referencedElement ? elements.get(referencedElement) : undefined;
    if (!owner || !referenced) return;
    const ownerTable = tables.get(owner.id)!;
    const column = ownerTable.columns.find((candidate) => candidate.name === foreignKey.column);
    add(owner, { fieldName: fieldFromColumn(foreignKey.column), target: referenced, collection: false, writable: true, required: column?.nullable === false });
    add(referenced, { fieldName: featureName(owner.name), target: owner, collection: true, writable: false, required: false });
  });

  return { elements, parents, direct };
};

export const generatedRelationFields = (analysis: UmlAnalysis, element: UmlElement, includeInherited = true): GeneratedRelation[] => {
  const { elements, parents, direct } = relationFieldsByElement(analysis);
  const seen = new Set<string>();
  const owners = includeInherited ? hierarchy(element, elements, parents) : [element];
  return owners.flatMap((owner) => direct.get(owner.id) || []).filter((relation) => {
    const name = relation.collection ? `${relation.fieldName}Ids` : `${relation.fieldName}Id`;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
};

const scalarAttributes = (analysis: UmlAnalysis, element: UmlElement, enumNames: Set<string>, includeInherited = true) => {
  const elements = new Map(analysis.normalizedModel.elements.map((candidate) => [candidate.id, candidate]));
  const tables = new Map(analysis.relationalModel.tables.map((table) => [table.sourceElementId, table]));
  const owners = includeInherited ? hierarchy(element, elements, inheritanceParents(analysis)) : [element];
  return owners.flatMap((owner) => {
    const table = tables.get(owner.id);
    return table ? owner.structuredAttributes
      .filter((attribute) => !baseEntityAttributes.has(attribute.canonicalName))
      .filter((attribute) => table.columns.some((column) => column.source === 'attribute' && (column.sourceName === attribute.sourceName || column.canonicalName === attribute.canonicalName)))
      .filter((attribute) => scalarTypes.has(attribute.javaType) || enumNames.has(attribute.sourceType.toLowerCase())) : [];
  }).filter((attribute, index, attributes) => attributes.findIndex((candidate) => fieldName(candidate) === fieldName(attribute)) === index)
    .sort((a, b) => fieldName(a).localeCompare(fieldName(b)) || a.sourceName.localeCompare(b.sourceName));
};

const persistedParent = (analysis: UmlAnalysis, element: UmlElement) => {
  const parentId = inheritanceParents(analysis).get(element.id);
  const parent = parentId ? analysis.normalizedModel.elements.find((candidate) => candidate.id === parentId) : undefined;
  const tables = new Set(analysis.relationalModel.tables.map((table) => table.sourceElementId));
  return parent && classLike(parent) && tables.has(parent.id) ? parent : undefined;
};

const renderImports = (imports: Set<string>) => [...imports].sort().map((item) => `import ${item};`).join('\n');

const renderDto = (packageName: string, name: string, fields: string[], imports: Set<string>, parent?: string) => [
  `package ${packageName};`,
  '',
  renderImports(imports),
  '',
  `@Schema(description = "${name} API schema")`,
  `public class ${name}${parent ? ` extends ${parent}` : ''} {`,
  fields.map((field) => `    ${field}`).join('\n'),
  '}',
  '',
].join('\n');

const relationDtoName = (relation: GeneratedRelation) => `${relation.fieldName}${relation.collection ? 'Ids' : 'Id'}`;

const relationDtoFields = (relations: GeneratedRelation[], mode: 'request' | 'response', required: boolean, imports: Set<string>) => relations
  .filter((relation) => mode === 'response' || relation.writable)
  .map((relation) => {
    imports.add('io.swagger.v3.oas.annotations.media.Schema');
    imports.add('java.util.UUID');
    if (relation.collection) imports.add('java.util.List');
    const isRequired = required && relation.writable && relation.required;
    if (isRequired) imports.add('jakarta.validation.constraints.NotNull');
    const name = relationDtoName(relation), type = relation.collection ? 'List<UUID>' : 'UUID';
    const schema = `@Schema(description = "${name} relation ID"${isRequired ? ', requiredMode = Schema.RequiredMode.REQUIRED' : ''}${mode === 'response' ? ', accessMode = Schema.AccessMode.READ_ONLY' : ''})`;
    return `${schema}${isRequired ? '\n    @NotNull' : ''}\n    public ${type} ${name};`;
  });

const renderMapper = (packageName: string, element: UmlElement, attributes: UmlAttribute[], relations: GeneratedRelation[], imports: Set<string>) => {
  const entity = entityName(element), create = dtoName('Create', element), update = dtoName('Update', element), response = `${element.name}ResponseDto`;
  const assignments = attributes.map((attribute) => `        entity.${fieldName(attribute)} = dto.${fieldName(attribute)};`).join('\n');
  const responseAssignments = [
    ...attributes.map((attribute) => `        response.${fieldName(attribute)} = entity.${fieldName(attribute)};`),
    ...relations.map((relation) => {
      const name = relationDtoName(relation);
      if (!relation.collection) return `        response.${name} = entity.${relation.fieldName} == null ? null : entity.${relation.fieldName}.getId();`;
      imports.add('java.util.List');
      imports.add('java.util.Objects');
      return `        response.${name} = entity.${relation.fieldName} == null ? List.of() : entity.${relation.fieldName}.stream().filter(Objects::nonNull).map(item -> item.getId()).toList();`;
    }),
  ].join('\n');
  const updateAssignments = attributes.map((attribute) => `        if (dto.${fieldName(attribute)} != null) entity.${fieldName(attribute)} = dto.${fieldName(attribute)};`).join('\n');
  const createMethod = element.kind === 'abstract' || isPromotedAbstract(element)
    ? [`    public ${entity} toEntity(${create} dto, ${entity} entity) {`, '        if (dto == null || entity == null) return entity;', assignments, '        return entity;', '    }']
    : [`    public ${entity} toEntity(${create} dto) {`, '        if (dto == null) return null;', `        ${entity} entity = new ${entity}();`, assignments, '        return entity;', '    }'];
  return [
    `package ${packageName};`,
    '',
    renderImports(imports),
    '',
    '@Component',
    `public final class ${element.name}Mapper {`,
    '',
    ...createMethod,
    '',
    `    public void updateEntity(${update} dto, ${entity} entity) {`,
    '        if (dto == null || entity == null) return;',
    updateAssignments,
    '    }',
    '',
    `    public ${response} toResponse(${entity} entity) {`,
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
  const isRequired = required && attribute.multiplicity.lower !== null && attribute.multiplicity.lower > 0;
  imports.add('io.swagger.v3.oas.annotations.media.Schema');
  if (isRequired) imports.add('jakarta.validation.constraints.NotNull');
  const schema = `@Schema(description = "${attribute.sourceName} field"${isRequired ? ', requiredMode = Schema.RequiredMode.REQUIRED' : ''})`;
  const validation = isRequired ? '\n    @NotNull' : '';
  return `${schema}${validation}\n    public ${typeFor(attribute)} ${fieldName(attribute)};`;
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
      const attributes = scalarAttributes(analysis, element, enumNames);
      const declaredAttributes = scalarAttributes(analysis, element, enumNames, false);
      const relations = generatedRelationFields(analysis, element);
      const declaredRelations = generatedRelationFields(analysis, element, false);
      const parent = persistedParent(analysis, element);
      const dtoPackage = `${basePackage}.${featurePackageName(element.name)}.dto`;
      const mapperPackage = `${basePackage}.${featurePackageName(element.name)}.mapper`;
      const typeFor = (attribute: UmlAttribute) => renderedType(attribute.sourceType, elements);
      const commonImports = new Set<string>(['io.swagger.v3.oas.annotations.media.Schema']);
      declaredAttributes.forEach((attribute) => importForType(attribute.sourceType, elements, basePackage, commonImports));

      const createImports = new Set(commonImports);
      const updateImports = new Set(commonImports);
      const responseImports = new Set(['java.util.UUID', ...commonImports]);
      const queryImports = new Set<string>(['io.swagger.v3.oas.annotations.media.Schema']);
      if (parent) {
        const parentDtoPackage = `${basePackage}.${featurePackageName(parent.name)}.dto`;
        createImports.add(`${parentDtoPackage}.${dtoName('Create', parent)}`);
        updateImports.add(`${parentDtoPackage}.${dtoName('Update', parent)}`);
        responseImports.add(`${parentDtoPackage}.${parent.name}ResponseDto`);
      }
      const responseIdentity = parent ? [] : ['@Schema(description = "Entity identifier", format = "uuid", accessMode = Schema.AccessMode.READ_ONLY)\n    public UUID id;'];
      files.push(
        { path: `src/main/java/${packagePath(dtoPackage)}/${dtoName('Create', element)}.java`, source: renderDto(dtoPackage, dtoName('Create', element), [...dtoFields(declaredAttributes, typeFor, true, createImports), ...relationDtoFields(declaredRelations, 'request', true, createImports)], createImports, parent ? dtoName('Create', parent) : undefined) },
        { path: `src/main/java/${packagePath(dtoPackage)}/${dtoName('Update', element)}.java`, source: renderDto(dtoPackage, dtoName('Update', element), [...dtoFields(declaredAttributes, typeFor, false, updateImports), ...relationDtoFields(declaredRelations, 'request', false, updateImports)], updateImports, parent ? dtoName('Update', parent) : undefined) },
        { path: `src/main/java/${packagePath(dtoPackage)}/${element.name}ResponseDto.java`, source: renderDto(dtoPackage, `${element.name}ResponseDto`, [...responseIdentity, ...dtoFields(declaredAttributes, typeFor, false, responseImports), ...relationDtoFields(declaredRelations, 'response', false, responseImports)], responseImports, parent ? `${parent.name}ResponseDto` : undefined) },
        { path: `src/main/java/${packagePath(dtoPackage)}/${element.name}QueryDto.java`, source: renderDto(dtoPackage, `${element.name}QueryDto`, ['@Schema(description = "Zero-based page number")\n    public Integer page;', '@Schema(description = "Maximum number of resources to return")\n    public Integer size;'], queryImports) },
      );

      const mapperImports = new Set<string>([
        'org.springframework.stereotype.Component',
        `${basePackage}.${featurePackageName(element.name)}.${entityName(element)}`,
        `${dtoPackage}.${dtoName('Create', element)}`,
        `${dtoPackage}.${dtoName('Update', element)}`,
        `${dtoPackage}.${element.name}ResponseDto`,
      ]);
      attributes.forEach((attribute) => importForType(attribute.sourceType, elements, basePackage, mapperImports));
      relations.forEach((relation) => {
        if (relation.collection) mapperImports.add('java.util.List');
      });
      files.push({
        path: `src/main/java/${packagePath(mapperPackage)}/${element.name}Mapper.java`,
        source: renderMapper(mapperPackage, element, attributes, relations, mapperImports),
      });
    });

  return files;
}

export const generateApiModel = generateDtos;
