import { featurePackageName } from './feature-name';
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

const implementationSource = (basePackage: string, element: UmlElement) => {
  const packageName = servicePackage(basePackage, element);
  const feature = featurePackage(basePackage, element);
  const dto = dtoPackage(basePackage, element);
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
    '',
    `    public ${element.name}ServiceImpl(${element.name}Repository repository, ${element.name}Mapper mapper) {`,
    '        this.repository = repository;',
    '        this.mapper = mapper;',
    '    }',
    '',
    '    @Override',
    `    public ${element.name}ResponseDto create(Create${element.name}Dto dto) {`,
    '        return mapper.toResponse(repository.save(mapper.toEntity(dto)));',
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

const repositoryTables = (analysis: UmlAnalysis, security: SecurityResolution) => {
  const elements = new Map(analysis.normalizedModel.elements.map((element) => [element.id, element]));
  return analysis.relationalModel.tables
    .map((table) => ({ table, element: elements.get(table.sourceElementId) }))
    .filter((item): item is { table: Table; element: UmlElement } => item.element?.kind === 'class' && !isPromotedAbstract(item.element) && item.element.id !== security.principal?.id)
    .sort((a, b) => a.table.name.localeCompare(b.table.name));
};

export function generateServices(analysis: UmlAnalysis, basePackage: string, security: SecurityResolution): GeneratedServiceFile[] {
  return repositoryTables(analysis, security).flatMap(({ element }) => [
    {
      path: `src/main/java/${packagePath(servicePackage(basePackage, element))}/${element.name}Service.java`,
      source: contractSource(basePackage, element),
    },
    {
      path: `src/main/java/${packagePath(servicePackage(basePackage, element))}/${element.name}ServiceImpl.java`,
      source: implementationSource(basePackage, element),
    },
  ]);
}
