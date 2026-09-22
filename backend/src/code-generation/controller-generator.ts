import { featurePackageName } from './feature-name';
import { SecurityResolution } from './security-resolution';
import { eligibleCrudElements } from './service-generator';
import { UmlAnalysis } from './uml-analysis';

export type GeneratedControllerFile = { path: string; source: string };

const packagePath = (packageName: string) => packageName.replace(/\./g, '/');
const featurePackage = (basePackage: string, name: string) => `${basePackage}.${featurePackageName(name)}`;
const dtoPackage = (basePackage: string, name: string) => `${featurePackage(basePackage, name)}.dto`;
const servicePackage = (basePackage: string, name: string) => `${featurePackage(basePackage, name)}.service`;
const renderImports = (imports: Set<string>) => [...imports].sort().map((item) => `import ${item};`).join('\n');
const content = ', content = @Content(schema = @Schema(implementation = ResponseMessage.class))';

const apiResponses = (successCode: string, successDescription: string, security: boolean, notFound = false, noContent = false) => {
  const responses = [
    `    @ApiResponse(responseCode = "${successCode}", description = "${successDescription}"${noContent ? '' : content})`,
    `    @ApiResponse(responseCode = "400", description = "Invalid request or validation error"${content})`,
  ];
  if (notFound) responses.push(`    @ApiResponse(responseCode = "404", description = "Resource not found"${content})`);
  if (security) {
    responses.push(`    @ApiResponse(responseCode = "401", description = "Authentication required"${content})`);
    responses.push(`    @ApiResponse(responseCode = "403", description = "Access denied"${content})`);
  }
  return ['@ApiResponses({', `${responses.join(',\n')}`, '})'].join('\n');
};

