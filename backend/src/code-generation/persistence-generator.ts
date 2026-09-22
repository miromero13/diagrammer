import { featureName, featurePackageName } from './feature-name';
import { SecurityResolution } from './security-resolution';
import { RelationalColumn, RelationalForeignKey, RelationalModel, UmlAnalysis, UmlConnection, UmlElement } from './uml-analysis';
import { isPromotedAbstract, operationImports, relationshipDeclaration, renderOperations } from './uml-java';

export type GeneratedPersistenceFile = { path: string; source: string };

type Table = RelationalModel['tables'][number];
type Member = { name: string; type: string; annotations: string[]; imports: string[] };
type JoinTable = {
  name: string;
  sourceTable: string;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
};
type SyntheticColumn = { table: string; column: string; nullable: boolean };
type Inheritance = Map<string, string>;

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const snake = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
const camel = (value: string) => {
  const result = value.replace(/[^A-Za-z0-9_$]+(.)/g, (_, character) => String(character).toUpperCase());
  return result ? `${result.charAt(0).toLowerCase()}${result.slice(1)}` : 'relation';
};
const collection = (multiplicity: { lower: number | null; upper: number | null }) => multiplicity.lower !== null && multiplicity.upper !== 1;
const classLike = (element?: UmlElement) => element?.kind === 'class' || element?.kind === 'abstract';
const relationKind = (connection: UmlConnection) => ['association', 'aggregation', 'composition'].includes(connection.type);
const relationship = (analysis: UmlAnalysis, id: string) => analysis.relationalModel.relationships.find((item) => item.id === id);
const fieldFromColumn = (column: string) => camel(column.replace(/_id$/, ''));
const entityName = (element: UmlElement) => `${element.name}Entity`;
const scalarImports: Record<string, string> = {
  BigDecimal: 'java.math.BigDecimal',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
};
const baseEntityAttributes = new Set(['id', 'createdAt', 'updatedAt']);

const fail = (message: string): never => {
  throw new Error(`Persistence generation rejected: ${message}`);
};

const tableByElement = (tables: Table[]) => new Map(tables.map((table) => [table.sourceElementId, table]));

