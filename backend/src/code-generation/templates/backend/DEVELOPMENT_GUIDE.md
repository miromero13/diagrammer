# Guia de desarrollo

## Crear un endpoint nuevo

Sigue este orden para agregar una nueva funcionalidad REST.

## 1. Define el caso de uso

Antes de escribir codigo, define:

- Recurso que se va a exponer.
- Operacion HTTP y ruta.
- Datos de entrada.
- Datos de salida.
- Regla de negocio.
- Permiso requerido.
- Cambios necesarios en la base de datos.

Usa rutas en plural y conserva el contexto global `/api`:

```text
POST /api/products
GET  /api/products/{id}
```

## 2. Crea la migracion de base de datos

Si el endpoint necesita una tabla o una columna nueva, crea primero una migracion en:

```text
src/main/resources/db/migration/
```

Usa el formato de Flyway:

```text
V2__nombre_descriptivo.sql
```

Reglas:

- No modifiques una migracion ya ejecutada.
- Usa claves primarias UUID para nuevas entidades.
- Define `NOT NULL`, `UNIQUE` y claves foraneas en la base de datos cuando corresponda.
- Incluye `created_at` y `updated_at` si la tabla representa una entidad del sistema.
- Prueba la migracion contra PostgreSQL.

## 3. Crea la entidad

Agrega la entidad en el paquete funcional, por ejemplo:

```text
src/main/java/backend/products/entity/ProductEntity.java
```

Debe:

- Anotar la clase con `@Entity`.
- Definir el nombre de tabla con `@Table`.
- Extender `BaseEntity`.
- Mapear las columnas y relaciones explicitamente.
- Evitar exponer secretos o campos internos con `@JsonIgnore`.

Ejemplo minimo:

```java
@Entity
@Table(name = "products")
public class ProductEntity extends BaseEntity {
    @Column(nullable = false)
    public String name;
}
```

## 4. Crea los DTOs

No uses la entidad como modelo de entrada. Crea DTOs en:

```text
src/main/java/backend/products/dto/
```

Convencion recomendada:

- `CreateProductDto`: campos obligatorios para crear.
- `UpdateProductDto`: campos opcionales para actualizar.
- `ProductResponseDto`: campos publicos de salida.

Usa Jakarta Validation:

```java
public class CreateProductDto {
    @NotBlank(message = "Name is required")
    @Size(max = 100)
    public String name;
}
```

En el controlador usa `@Valid` para activar la validacion.

## 5. Crea el repositorio

Agrega una interfaz en:

```text
src/main/java/backend/products/repository/ProductRepository.java
```

Ejemplo:

```java
@Repository
public interface ProductRepository extends JpaRepository<ProductEntity, UUID> {
    Optional<ProductEntity> findByName(String name);
}
```

Usa metodos derivados de Spring Data antes de escribir SQL manual. Agrega `@EntityGraph` cuando necesites cargar relaciones para una respuesta.

## 6. Define el permiso

Agrega el permiso en `PermissionConstants.java` y en el arreglo `PERMISSIONS`:

```java
public static final String LISTAR_PRODUCTO = "listar_producto";
```

Decide si el permiso pertenece a `SUPERADMIN_PERMISSION_NAMES`, `ADMIN_PERMISSION_NAMES` o a otro grupo. Si el permiso debe existir desde el primer arranque, `DataInitializer` lo sincronizara desde `PERMISSIONS`.

## 7. Implementa el servicio

Agrega el servicio en:

```text
src/main/java/backend/products/service/ProductService.java
```

El servicio debe:

- Recibir DTOs y devolver DTOs o `ResponseMessage`.
- Contener las reglas de negocio.
- Consultar repositorios.
- Manejar entidades inexistentes.
- Usar `@Transactional` en operaciones de escritura o varias operaciones relacionadas.
- No depender de `HttpServletRequest` ni construir respuestas HTTP directamente.

Ejemplo de estructura:

```java
@Service
public class ProductService {
    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional
    public ResponseMessage<ProductResponseDto> create(CreateProductDto dto) {
        ProductEntity product = new ProductEntity();
        product.name = dto.name;
        productRepository.save(product);
        return ResponseMessage.success(toResponse(product), "Producto creado correctamente", 1);
    }
}
```

Mantiene el manejo de errores consistente con los servicios actuales y evita capturar `Exception` sin necesidad. Los errores inesperados deben llegar al manejador global en lugar de ocultarse.

## 8. Implementa el controlador

Agrega el controlador en:

```text
src/main/java/backend/products/controller/ProductController.java
```

Reglas:

- Usa `@RestController`.
- Usa `@RequestMapping("/products")`.
- Valida entradas con `@Valid`.
- Declara el permiso en cada metodo protegido.
- Delega inmediatamente al servicio.
- No accede directamente a repositorios.
- Usa `ResponseMessage` como formato de respuesta.

Ejemplo:

```java
@RestController
@RequestMapping("/products")
public class ProductController {
    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @RequirePermission(PermissionConstants.LISTAR_PRODUCTO)
    @GetMapping
    public ResponseMessage<List<ProductResponseDto>> getAll() {
        return productService.getAll();
    }
}
```

## 9. Agrega documentacion OpenAPI

Incluye `@Tag` en el controlador y `@Operation` en los endpoints importantes:

```java
@Tag(name = "Products", description = "API for managing products")
```

No marques el endpoint como publico salvo que sea una decision explicita de seguridad. El esquema Bearer JWT ya esta configurado globalmente.

## 10. Agrega pruebas

Como minimo, agrega pruebas para:

- Crear u obtener el recurso correctamente.
- Entrada invalida.
- Usuario sin JWT.
- Usuario autenticado sin el permiso requerido.
- Recurso inexistente.
- Restricciones de unicidad o relaciones cuando correspondan.

Usa las dependencias existentes de Spring Boot Test y Spring Security Test. No agregues otra libreria de pruebas sin una necesidad concreta.

## 11. Verifica el cambio

Ejecuta desde la raiz:

```bash
./gradlew test
```

Para comprobar solamente compilacion:

```bash
./gradlew testClasses --no-daemon
```

Verifica tambien manualmente:

1. La migracion se aplica sin errores.
2. El endpoint aparece en `/api/docs`.
3. El endpoint rechaza peticiones sin autenticacion.
4. El permiso correcto permite la operacion.
5. La respuesta mantiene el formato `ResponseMessage`.
6. No se devuelve ninguna contrasena, clave o secreto.

## 12. Checklist de pull request

- [ ] La ruta sigue el estilo REST existente.
- [ ] Existe DTO de entrada con validaciones.
- [ ] Existe DTO de salida si la entidad no debe exponerse.
- [ ] La entidad extiende `BaseEntity` cuando corresponde.
- [ ] Existe migracion Flyway para cambios de esquema.
- [ ] El repositorio solo contiene acceso a datos.
- [ ] El servicio contiene las reglas de negocio.
- [ ] El controlador contiene `@RequirePermission`.
- [ ] El permiso esta definido en `PermissionConstants`.
- [ ] Las pruebas cubren exito, validacion y seguridad.
- [ ] `./gradlew test` termina correctamente.
- [ ] No se agregaron secretos, `.env` ni archivos generados.