const renderController = (basePackage: string, name: string, security: SecurityResolution) => {
  const feature = featurePackage(basePackage, name);
  const dto = dtoPackage(basePackage, name);
  const service = servicePackage(basePackage, name);
  const route = `/${featurePackageName(name)}`;
  const imports = new Set([
    `${dto}.Create${name}Dto`,
    `${dto}.${name}ResponseDto`,
    `${dto}.Update${name}Dto`,
    `${service}.${name}Service`,
    `${basePackage}.common.utils.ResponseMessage`,
    'io.swagger.v3.oas.annotations.Operation',
    'io.swagger.v3.oas.annotations.Parameter',
    'io.swagger.v3.oas.annotations.media.Content',
    'io.swagger.v3.oas.annotations.media.Schema',
    'io.swagger.v3.oas.annotations.responses.ApiResponse',
    'io.swagger.v3.oas.annotations.responses.ApiResponses',
    'io.swagger.v3.oas.annotations.tags.Tag',
    'jakarta.validation.Valid',
    'java.util.List',
    'java.util.UUID',
    'org.springframework.http.HttpStatus',
    'org.springframework.http.ResponseEntity',
    'org.springframework.web.bind.annotation.DeleteMapping',
    'org.springframework.web.bind.annotation.GetMapping',
    'org.springframework.web.bind.annotation.PathVariable',
    'org.springframework.web.bind.annotation.PostMapping',
    'org.springframework.web.bind.annotation.PutMapping',
    'org.springframework.web.bind.annotation.RequestBody',
    'org.springframework.web.bind.annotation.RequestMapping',
    'org.springframework.web.bind.annotation.RestController',
  ]);
  if (security.enabled) imports.add('io.swagger.v3.oas.annotations.security.SecurityRequirement');

  const securityAnnotation = security.enabled ? '@SecurityRequirement(name = "bearer-key")\n' : '';
  return [
    `package ${feature}.controller;`,
    '',
    renderImports(imports),
    '',
    '@RestController',
    `@RequestMapping("${route}")`,
    `@Tag(name = "${name}", description = "CRUD operations for ${name}")`,
    securityAnnotation.trimEnd(),
    `public class ${name}Controller {`,
    `    private final ${name}Service service;`,
    '',
    `    public ${name}Controller(${name}Service service) {`,
    '        this.service = service;',
    '    }',
    '',
    '    @PostMapping',
    `    @Operation(summary = "Create ${name}", description = "Creates a new ${name} resource.")`,
    `    ${apiResponses('201', 'Resource created', security.enabled)}`,
    `    public ResponseEntity<ResponseMessage<${name}ResponseDto>> create${name}(`,
    `        @io.swagger.v3.oas.annotations.parameters.RequestBody(description = "${name} creation payload", required = true) @Valid @RequestBody Create${name}Dto dto) {`,
     `        return ResponseEntity.status(HttpStatus.CREATED).body(ResponseMessage.success(HttpStatus.CREATED.value(), service.create(dto), "${name} created", 1));`,
    '    }',
    '',
    '    @GetMapping',
    `    @Operation(summary = "List ${name} resources", description = "Returns all ${name} resources.")`,
    `    ${apiResponses('200', 'Resources returned', security.enabled)}`,
    `    public ResponseEntity<ResponseMessage<List<${name}ResponseDto>>> getMany${name}s() {`,
    `        List<${name}ResponseDto> items = service.getMany();`,
    '        return ResponseEntity.ok(ResponseMessage.success(items, "Resources returned", items.size()));',
    '    }',
    '',
    '    @GetMapping("/{id}")',
    `    @Operation(summary = "Get one ${name}", description = "Returns one ${name} resource by UUID.")`,
    `    ${apiResponses('200', 'Resource returned', security.enabled, true)}`,
    `    public ResponseEntity<?> get${name}(`,
    `        @Parameter(description = "${name} UUID", required = true, schema = @Schema(format = "uuid")) @PathVariable UUID id) {`,
    `        var item = service.getOne(id);`,
    `        if (item.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ResponseMessage.error("${name} not found", HttpStatus.NOT_FOUND.value()));`,
    `        return ResponseEntity.ok(ResponseMessage.success(item.get(), "Resource returned", 1));`,
    '    }',
    '',
    '    @PutMapping("/{id}")',
    `    @Operation(summary = "Update ${name}", description = "Updates one ${name} resource by UUID.")`,
    `    ${apiResponses('200', 'Resource updated', security.enabled, true)}`,
    `    public ResponseEntity<?> update${name}(`,
    `        @Parameter(description = "${name} UUID", required = true, schema = @Schema(format = "uuid")) @PathVariable UUID id,`,
    `        @io.swagger.v3.oas.annotations.parameters.RequestBody(description = "${name} update payload", required = true) @Valid @RequestBody Update${name}Dto dto) {`,
    `        var item = service.edit(id, dto);`,
    `        if (item.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ResponseMessage.error("${name} not found", HttpStatus.NOT_FOUND.value()));`,
    `        return ResponseEntity.ok(ResponseMessage.success(item.get(), "Resource updated", 1));`,
    '    }',
    '',
    '    @DeleteMapping("/{id}")',
    `    @Operation(summary = "Delete ${name}", description = "Deletes one ${name} resource by UUID.")`,
    `    ${apiResponses('204', 'Resource deleted', security.enabled, true, true)}`,
    `    public ResponseEntity<?> delete${name}(`,
    `        @Parameter(description = "${name} UUID", required = true, schema = @Schema(format = "uuid")) @PathVariable UUID id) {`,
    `        if (!service.delete(id)) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ResponseMessage.error("${name} not found", HttpStatus.NOT_FOUND.value()));`,
    '        return ResponseEntity.noContent().build();',
    '    }',
    '}',
    '',
  ].filter((line) => line !== '').join('\n');
};

export function generateControllers(analysis: UmlAnalysis, basePackage: string, security: SecurityResolution): GeneratedControllerFile[] {
  return eligibleCrudElements(analysis, security).map(({ element }) => ({
    path: `src/main/java/${packagePath(`${featurePackage(basePackage, element.name)}.controller`)}/${element.name}Controller.java`,
    source: renderController(basePackage, element.name, security),
  }));
}