const validateInheritance = (analysis: UmlAnalysis, tableMap: Map<string, Table>): Inheritance => {
  const parents = new Map<string, string>();
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  analysis.normalizedModel.relationships.filter((connection) => connection.type === 'inheritance' && classLike(elements.get(connection.sourceId)) && classLike(elements.get(connection.targetId))).forEach((connection) => {
    if (!tableMap.has(connection.sourceId) || !tableMap.has(connection.targetId)) fail(`inheritance ${connection.id} has a missing persistible endpoint`);
    if (parents.has(connection.sourceId)) fail(`class ${connection.sourceName} has ambiguous inheritance parents`);
    parents.set(connection.sourceId, connection.targetId);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail(`inheritance cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = parents.get(id);
    if (parent) visit(parent);
    visiting.delete(id);
    visited.add(id);
  };
  [...parents.keys()].forEach(visit);

  tableMap.forEach((table, elementId) => {
    const parentId = parents.get(elementId);
    if (parentId && table.inheritance && table.inheritance.baseTable !== tableMap.get(parentId)?.name) {
      fail(`inheritance metadata for ${table.name} does not match its normalized parent`);
    }
  });
  return parents;
};

const validateModel = (analysis: UmlAnalysis, security: SecurityResolution) => {
  if (analysis.errors.length) fail(analysis.errors.join('\n'));
  const { relationalModel, normalizedModel } = analysis;
  const tables = relationalModel.tables;
  const tableNames = new Set<string>();
  const elementIds = new Set<string>();
  const elementMap = new Map(normalizedModel.elements.map((element) => [element.id, element]));
  tables.forEach((table) => {
    if (!/^[a-z][a-z0-9_]*$/.test(table.name)) fail(`physical table name ${table.name || '<empty>'} is unsafe`);
    if (tableNames.has(table.name)) fail(`duplicate physical table name ${table.name}`);
    if (elementIds.has(table.sourceElementId)) fail(`duplicate relational source element ${table.sourceElementId}`);
    tableNames.add(table.name);
    elementIds.add(table.sourceElementId);
    const columns = new Set<string>();
    table.columns.forEach((column) => {
      if (!/^[a-z][a-z0-9_]*$/.test(column.name)) fail(`physical column name ${column.name || '<empty>'} in ${table.name} is unsafe`);
      if (columns.has(column.name)) fail(`duplicate physical column ${table.name}.${column.name}`);
      columns.add(column.name);
    });
    const primaryKey = table.columns.find((column) => column.primaryKey);
    if (!primaryKey || primaryKey.javaType !== 'UUID') fail(`table ${table.name} requires a UUID primary key compatible with BaseEntity`);
  });
  normalizedModel.relationships.forEach((connection) => {
    if (!elementMap.has(connection.sourceId) || !elementMap.has(connection.targetId)) fail(`relationship ${connection.id} has a missing endpoint`);
    if (relationKind(connection) && (!classLike(elementMap.get(connection.sourceId)) || !classLike(elementMap.get(connection.targetId)))) {
      fail(`relationship ${connection.id} requires persistible class endpoints`);
    }
  });
  relationalModel.enums.forEach((enumModel) => {
    if (!elementMap.has(enumModel.id)) fail(`enum ${enumModel.name} is missing from the normalized model`);
  });
  if (security.enabled && security.principal && !tableByElement(tables).has(security.principal.id)) {
    fail(`authentication principal ${security.principal.name} has no relational table`);
  }
};

const enumMap = (analysis: UmlAnalysis) => new Map(analysis.relationalModel.enums.map((item) => [item.name.toLowerCase(), item]));

const relationAttribute = (analysis: UmlAnalysis, element: UmlElement, attribute: UmlElement['structuredAttributes'][number]) => {
  const type = attribute.sourceType.replace(/<.*>|\[\]$/g, '').trim().toLowerCase();
  const target = analysis.normalizedModel.elements.find((candidate) => candidate.name.toLowerCase() === type);
  return Boolean(target && analysis.normalizedModel.relationships.some((connection) => relationKind(connection) && ((connection.sourceId === element.id && connection.targetId === target.id) || (connection.targetId === element.id && connection.sourceId === target.id))));
};

const validateAttributes = (analysis: UmlAnalysis, tableMap: Map<string, Table>, security: SecurityResolution) => {
  const enums = enumMap(analysis);
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  tableMap.forEach((table, elementId) => {
    const element = elements.get(elementId);
    if (!element) fail(`relational table ${table.name} has no normalized element`);
    element.structuredAttributes.forEach((attribute) => {
      if (baseEntityAttributes.has(attribute.canonicalName)) return;
      const baseType = attribute.sourceType.replace(/<.*>|\[\]$/g, '').trim();
      const supported = ['String', 'Integer', 'Long', 'Float', 'Double', 'BigDecimal', 'Boolean', 'LocalDate', 'LocalDateTime', 'UUID'].includes(attribute.javaType) || enums.has(baseType.toLowerCase());
      const isCollection = /^(List|Set|Map|Array)</i.test(attribute.javaType);
      if ((!supported || isCollection) && !relationAttribute(analysis, element, attribute)) {
        fail(`unsupported class-valued or collection attribute ${element.name}.${attribute.sourceName}`);
      }
      const column = table.columns.find((candidate) => candidate.sourceName === attribute.sourceName || candidate.canonicalName === attribute.canonicalName);
      if (!column && !relationAttribute(analysis, element, attribute)) fail(`attribute ${element.name}.${attribute.sourceName} has no relational column`);
    });
  });
  if (security.enabled && security.principal) {
    [security.loginField, security.credentialField].forEach((field) => {
      const attribute = security.principal!.structuredAttributes.find((candidate) => candidate.canonicalName === field);
      if (!attribute || relationAttribute(analysis, security.principal!, attribute) || /^(List|Set|Map|Array)</i.test(attribute.javaType)) fail(`authentication field ${security.principal!.name}.${field} must be a scalar persistence attribute`);
    });
  }
};

const addMember = (members: Map<string, Member[]>, elementId: string, member: Member) => {
  const current = members.get(elementId) || [];
  if (current.some((item) => item.name === member.name)) fail(`ambiguous relationship field ${elementId}.${member.name}`);
  current.push(member);
  members.set(elementId, current);
};

const relationMemberImports = (basePackage: string, element: UmlElement) => [`${basePackage}.${featurePackageName(element.name)}.${entityName(element)}`];

const addManyToOne = (members: Map<string, Member[]>, basePackage: string, owner: UmlElement, target: UmlElement, column: string, nullable: boolean) => {
  const field = fieldFromColumn(column);
  addMember(members, owner.id, {
    name: field,
    type: entityName(target),
    imports: relationMemberImports(basePackage, target),
    annotations: [`@ManyToOne`, `@JoinColumn(name = "${column}", nullable = ${nullable})`],
  });
  return field;
};

const addCollection = (members: Map<string, Member[]>, basePackage: string, owner: UmlElement, target: UmlElement, field: string, annotation: string, cascade = false) => {
  const annotations = [annotation];
  if (cascade) annotations[0] = `${annotation.slice(0, -1)}, cascade = CascadeType.ALL, orphanRemoval = true)`;
  addMember(members, owner.id, { name: field, type: `List<${entityName(target)}>`, imports: ['java.util.List', ...relationMemberImports(basePackage, target)], annotations });
};

const addRelationships = (analysis: UmlAnalysis, basePackage: string, members: Map<string, Member[]>, tableMap: Map<string, Table>) => {
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  const tables = new Map(analysis.relationalModel.tables.map((table) => [table.name, table]));
  const joinTables: JoinTable[] = [];
  const syntheticColumns: SyntheticColumn[] = [];
  const syntheticForeignKeys: RelationalForeignKey[] = [];
  const associationPairs: Array<{ table: string; columns: string[] }> = [];
  const usedJoins = new Set<string>();

  analysis.normalizedModel.relationships.filter(relationKind).forEach((connection) => {
    const source = elements.get(connection.sourceId)!;
    const target = elements.get(connection.targetId)!;
    const sourceTable = tableMap.get(source.id)!;
    const targetTable = tableMap.get(target.id)!;
    const relational = relationship(analysis, connection.id);
    if (!relational) fail(`relationship ${connection.id} is missing from the relational model`);

    if (connection.associationClassId) {
      const association = elements.get(connection.associationClassId);
      const associationTable = tableMap.get(connection.associationClassId);
      if (!association || !associationTable) fail(`association class for ${connection.id} is missing a relational table`);
      if (relational.foreignKeys.length !== 2) fail(`association class ${association.name} for ${connection.id} must have exactly two foreign keys`);
      const fields = relational.foreignKeys.map((foreignKey) => {
        const targetElement = elements.get([...tableMap.entries()].find(([, table]) => table.name === foreignKey.referencedTable)?.[0] || '');
        if (!targetElement) fail(`association class ${association.name} references a missing endpoint`);
        const field = addManyToOne(members, basePackage, association, targetElement, foreignKey.column, false);
        const endpoint = [...tableMap.entries()].find(([, table]) => table.name === foreignKey.referencedTable)?.[0];
        const endpointElement = endpoint ? elements.get(endpoint) : undefined;
        if (!endpointElement) fail(`association class ${association.name} has a missing inverse endpoint`);
        addCollection(members, basePackage, endpointElement, association, featureName(association.name), `@OneToMany(mappedBy = "${field}")`);
        return foreignKey.column;
      });
      associationPairs.push({ table: associationTable.name, columns: fields.sort() });
      return;
    }

    const sourceMany = collection(connection.source);
    const targetMany = collection(connection.target);
    if (sourceMany && targetMany) {
      const sortedTables = [sourceTable.name, targetTable.name].sort();
      const baseName = relational.joinTable || `${sortedTables[0]}_${sortedTables[1]}`;
      const joinName = usedJoins.has(baseName) ? `${baseName}_${snake(connection.id)}` : baseName;
      if (!/^[a-z][a-z0-9_]*$/.test(joinName)) fail(`many-to-many relationship ${connection.id} has an unsafe join table name`);
      usedJoins.add(joinName);
      const sourceField = featureName(target.name);
      const targetField = featureName(source.name);
      addMember(members, source.id, {
        name: sourceField,
        type: `List<${entityName(target)}>`,
        imports: ['java.util.List', ...relationMemberImports(basePackage, target)],
        annotations: [`@ManyToMany`, `@JoinTable(name = "${joinName}", joinColumns = @JoinColumn(name = "${sourceTable.name}_id"), inverseJoinColumns = @JoinColumn(name = "${targetTable.name}_id"))`],
      });
      addMember(members, target.id, {
        name: targetField,
        type: `List<${entityName(source)}>`,
        imports: ['java.util.List', ...relationMemberImports(basePackage, source)],
        annotations: [`@ManyToMany(mappedBy = "${sourceField}")`],
      });
      joinTables.push({ name: joinName, sourceTable: sourceTable.name, targetTable: targetTable.name, sourceColumn: `${sourceTable.name}_id`, targetColumn: `${targetTable.name}_id` });
      return;
    }

    if (connection.source.lower === null || connection.target.lower === null) fail(`relationship ${connection.id} has empty or ambiguous ownership multiplicities`);
    if (!sourceMany && !targetMany) {
      const sourceOwner = connection.sourceNavigable === true && connection.targetNavigable !== true;
      const targetOwner = connection.targetNavigable === true && connection.sourceNavigable !== true;
      const implicitSourceOwner = connection.sourceNavigable === undefined && connection.targetNavigable === undefined;
      if (!implicitSourceOwner && sourceOwner === targetOwner) fail(`one-to-one relationship ${connection.id} has ambiguous ownership; mark exactly one end navigable`);
      const owner = implicitSourceOwner || sourceOwner ? source : target;
      const referenced = implicitSourceOwner || sourceOwner ? target : source;
      const ownerTable = implicitSourceOwner || sourceOwner ? sourceTable : targetTable;
      const referencedTable = implicitSourceOwner || sourceOwner ? targetTable : sourceTable;
      const column = `${referencedTable.name}_id`;
      if (ownerTable.columns.some((candidate) => candidate.name === column && candidate.source === 'attribute')) fail(`relationship ${connection.id} conflicts with attribute column ${ownerTable.name}.${column}`);
      const nullable = (implicitSourceOwner || sourceOwner ? connection.target : connection.source).lower === 0;
      const ownerField = addManyToOne(members, basePackage, owner, referenced, column, nullable);
      const ownerMember = members.get(owner.id)!.find((member) => member.name === ownerField)!;
      ownerMember.annotations = connection.type === 'composition'
        ? ['@OneToOne(cascade = CascadeType.ALL, orphanRemoval = true)', `@JoinColumn(name = "${column}", nullable = ${nullable})`]
        : ['@OneToOne', `@JoinColumn(name = "${column}", nullable = ${nullable})`];
      addMember(members, referenced.id, { name: camel(owner.name), type: entityName(owner), imports: relationMemberImports(basePackage, owner), annotations: [`@OneToOne(mappedBy = "${ownerField}")`] });
      syntheticColumns.push({ table: ownerTable.name, column, nullable });
      syntheticForeignKeys.push({ table: ownerTable.name, column, referencedTable: referencedTable.name, referencedColumn: 'id', sourceType: 'UUID', javaType: 'UUID' });
      return;
    }

    if (sourceMany === targetMany) fail(`relationship ${connection.id} has ambiguous ownership`);
    if (relational.foreignKeys.length !== 1) fail(`relationship ${connection.id} must provide exactly one relational foreign key`);
    const foreignKey = relational.foreignKeys[0];
    const foreignTableId = [...tableMap.entries()].find(([, table]) => table.name === foreignKey.table)?.[0];
    const referencedTableId = [...tableMap.entries()].find(([, table]) => table.name === foreignKey.referencedTable)?.[0];
    const foreignElement = foreignTableId ? elements.get(foreignTableId) : undefined;
    const referencedElement = referencedTableId ? elements.get(referencedTableId) : undefined;
    if (!foreignElement || !referencedElement) fail(`relationship ${connection.id} has a foreign key endpoint missing from the normalized model`);
    const foreignColumn = tables.get(foreignKey.table)?.columns.find((column) => column.name === foreignKey.column);
    const field = addManyToOne(members, basePackage, foreignElement, referencedElement, foreignKey.column, foreignColumn?.nullable !== false);
    const inverseField = featureName(foreignElement.name);
    addCollection(members, basePackage, referencedElement, foreignElement, inverseField, `@OneToMany(mappedBy = "${field}")`, connection.type === 'composition');
  });

  return { joinTables, syntheticColumns, syntheticForeignKeys, associationPairs };
};

const scalarMember = (basePackage: string, element: UmlElement, table: Table, attribute: UmlElement['structuredAttributes'][number], enums: Map<string, RelationalModel['enums'][number]>, security: SecurityResolution): Member | null => {
  if (baseEntityAttributes.has(attribute.canonicalName)) return null;
  const column = table.columns.find((candidate) => candidate.sourceName === attribute.sourceName || candidate.canonicalName === attribute.canonicalName);
  if (!column) return null;
  const annotations = [`@Column(name = "${column.name}", nullable = ${column.nullable}${security.principal?.id === element.id && security.loginField === attribute.canonicalName ? ', unique = true' : ''})`];
  const imports: string[] = [];
  const enumModel = enums.get(attribute.sourceType.toLowerCase());
  if (enumModel) {
    annotations.unshift('@Enumerated(EnumType.STRING)');
    imports.push(`${basePackage}.common.enums.${enumModel.name}`);
  } else if (scalarImports[attribute.javaType]) imports.push(scalarImports[attribute.javaType]);
  if (security.principal?.id === element.id && security.credentialField === attribute.canonicalName) {
    annotations.unshift('@JsonIgnore');
  }
  return { name: attribute.canonicalName, type: attribute.javaType, annotations, imports };
};

const renderEnum = (basePackage: string, enumModel: RelationalModel['enums'][number]) => {
  const packageName = `${basePackage}.common.enums`;
  return {
    path: `src/main/java/${packagePath(packageName)}/${enumModel.name}.java`,
    source: `package ${packageName};\n\npublic enum ${enumModel.name} {\n${enumModel.literals.map((literal) => `    ${literal}`).join(',\n')}\n}\n`,
  };
};

const renderEntity = (basePackage: string, element: UmlElement, table: Table, members: Member[], parent: UmlElement | undefined, hasChildren: boolean, elements: UmlElement[], relationships: UmlConnection[]) => {
  const packageName = `${basePackage}.${featurePackageName(element.name)}`;
  const imports = new Set<string>(['jakarta.persistence.Column', 'jakarta.persistence.Entity', 'jakarta.persistence.Table', `${basePackage}.common.entity.BaseEntity`]);
  if (parent) imports.add(`${basePackage}.${featurePackageName(parent.name)}.${entityName(parent)}`);
  if (hasChildren) { imports.add('jakarta.persistence.Inheritance'); imports.add('jakarta.persistence.InheritanceType'); }
  members.forEach((member) => member.imports.filter(Boolean).forEach((item) => imports.add(item.includes('.') && !item.startsWith('jakarta.') && !item.startsWith('java.') && !item.startsWith('com.') ? item : item)));
  members.forEach((member) => member.annotations.forEach((annotation) => {
    if (annotation.includes('@Enumerated')) { imports.add('jakarta.persistence.EnumType'); imports.add('jakarta.persistence.Enumerated'); }
    if (annotation.includes('@ManyToOne')) { imports.add('jakarta.persistence.ManyToOne'); }
    if (annotation.includes('@OneToMany')) { imports.add('jakarta.persistence.OneToMany'); }
    if (annotation.includes('@OneToOne')) { imports.add('jakarta.persistence.OneToOne'); }
    if (annotation.includes('@ManyToMany')) { imports.add('jakarta.persistence.ManyToMany'); }
    if (annotation.includes('@JoinColumn')) { imports.add('jakarta.persistence.JoinColumn'); }
    if (annotation.includes('@JoinTable')) { imports.add('jakarta.persistence.JoinTable'); }
    if (annotation.includes('CascadeType')) imports.add('jakarta.persistence.CascadeType');
    if (annotation.includes('@JsonIgnore')) imports.add('com.fasterxml.jackson.annotation.JsonIgnore');
  }));
  const javaImports = new Set<string>();
  members.forEach((member) => member.imports.forEach((item) => {
    if (item.startsWith('java.') || item.startsWith('com.') || item.startsWith(`${basePackage}.`)) javaImports.add(item);
  }));
  javaImports.forEach((item) => imports.add(item));
  const relationship = relationshipDeclaration(element, elements, relationships, basePackage, 'BaseEntity');
  operationImports(element, elements, relationships, basePackage).forEach((item) => imports.add(item));
  relationship.imports.forEach((item) => imports.add(item));
  const extendsType = relationship.extendsType || (parent ? entityName(parent) : 'BaseEntity');
  const inheritance = hasChildren ? '@Inheritance(strategy = InheritanceType.JOINED)\n' : '';
  const fields = members.map((member) => `${member.annotations.map((annotation) => `    ${annotation}\n`).join('')}    public ${member.type} ${member.name};`).join('\n\n');
  const methods = renderOperations(element, elements, relationships);
  const classModifier = element.kind === 'abstract' || isPromotedAbstract(element) ? 'abstract ' : '';
  const classDeclaration = `public ${classModifier}class ${entityName(element)} extends ${extendsType}${relationship.implementsTypes.length ? ` implements ${relationship.implementsTypes.join(', ')}` : ''}`;
  return `package ${packageName};\n\n${[...imports].filter((item) => item && !item.startsWith(`${packageName}.`)).sort().map((item) => `import ${item};`).join('\n')}\n\n@Entity\n@Table(name = "${table.name}")\n${inheritance}${classDeclaration} {\n${[fields, methods].filter(Boolean).join('\n\n')}\n}\n`;
};

const renderRepository = (basePackage: string, element: UmlElement) => {
  const packageName = `${basePackage}.${featurePackageName(element.name)}`;
  return {
    path: `src/main/java/${packagePath(packageName)}/${element.name}Repository.java`,
    source: `package ${packageName};\n\nimport ${packageName}.${entityName(element)};\nimport java.util.UUID;\nimport org.springframework.data.jpa.repository.JpaRepository;\nimport org.springframework.stereotype.Repository;\n\n@Repository\npublic interface ${element.name}Repository extends JpaRepository<${entityName(element)}, UUID> {\n}\n`,
  };
};

const sqlType = (column: RelationalColumn, enums: Map<string, RelationalModel['enums'][number]>) => {
  if (column.enumName || enums.has(column.sourceType.toLowerCase())) return 'VARCHAR(255)';
  switch (column.javaType) {
    case 'UUID': return 'UUID';
    case 'Integer': return 'INTEGER';
    case 'Long': return 'BIGINT';
    case 'Float': return 'REAL';
    case 'Double': return 'DOUBLE PRECISION';
    case 'BigDecimal': return 'NUMERIC';
    case 'Boolean': return 'BOOLEAN';
    case 'LocalDate': return 'DATE';
    case 'LocalDateTime': return 'TIMESTAMP(6) WITHOUT TIME ZONE';
    case 'String': return 'VARCHAR(255)';
    default: fail(`unsupported SQL type ${column.javaType} for ${column.name}`);
  }
};

const renderMigration = (analysis: UmlAnalysis, security: SecurityResolution, syntheticColumns: SyntheticColumn[], syntheticForeignKeys: RelationalForeignKey[], joinTables: JoinTable[], associationPairs: Array<{ table: string; columns: string[] }>) => {
  const enums = enumMap(analysis);
  const tables = [...analysis.relationalModel.tables].sort((a, b) => a.name.localeCompare(b.name));
  const foreignKeys = [...analysis.relationalModel.relationships.flatMap((relation) => relation.foreignKeys), ...syntheticForeignKeys];
  const foreignKeyMap = new Map(foreignKeys.map((foreignKey) => [`${foreignKey.table}.${foreignKey.column}.${foreignKey.referencedTable}`, foreignKey]));
  const lines: string[] = [];
  tables.forEach((table) => {
    const columns = table.columns.filter((column) => !['created_at', 'updated_at'].includes(column.name)).sort((a, b) => (a.name === 'id' ? -1 : b.name === 'id' ? 1 : a.name.localeCompare(b.name)));
    const definitions = new Map<string, string>();
    columns.forEach((column) => {
      const nullable = column.name === 'id' || column.primaryKey ? false : column.nullable;
      definitions.set(column.name, `    ${column.name} ${sqlType(column, enums)}${nullable ? '' : ' NOT NULL'}`);
    });
    syntheticColumns.filter((column) => column.table === table.name && !definitions.has(column.column)).forEach((column) => definitions.set(column.column, `    ${column.column} UUID${column.nullable ? '' : ' NOT NULL'}`));
    definitions.set('created_at', '    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL');
    definitions.set('updated_at', '    updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL');
    definitions.set('__pk__', `    CONSTRAINT pk_${table.name} PRIMARY KEY (id)`);
    const login = security.enabled && security.principal?.id === table.sourceElementId ? table.columns.find((column) => column.canonicalName === security.loginField) : undefined;
    if (login) definitions.set('__login__', `    CONSTRAINT uk_${table.name}_${login.name} UNIQUE (${login.name})`);
    associationPairs.filter((pair) => pair.table === table.name).forEach((pair) => definitions.set(`__assoc_${pair.columns.join('_')}`, `    CONSTRAINT uk_${table.name}_${pair.columns.join('_')} UNIQUE (${pair.columns.join(', ')})`));
    [...foreignKeyMap.values()].filter((foreignKey) => foreignKey.table === table.name).sort((a, b) => a.column.localeCompare(b.column)).forEach((foreignKey) => definitions.set(`__fk_${foreignKey.column}_${foreignKey.referencedTable}`, `    CONSTRAINT fk_${table.name}_${foreignKey.column}_${foreignKey.referencedTable} FOREIGN KEY (${foreignKey.column}) REFERENCES ${foreignKey.referencedTable} (id)`));
    lines.push(`CREATE TABLE ${table.name} (\n${[...definitions.values()].join(',\n')}\n);`);
    table.columns.filter((column) => column.enumName).forEach((column) => {
      const enumModel = enums.get(column.enumName!.toLowerCase());
      if (enumModel) lines.push(`ALTER TABLE ${table.name} ADD CONSTRAINT ck_${table.name}_${column.name}_enum CHECK (${column.name} IN (${enumModel.literals.map((literal) => `'${literal}'`).join(', ')}));`);
    });
  });
  joinTables.sort((a, b) => a.name.localeCompare(b.name)).forEach((join) => {
    lines.push(`CREATE TABLE ${join.name} (\n    ${join.sourceColumn} UUID NOT NULL,\n    ${join.targetColumn} UUID NOT NULL,\n    CONSTRAINT pk_${join.name} PRIMARY KEY (${join.sourceColumn}, ${join.targetColumn}),\n    CONSTRAINT fk_${join.name}_${join.sourceTable} FOREIGN KEY (${join.sourceColumn}) REFERENCES ${join.sourceTable} (id),\n    CONSTRAINT fk_${join.name}_${join.targetTable} FOREIGN KEY (${join.targetColumn}) REFERENCES ${join.targetTable} (id)\n);`);
  });
  [...foreignKeyMap.values()].sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`)).forEach((foreignKey) => lines.push(`CREATE INDEX idx_${foreignKey.table}_${foreignKey.column} ON ${foreignKey.table} (${foreignKey.column});`));
  joinTables.sort((a, b) => a.name.localeCompare(b.name)).forEach((join) => lines.push(`CREATE INDEX idx_${join.name}_${join.sourceColumn} ON ${join.name} (${join.sourceColumn});`));
  return `${lines.join('\n\n')}\n`;
};

