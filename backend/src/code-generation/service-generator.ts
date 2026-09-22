import { featurePackageName } from './feature-name';
import { GeneratedRelation, generatedRelationFields } from './dto-generator';
import { RelationalModel, UmlAnalysis, UmlElement } from './uml-analysis';
import { SecurityResolution } from './security-resolution';
import { isPromotedAbstract } from './uml-java';

export type GeneratedServiceFile = { path: string; source: string };

type Table = RelationalModel['tables'][number];

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const dtoPackage = (basePackage: string, element: UmlElement) => `${basePackage}.${featurePackageName(element.name)}.dto`;
const mapperPackage = (basePackage: string, element: UmlElement) => `${basePackage}.${featurePackageName(element.name)}.mapper`;
const featurePackage = (basePackage: string, element: UmlElement) => `${basePackage}.${featurePackageName(element.name)}`;
const servicePackage = (basePackage: string, element: UmlElement) => `${featurePackage(basePackage, element)}.service`;

const renderImports = (imports: Set<string>) => [...imports].sort().map((item) => `import ${item};`).join('\n');

const repositoryVariable = (element: UmlElement) => `${element.name.charAt(0).toLowerCase()}${element.name.slice(1)}Repository`;
const relationDtoName = (relation: GeneratedRelation) => `${relation.fieldName}${relation.collection ? 'Ids' : 'Id'}`;

const relationRepositories = (relations: GeneratedRelation[]) => [...new Map(
  relations.filter((relation) => relation.writable).map((relation) => [relation.target.id, relation.target]),
).values()].sort((a, b) => a.name.localeCompare(b.name));

const resolveRelation = (relation: GeneratedRelation, phase: 'create' | 'update') => {
  const dtoField = relationDtoName(relation);
  const repository = repositoryVariable(relation.target);
  const error = `(relationId) -> ${repository}.findById(relationId).orElseThrow(() -> new IllegalArgumentException("${relation.target.name} not found: " + relationId))`;
  if (relation.collection) {
    return `        if (dto.${dtoField} != null) entity.${relation.fieldName} = dto.${dtoField}.stream().map(${error}).toList();`;
  }
  if (phase === 'create' && relation.required) {
    return [
      `        if (dto.${dtoField} == null) throw new IllegalArgumentException("${dtoField} is required");`,
      `        entity.${relation.fieldName} = ${repository}.findById(dto.${dtoField}).orElseThrow(() -> new IllegalArgumentException("${relation.target.name} not found: " + dto.${dtoField}));`,
    ].join('\n');
  }
  return `        if (dto.${dtoField} != null) entity.${relation.fieldName} = ${repository}.findById(dto.${dtoField}).orElseThrow(() -> new IllegalArgumentException("${relation.target.name} not found: " + dto.${dtoField}));`;
};

const contractSource = (basePackage: string, element: UmlElement) => {
  const packageName = servicePackage(basePackage, element);
  const dto = dtoPackage(basePackage, element);
  const imports = new Set([
    `${dto}.Create${element.name}Dto`,
    `${dto}.Update${element.name}Dto`,
    `${dto}.${element.name}ResponseDto`,
    'java.util.List',
    'java.util.Optional',
    'java.util.UUID',
  ]);
  return [
    `package ${packageName};`,
    '',
    renderImports(imports),
    '',
    `public interface ${element.name}Service {`,
    `    ${element.name}ResponseDto create(Create${element.name}Dto dto);`,
    '    boolean delete(UUID id);',
    `    Optional<${element.name}ResponseDto> edit(UUID id, Update${element.name}Dto dto);`,
    `    Optional<${element.name}ResponseDto> getOne(UUID id);`,
    `    List<${element.name}ResponseDto> getMany();`,
    '}',
    '',
  ].join('\n');
};

