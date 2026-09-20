type DiagramElement = {
  id: string;
  name: string;
  attributes?: string[];
  methods?: string[];
  isInterface?: boolean;
  isAbstract?: boolean;
};

type DiagramRelationship = {
  id?: string;
  type?: string;
  source?: string;
  target?: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
};

type SpringBootGeneratorConfig = {
  projectName?: string;
  packageName?: string;
  databaseConfig?: Record<string, unknown>;
  springBootVersion?: string;
  javaVersion?: string;
};

export class SpringBootGenerator {
  config: Required<Pick<SpringBootGeneratorConfig, 'projectName' | 'packageName' | 'springBootVersion' | 'javaVersion'>> & {
    databaseConfig: Record<string, unknown>;
  };

  constructor(config: SpringBootGeneratorConfig) {
    this.config = {
      projectName: config.projectName || 'generated-project',
      packageName: config.packageName || 'com.generated',
      databaseConfig: config.databaseConfig || {},
      springBootVersion: config.springBootVersion || '3.2.0',
      javaVersion: config.javaVersion || '17',
    };
  }

  async generateProject(diagramContent: any) {
    const elements = this.parseDiagramElements(diagramContent);
    const relationships = this.parseDiagramRelationships(diagramContent);
    const structure = this.generateProjectStructure(elements, relationships);

    const files: Record<string, string> = {
      'pom.xml': this.generatePomXml(),
      'src/main/resources/application.properties': this.generateApplicationProperties(),
      'README.md': this.generateReadme(),
      'Dockerfile': this.generateDockerfile(),
      '.gitignore': this.generateGitignore(),
      [`src/main/java/${this.packageToPath()}/${this.toPascalCase(this.config.projectName.replace(/-/g, ''))}Application.java`]: this.generateMainApplication(),
      [`src/main/java/${this.packageToPath()}/config/DatabaseConfig.java`]: this.generateDatabaseConfig(),
      [`src/main/java/${this.packageToPath()}/config/SwaggerConfig.java`]: this.generateSwaggerConfig(),
      [`src/main/java/${this.packageToPath()}/exception/GlobalExceptionHandler.java`]: this.generateGlobalExceptionHandler(),
      [`src/main/java/${this.packageToPath()}/dto/response/ApiResponse.java`]: this.generateApiResponse(),
    };

    elements.forEach((element) => Object.assign(files, this.generateEntity(element, relationships, elements)));
    elements.forEach((element) => Object.assign(files, this.generateDTOs(element)));
    elements.forEach((element) => Object.assign(files, this.generateRepository(element)));
    elements.forEach((element) => Object.assign(files, this.generateService(element)));
    elements.forEach((element) => Object.assign(files, this.generateController(element)));

    return { structure, files };
  }

  parseDiagramElements(diagramContent: any): DiagramElement[] {
    const elements = diagramContent?.elements || diagramContent?.cells || [];
    return elements
      .filter((element: any) => element?.type && (String(element.type).includes('uml.Class') || String(element.type).includes('Class') || element.type === 'uml.Class'))
      .map((element: any) => ({
        id: element.id,
        name: this.sanitizeClassName(element.name || 'UnnamedClass'),
        attributes: Array.isArray(element.attributes) ? element.attributes : [],
        methods: Array.isArray(element.methods) ? element.methods : [],
        isInterface: Boolean(element.name && String(element.name).includes('<<interface>>')),
        isAbstract: Boolean(element.name && String(element.name).includes('<<abstract>>')),
      }));
  }

  parseDiagramRelationships(diagramContent: any): DiagramRelationship[] {
    const links = diagramContent?.links || (diagramContent?.cells && diagramContent.cells.filter((cell: any) => cell?.type && String(cell.type).includes('Link'))) || [];
    return links.map((link: any) => ({
      id: link.id,
      type: link.type,
      source: link.source?.id || link.source,
      target: link.target?.id || link.target,
      sourceMultiplicity: this.extractMultiplicity(link.labels, 0),
      targetMultiplicity: this.extractMultiplicity(link.labels, 1),
    }));
  }