export function generatePersistence(analysis: UmlAnalysis, basePackage: string, security: SecurityResolution): GeneratedPersistenceFile[] {
  validateModel(analysis, security);
  const tables = analysis.relationalModel.tables;
  const tableMap = tableByElement(tables);
  const inheritance = validateInheritance(analysis, tableMap);
  validateAttributes(analysis, tableMap, security);
  const members = new Map<string, Member[]>();
  const enums = enumMap(analysis);
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  tables.forEach((table) => {
    const element = elements.get(table.sourceElementId);
    if (!element || !classLike(element)) fail(`table ${table.name} has no concrete or inherited UML class`);
    const scalarMembers = element.structuredAttributes.map((attribute) => scalarMember(basePackage, element, table, attribute, enums, security)).filter((member): member is Member => Boolean(member));
    scalarMembers.forEach((member) => addMember(members, element.id, member));
  });
  const relationArtifacts = addRelationships(analysis, basePackage, members, tableMap);
  const children = new Set([...inheritance.values()]);
  const files: GeneratedPersistenceFile[] = [];
  const paths = new Set<string>();
  const addFile = (file: GeneratedPersistenceFile) => {
    if (paths.has(file.path)) fail(`duplicate generated path ${file.path}`);
    paths.add(file.path);
    files.push(file);
  };
  tables.sort((a, b) => a.name.localeCompare(b.name)).forEach((table) => {
    const element = elements.get(table.sourceElementId)!;
    const parent = inheritance.get(element.id) ? elements.get(inheritance.get(element.id)!) : undefined;
    addFile({ path: `src/main/java/${packagePath(`${basePackage}.${featurePackageName(element.name)}`)}/${entityName(element)}.java`, source: renderEntity(basePackage, element, table, members.get(element.id) || [], parent, children.has(element.id), analysis.normalizedModel.elements, analysis.normalizedModel.relationships) });
  });
  analysis.relationalModel.enums.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((enumModel) => addFile(renderEnum(basePackage, enumModel)));
  tables.filter((table) => {
    const element = elements.get(table.sourceElementId);
    return element?.kind === 'class' && !isPromotedAbstract(element) && element.id !== security.principal?.id;
  }).sort((a, b) => a.name.localeCompare(b.name)).forEach((table) => addFile(renderRepository(basePackage, elements.get(table.sourceElementId)!)));
  addFile({ path: 'src/main/resources/db/migration/V1__model.sql', source: renderMigration(analysis, security, relationArtifacts.syntheticColumns, relationArtifacts.syntheticForeignKeys, relationArtifacts.joinTables, relationArtifacts.associationPairs) });
  return files;
}

export const generatePersistenceModel = generatePersistence;