const implementationSource = (basePackage: string, element: UmlElement, relations: GeneratedRelation[]) => {
  const packageName = servicePackage(basePackage, element);
  const feature = featurePackage(basePackage, element);
  const dto = dtoPackage(basePackage, element);
  const writableRelations = relations.filter((relation) => relation.writable);
  const repositories = relationRepositories(relations);
  const imports = new Set([
    `${feature}.${element.name}Repository`,
    `${dto}.Create${element.name}Dto`,
    `${dto}.Update${element.name}Dto`,
    `${dto}.${element.name}ResponseDto`,
    `${mapperPackage(basePackage, element)}.${element.name}Mapper`,
    'java.util.List',
    'java.util.Optional',
    'java.util.UUID',
    'org.springframework.stereotype.Service',
    'org.springframework.transaction.annotation.Transactional',
  ]);
  if (writableRelations.length) imports.add(`${feature}.${element.name}Entity`);
  repositories.forEach((target) => imports.add(`${featurePackage(basePackage, target)}.${target.name}Repository`));
  const repositoryFields = repositories.map((target) => `    private final ${target.name}Repository ${repositoryVariable(target)};`);
  const constructorParameters = [
    `${element.name}Repository repository`,
    `${element.name}Mapper mapper`,
    ...repositories.map((target) => `${target.name}Repository ${repositoryVariable(target)}`),
  ].join(', ');
  const constructorAssignments = [
    '        this.repository = repository;',
    '        this.mapper = mapper;',
    ...repositories.map((target) => `        this.${repositoryVariable(target)} = ${repositoryVariable(target)};`),
  ];
  const createBody = writableRelations.length
    ? [
      `        ${element.name}Entity entity = mapper.toEntity(dto);`,
      ...writableRelations.map((relation) => resolveRelation(relation, 'create')),
      '        return mapper.toResponse(repository.save(entity));',
    ]
    : ['        return mapper.toResponse(repository.save(mapper.toEntity(dto)));'];
  const updateRelations = writableRelations.map((relation) => resolveRelation(relation, 'update'));
  return [
    `package ${packageName};`,
    '',
    renderImports(imports),
    '',
    '@Service',
    '@Transactional',
    `public class ${element.name}ServiceImpl implements ${element.name}Service {`,
    `    private final ${element.name}Repository repository;`,
    `    private final ${element.name}Mapper mapper;`,
    ...repositoryFields,
    '',
    `    public ${element.name}ServiceImpl(${constructorParameters}) {`,
    ...constructorAssignments,
    '    }',
    '',
    '    @Override',
    `    public ${element.name}ResponseDto create(Create${element.name}Dto dto) {`,
    ...createBody,
    '    }',
    '',
    '    @Override',
    '    public boolean delete(UUID id) {',
    '        if (!repository.existsById(id)) return false;',
    '        repository.deleteById(id);',
    '        return true;',
    '    }',
    '',
    '    @Override',
    `    public Optional<${element.name}ResponseDto> edit(UUID id, Update${element.name}Dto dto) {`,
    '        return repository.findById(id).map(entity -> {',
    '            mapper.updateEntity(dto, entity);',
    ...updateRelations,
    '            return mapper.toResponse(repository.save(entity));',
    '        });',
    '    }',
    '',
    '    @Override',
    `    public Optional<${element.name}ResponseDto> getOne(UUID id) {`,
    '        return repository.findById(id).map(mapper::toResponse);',
    '    }',
    '',
    '    @Override',
    `    public List<${element.name}ResponseDto> getMany() {`,
    '        return repository.findAll().stream().map(mapper::toResponse).toList();',
    '    }',
    '}',
    '',
  ].join('\n');
};

export const eligibleCrudElements = (analysis: UmlAnalysis, security: SecurityResolution) => {
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  return analysis.relationalModel.tables
    .map((table) => ({ table, element: elements.get(table.sourceElementId) }))
    .filter((item): item is { table: Table; element: UmlElement } => item.element?.kind === 'class' && !isPromotedAbstract(item.element) && item.element.id !== security.principal?.id)
    .sort((a, b) => a.table.name.localeCompare(b.table.name));
};

export function generateServices(analysis: UmlAnalysis, basePackage: string, security: SecurityResolution): GeneratedServiceFile[] {
  const eligible = eligibleCrudElements(analysis, security);
  const generatedRepositoryIds = new Set(eligible.map(({ element }) => element.id));
  return eligible.flatMap(({ element }) => {
    const relations = generatedRelationFields(analysis, element);
    relations.filter((relation) => relation.writable).forEach((relation) => {
      if (!generatedRepositoryIds.has(relation.target.id)) {
        throw new Error(`Service generation rejected: writable relation ${element.name}.${relation.fieldName} targets ${relation.target.name}, but no repository is generated for ${relation.target.name}`);
      }
    });
    return [
      {
        path: `src/main/java/${packagePath(servicePackage(basePackage, element))}/${element.name}Service.java`,
        source: contractSource(basePackage, element),
      },
      {
        path: `src/main/java/${packagePath(servicePackage(basePackage, element))}/${element.name}ServiceImpl.java`,
        source: implementationSource(basePackage, element, relations),
      },
    ];
  });
}