  extractMultiplicity(labels: any, index: number) {
    return labels?.[index]?.attrs?.text?.text || '1';
  }

  sanitizeClassName(name: string) {
    return String(name)
      .replace(/<<interface>>\n|<<abstract>>\n/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^[0-9]/, 'Entity$&') || 'Entity';
  }

  packageToPath() {
    return this.config.packageName.replace(/\./g, '/');
  }

  generateProjectStructure(elements: DiagramElement[], relationships: DiagramRelationship[]) {
    return {
      projectName: this.config.projectName,
      packageName: this.config.packageName,
      entities: elements.map((element) => element.name),
      relationships: relationships.length,
      springBootVersion: this.config.springBootVersion,
      javaVersion: this.config.javaVersion,
    };
  }

  generatePomXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>${this.config.springBootVersion}</version>
    <relativePath/>
  </parent>
  <groupId>${this.config.packageName}</groupId>
  <artifactId>${this.config.projectName}</artifactId>
  <version>1.0.0</version>
  <properties>
    <java.version>${this.config.javaVersion}</java.version>
  </properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
    <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>
  </dependencies>
  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
</project>`;
  }

  generateApplicationProperties() {
    return `spring.application.name=${this.config.projectName}
spring.datasource.url=jdbc:postgresql://localhost:5432/${this.config.projectName}
spring.datasource.username=postgres
spring.datasource.password=postgres
spring.jpa.hibernate.ddl-auto=update
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
springdoc.api-docs.path=/api-docs
springdoc.swagger-ui.path=/swagger-ui.html`;
  }

  generateReadme() {
    return `# ${this.config.projectName}\n\nGenerated Spring Boot project from UML.`;
  }

  generateDockerfile() {
    return `FROM eclipse-temurin:17-jdk\nWORKDIR /app\nCOPY target/*.jar app.jar\nEXPOSE 8080\nENTRYPOINT ["java","-jar","/app/app.jar"]`;
  }

  generateGitignore() {
    return `target/\n.idea/\n*.iml\n*.log`;
  }

  generateMainApplication() {
    const className = `${this.toPascalCase(this.config.projectName.replace(/-/g, ''))}Application`;
    return `package ${this.config.packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {
  public static void main(String[] args) {
    SpringApplication.run(${className}.class, args);
  }
}`;
  }

  generateDatabaseConfig() {
    return `package ${this.config.packageName}.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class DatabaseConfig {}`;
  }

  generateSwaggerConfig() {
    return `package ${this.config.packageName}.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {}`;
  }

  generateGlobalExceptionHandler() {
    return `package ${this.config.packageName}.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handle(Exception ex) {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", ex.getMessage()));
  }
}`;
  }

  generateApiResponse() {
    return `package ${this.config.packageName}.dto.response;

public class ApiResponse<T> {
  public boolean success;
  public String message;
  public T data;

  public static <T> ApiResponse<T> success(T data, String message) {
    ApiResponse<T> r = new ApiResponse<>();
    r.success = true;
    r.data = data;
    r.message = message;
    return r;
  }

  public static <T> ApiResponse<T> error(String message) {
    ApiResponse<T> r = new ApiResponse<>();
    r.success = false;
    r.message = message;
    return r;
  }
}`;
  }

  generateEntity(element: DiagramElement, relationships: DiagramRelationship[], allElements: DiagramElement[]) {
    const entityName = element.name;
    const fields = this.parseAttributes(element.attributes || []).map((attr) => `  private ${this.mapUMLTypeToJava(attr.type)} ${attr.name};`).join('\n');
    const relationFields = this.generateRelationFields(element, relationships, allElements);

    return {
      [`src/main/java/${this.packageToPath()}/entity/${entityName}.java`]: `package ${this.config.packageName}.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "${this.toSnakeCase(entityName)}")
public class ${entityName} {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

${fields}

${relationFields}
}
`,
    };
  }

  generateRelationFields(element: DiagramElement, relationships: DiagramRelationship[], allElements: DiagramElement[]) {
    const rels = relationships.filter((rel) => rel.source === element.id || rel.target === element.id);
    const names = new Set<string>();
    const lines: string[] = [];

    rels.forEach((rel) => {
      const relatedId = rel.source === element.id ? rel.target : rel.source;
      const related = allElements.find((item) => item.id === relatedId);
      if (!related) return;
      const field = `${this.toCamelCase(related.name)}Id`;
      if (names.has(field)) return;
      names.add(field);
      lines.push(`  private Long ${field};`);
    });

    return lines.join('\n');
  }

  generateDTOs(element: DiagramElement) {
    const attrs = this.parseAttributes(element.attributes || []);
    return {
      [`src/main/java/${this.packageToPath()}/dto/${element.name}DTO.java`]: this.buildDtoClass(element.name, attrs, true),
      [`src/main/java/${this.packageToPath()}/dto/Create${element.name}DTO.java`]: this.buildDtoClass(`Create${element.name}`, attrs, false),
      [`src/main/java/${this.packageToPath()}/dto/Update${element.name}DTO.java`]: this.buildDtoClass(`Update${element.name}`, attrs, false),
    };
  }

  buildDtoClass(className: string, attrs: Array<{ name: string; type: string }>, includeId: boolean) {
    const fields = [includeId ? '  private Long id;' : '', ...attrs.map((attr) => `  private ${this.mapUMLTypeToJava(attr.type)} ${attr.name};`)].filter(Boolean).join('\n');
    return `package ${this.config.packageName}.dto;

public class ${className} {
${fields}
}`;
  }

  generateRepository(element: DiagramElement) {
    return {
      [`src/main/java/${this.packageToPath()}/repository/${element.name}Repository.java`]: `package ${this.config.packageName}.repository;

import ${this.config.packageName}.entity.${element.name};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${element.name}Repository extends JpaRepository<${element.name}, Long> {}`,
    };
  }

  generateService(element: DiagramElement) {
    return {
      [`src/main/java/${this.packageToPath()}/service/${element.name}Service.java`]: `package ${this.config.packageName}.service;

import ${this.config.packageName}.dto.${element.name}DTO;
import ${this.config.packageName}.dto.Create${element.name}DTO;
import ${this.config.packageName}.dto.Update${element.name}DTO;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

public interface ${element.name}Service {
  ${element.name}DTO create(Create${element.name}DTO dto);
  Optional<${element.name}DTO> findById(Long id);
  Page<${element.name}DTO> findAll(Pageable pageable);
  List<${element.name}DTO> findAll();
  Optional<${element.name}DTO> update(Long id, Update${element.name}DTO dto);
  boolean delete(Long id);
  boolean existsById(Long id);
  long count();
}`,
      [`src/main/java/${this.packageToPath()}/service/impl/${element.name}ServiceImpl.java`]: `package ${this.config.packageName}.service.impl;

import ${this.config.packageName}.dto.${element.name}DTO;
import ${this.config.packageName}.dto.Create${element.name}DTO;
import ${this.config.packageName}.dto.Update${element.name}DTO;
import ${this.config.packageName}.entity.${element.name};
import ${this.config.packageName}.repository.${element.name}Repository;
import ${this.config.packageName}.service.${element.name}Service;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ${element.name}ServiceImpl implements ${element.name}Service {
  private final ${element.name}Repository repository;
  public ${element.name}ServiceImpl(${element.name}Repository repository) { this.repository = repository; }

  public ${element.name}DTO create(Create${element.name}DTO dto) { return toDTO(repository.save(new ${element.name}())); }
  public Optional<${element.name}DTO> findById(Long id) { return repository.findById(id).map(this::toDTO); }
  public Page<${element.name}DTO> findAll(Pageable pageable) { return repository.findAll(pageable).map(this::toDTO); }
  public List<${element.name}DTO> findAll() { return repository.findAll().stream().map(this::toDTO).collect(Collectors.toList()); }
  public Optional<${element.name}DTO> update(Long id, Update${element.name}DTO dto) { return repository.findById(id).map(e -> toDTO(repository.save(e))); }
  public boolean delete(Long id) { if (repository.existsById(id)) { repository.deleteById(id); return true; } return false; }
  public boolean existsById(Long id) { return repository.existsById(id); }
  public long count() { return repository.count(); }

  private ${element.name}DTO toDTO(${element.name} entity) { return new ${element.name}DTO(); }
}`,
    };
  }

  generateController(element: DiagramElement) {
    const path = this.toKebabCase(element.name) + 's';
    return {
      [`src/main/java/${this.packageToPath()}/controller/${element.name}Controller.java`]: `package ${this.config.packageName}.controller;

import ${this.config.packageName}.dto.${element.name}DTO;
import ${this.config.packageName}.dto.Create${element.name}DTO;
import ${this.config.packageName}.dto.Update${element.name}DTO;
import ${this.config.packageName}.dto.response.ApiResponse;
import ${this.config.packageName}.service.${element.name}Service;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/${path}")
public class ${element.name}Controller {
  private final ${element.name}Service service;
  public ${element.name}Controller(${element.name}Service service) { this.service = service; }
  @PostMapping public ResponseEntity<ApiResponse<${element.name}DTO>> create(@RequestBody Create${element.name}DTO dto) { return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.create(dto), "${element.name} creado exitosamente")); }
  @GetMapping("/{id}") public ResponseEntity<ApiResponse<${element.name}DTO>> findById(@PathVariable Long id) { return service.findById(id).map(item -> ResponseEntity.ok(ApiResponse.success(item, "${element.name} encontrado"))).orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error("${element.name} no encontrado con ID: " + id))); }
  @GetMapping public ResponseEntity<ApiResponse<Page<${element.name}DTO>>> findAll(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size, @RequestParam(defaultValue = "id") String sortBy, @RequestParam(defaultValue = "asc") String sortDir) { Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.fromString(sortDir), sortBy)); return ResponseEntity.ok(ApiResponse.success(service.findAll(pageable), "Lista de ${element.name}s obtenida exitosamente")); }
  @GetMapping("/all") public ResponseEntity<ApiResponse<List<${element.name}DTO>>> findAllWithoutPagination() { return ResponseEntity.ok(ApiResponse.success(service.findAll(), "Lista completa de ${element.name}s obtenida")); }
  @PutMapping("/{id}") public ResponseEntity<ApiResponse<${element.name}DTO>> update(@PathVariable Long id, @RequestBody Update${element.name}DTO dto) { return service.update(id, dto).map(item -> ResponseEntity.ok(ApiResponse.success(item, "${element.name} actualizado exitosamente"))).orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error("${element.name} no encontrado con ID: " + id))); }
  @DeleteMapping("/{id}") public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) { return service.delete(id) ? ResponseEntity.ok(ApiResponse.success(null, "${element.name} eliminado exitosamente")) : ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error("${element.name} no encontrado con ID: " + id)); }
}`,
    };
  }

  parseAttributes(attributes: string[]) {
    return attributes.map((attribute) => {
      const [namePart, typePart] = String(attribute).split(':').map((part) => part.trim());
      return { name: this.toCamelCase(namePart || 'field'), type: typePart || 'String' };
    });
  }

  mapUMLTypeToJava(type: string) {
    const normalized = String(type).toLowerCase();
    if (normalized.includes('int') || normalized.includes('long')) return 'Long';
    if (normalized.includes('double') || normalized.includes('float') || normalized.includes('decimal')) return 'Double';
    if (normalized.includes('bool')) return 'Boolean';
    if (normalized.includes('date') || normalized.includes('time')) return 'LocalDateTime';
    return 'String';
  }

  toPascalCase(value: string) {
    return String(value).replace(/(^\w|_\w)/g, (match) => match.replace('_', '').toUpperCase());
  }

  toCamelCase(value: string) {
    const pascal = this.toPascalCase(String(value).replace(/[^a-zA-Z0-9_]/g, ''));
    return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : 'field';
  }

  toSnakeCase(value: string) {
    return String(value).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
  }

  toKebabCase(value: string) {
    return this.toSnakeCase(value).replace(/_/g, '-');
  }
}
