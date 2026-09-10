# Modelos de autenticacion y roles

Este documento explica como adaptar el proyecto a uno de cuatro modelos posibles.

Los casos son excluyentes:

1. Usuarios con una tabla `roles`.
2. Usuarios con el rol como atributo.
3. Un unico usuario autenticado.
4. Aplicacion sin autenticacion.

Los cuatro casos descritos aqui eliminan por completo el sistema de permisos actual. No deben quedar la tabla `permissions`, la tabla `role_permissions`, clases de permisos, DTOs de permisos, endpoints de permisos, constantes de permisos, `@RequirePermission` ni `PermissionCheckAspect`.

## Estado actual que se debe reemplazar

Actualmente el proyecto usa este modelo:

```text
roles 1 -------- N users
roles N -------- N permissions
              role_permissions
```

Los permisos actuales afectan estos archivos:

- `V1__identity_and_access.sql`: crea `permissions` y `role_permissions`.
- `PermissionEntity.java`: entidad de permisos.
- `PermissionRepository.java`: persistencia de permisos.
- `PermissionService.java`: CRUD de permisos.
- `PermissionController.java`: endpoints `/permissions`.
- `CreatePermissionDto.java` y `UpdatePermissionDto.java`: entradas del CRUD.
- `PermissionSessionDto.java`: permiso incluido en la sesion.
- `RoleEntity.java`: relacion `ManyToMany` con permisos.
- `CreateRoleDto.java` y `UpdateRoleDto.java`: reciben `permissionIds`.
- `RoleSessionDto.java`: devuelve una lista de permisos.
- `RoleService.java`: consulta y asigna permisos.
- `UserRepository.java`: carga `role.permissions`.
- `CustomUserDetailsService.java`: convierte permisos en autoridades.
- `UserAuthService.java`: agrega permisos a la respuesta de sesion.
- `PermissionConstants.java`: nombres y grupos de permisos.
- `RequirePermission.java`: anotacion de autorizacion.
- `PermissionCheckAspect.java`: valida permisos.
- `UserController.java`, `RoleController.java` y `PermissionController.java`: usan `@RequirePermission`.
- `DataInitializer.java`: crea permisos y los asigna a roles.

Al elegir cualquiera de los cuatro casos se deben retirar todas esas referencias. No basta con eliminar las tablas.

## Caso 1: usuarios con tabla `roles`

Usa este modelo cuando los roles deben administrarse como registros de base de datos.

### Modelo final

```text
roles 1 -------- N users
```

- Un rol puede tener muchos usuarios.
- Un usuario tiene exactamente un rol.
- No existen permisos.
- La autenticacion sigue usando JWT.
- La autorizacion se realiza comparando el rol.

### Base de datos

Edita `V1__identity_and_access.sql` para que solo cree `roles` y `users`:

```sql
CREATE TABLE roles (
    id UUID NOT NULL,
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    name VARCHAR(255) NOT NULL,
    CONSTRAINT roles_pkey PRIMARY KEY (id),
    CONSTRAINT uk_roles_name UNIQUE (name)
);

CREATE TABLE users (
    id UUID NOT NULL,
    created_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITHOUT TIME ZONE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT uk_users_email UNIQUE (email),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
);
```

Conserva en `users` los campos opcionales existentes si el proyecto los necesita. Elimina por completo `CREATE TABLE permissions` y `CREATE TABLE role_permissions`.

### Archivos que se eliminan

- `users/entity/PermissionEntity.java`
- `users/repository/PermissionRepository.java`
- `users/service/PermissionService.java`
- `users/controller/PermissionController.java`
- `users/dto/CreatePermissionDto.java`
- `users/dto/UpdatePermissionDto.java`
- `users/dto/PermissionSessionDto.java`
- `common/constants/PermissionConstants.java`
- `common/annotation/RequirePermission.java`
- `common/aspect/PermissionCheckAspect.java`

### Archivos que se editan

#### `RoleEntity.java`

Deja solamente los datos del rol. Elimina `permissions`, `@ManyToMany`, `@JoinTable` y sus imports:

```java
@Entity
@Table(name = "roles")
public class RoleEntity extends BaseEntity {
    @Column(unique = true, nullable = false)
    public String name;
}
```

#### `UserEntity.java`

Conserva la relacion muchos-a-uno:

```java
@ManyToOne
@JoinColumn(name = "role_id", nullable = false)
public RoleEntity role;
```

#### `CreateRoleDto.java` y `UpdateRoleDto.java`

Elimina `permissionIds`. Solo deben recibir el nombre del rol.

#### `RoleSessionDto.java`

Elimina la lista `permissions`. Conserva solo `id` y `name`.

#### `RoleService.java`

Elimina `PermissionRepository`, `PermissionEntity`, `permissionIds` y toda asignacion de permisos. El CRUD debe operar solamente con `RoleEntity.name`.

#### `UserRepository.java`

Cambia los grafos:

```java
@EntityGraph(attributePaths = {"role"})
```

No debe quedar `role.permissions`.

#### `CustomUserDetailsService.java`

Convierte el nombre del rol en la unica autoridad del usuario:

```java
Set<GrantedAuthority> authorities = user.role == null
        ? Collections.emptySet()
        : Set.of(new SimpleGrantedAuthority(user.role.name));
```

#### `UserAuthService.java`

Conserva `RoleSessionDto`, pero asigna solamente `id` y `name`. Elimina la construccion de `PermissionSessionDto` y la lista de permisos.

#### `UserController.java` y `RoleController.java`

Elimina todos los imports y anotaciones de `@RequirePermission`. Protege por rol usando Spring Security:

```java
@PreAuthorize("hasAuthority('Administrador')")
```

Para aceptar varios roles:

```java
@PreAuthorize("hasAnyAuthority('SuperAdministrador', 'Administrador')")
```

#### `SecurityConfig.java`

Agrega `@EnableMethodSecurity` para habilitar `@PreAuthorize`. Conserva JWT, CORS, BCrypt y `.anyRequest().authenticated()`.

#### `DataInitializer.java`

Elimina `PermissionRepository`, `createPermissions()` y los arreglos de permisos. Crea o actualiza solamente los registros de `roles` y el usuario inicial.

#### `RoleConstants.java`

Conserva los nombres de roles usados por el inicializador y las reglas de negocio. No agregues constantes de permisos.

#### `GlobalExceptionHandler.java`

Conserva el manejo de validacion. Puede conservar el manejo de `SecurityException`, aunque las denegaciones de `@PreAuthorize` son gestionadas por Spring Security.

#### `build.gradle.kts`

Conserva `spring-boot-starter-security` y JWT. `spring-boot-starter-aop` puede eliminarse si no queda ningun otro aspecto.

#### Swagger y configuracion

- `SwaggerConfig.java`: conserva Bearer JWT.
- `application.properties`: conserva `jwt.*` y las credenciales del usuario inicial.
- `additional-spring-configuration-metadata.json`: conserva los metadatos JWT y del usuario inicial.
- `.env.example`: conserva `JWT_SECRET`, `JWT_EXPIRATION`, `SU_EMAIL` y `SU_PASSWORD`.

### Resultado del caso 1

```text
Autenticacion: JWT
Autorizacion: rol de la tabla roles
Tablas: users, roles
Permisos: no existen
```

## Caso 2: rol como atributo de `users`

Usa este modelo cuando no se necesita administrar roles en una tabla. El rol vive directamente en cada usuario.

### Modelo final

```text
users
├── id
├── email
├── password
└── role
```

- No existe tabla `roles`.
- No existen permisos.
- La autenticacion sigue usando JWT.
- La autorizacion se realiza comparando el atributo `user.role`.

### Base de datos

Edita `V1__identity_and_access.sql` para crear solamente `users`. Elimina `roles`, `permissions`, `role_permissions`, `role_id` y su clave foranea.

El rol puede implementarse de dos maneras.

#### Opcion A: enum Java

Usa enum cuando la lista de roles es cerrada y solo cambia mediante codigo:

```java
public enum RoleEnum {
    SUPERADMINISTRADOR,
    ADMINISTRADOR,
    EMPLEADO
}
```

En `UserEntity.java`:

```java
@Enumerated(EnumType.STRING)
@Column(nullable = false)
public RoleEnum role;
```

En SQL:

```sql
role VARCHAR(50) NOT NULL,
CONSTRAINT users_role_check
    CHECK (role IN ('SUPERADMINISTRADOR', 'ADMINISTRADOR', 'EMPLEADO'))
```

#### Opcion B: `String`

Usa `String` cuando los valores pueden configurarse sin crear un enum:

```java
@Column(nullable = false)
public String role;
```

En SQL:

```sql
role VARCHAR(50) NOT NULL
```

Si los valores siguen siendo cerrados, agrega un `CHECK` en PostgreSQL. Si no son cerrados, valida el valor en el servicio. No crees una tabla `roles` de forma indirecta.

### Archivos que se eliminan

Elimina todo el sistema de permisos indicado en el caso 1. Ademas elimina:

- `users/entity/RoleEntity.java`
- `users/repository/RoleRepository.java`
- `users/service/RoleService.java`
- `users/controller/RoleController.java`
- `users/dto/CreateRoleDto.java`
- `users/dto/UpdateRoleDto.java`
- `users/dto/RoleSessionDto.java`

`RoleConstants.java` se elimina si se usa `RoleEnum`. Si se usa `String`, puede conservarse como lista central de valores permitidos.

### Archivos que se editan

#### `UserEntity.java`

Elimina `@ManyToOne`, `@JoinColumn` y `RoleEntity`. Agrega `RoleEnum role` o `String role`.

#### `CreateUserDto.java` y `UpdateUserDto.java`

Elimina `UUID roleId`. Agrega `RoleEnum role` o `String role`, con validacion cuando sea `String`.

#### `UserSessionDto.java`

Reemplaza `RoleSessionDto role` por `RoleEnum role` o `String role`.

#### `UserService.java`

Elimina `RoleRepository`, las busquedas por `roleId` y las asignaciones de `RoleEntity`. Asigna directamente `dto.role` y aplica aqui las restricciones para roles sensibles.

#### `UserRepository.java`

Elimina ambos `@EntityGraph`, porque ya no existe una relacion que cargar.

#### `CustomUserDetailsService.java`

Si elegiste enum, publica su nombre como autoridad:

```java
Set<GrantedAuthority> authorities =
        Set.of(new SimpleGrantedAuthority(user.role.name()));
```

Si elegiste `String`, publica directamente su valor:

```java
Set<GrantedAuthority> authorities =
        Set.of(new SimpleGrantedAuthority(user.role));
```

Implementa solamente la alternativa elegida; no es necesario soportar enum y `String` al mismo tiempo.

#### `UserAuthService.java`

Elimina `RoleSessionDto` y `PermissionSessionDto`. Copia `user.role` directamente a `UserSessionDto`.

#### `UserController.java`

Elimina `@RequirePermission` y protege por rol con `@PreAuthorize`.

#### `SecurityConfig.java`

Agrega `@EnableMethodSecurity`. Conserva JWT, CORS, BCrypt y autenticacion obligatoria.

#### `DataInitializer.java`

Elimina repositorios y creacion de roles y permisos. Crea solamente el usuario inicial y asigna directamente su rol enum o `String`.

#### Otros archivos

- `SwaggerConfig.java`: conserva Bearer JWT.
- `GlobalExceptionHandler.java`: conserva validacion y manejo de acceso denegado necesario.
- `build.gradle.kts`: conserva Security y JWT; elimina AOP si ya no hay aspectos.
- `application.properties`, `.env.example` y metadatos: conserva JWT y usuario inicial.

### Resultado del caso 2

```text
Autenticacion: JWT
Autorizacion: atributo role del usuario
Tablas: users
Permisos: no existen
Tabla roles: no existe
```

## Caso 3: un unico usuario autenticado

Usa este modelo cuando la aplicacion tiene una sola cuenta y todos los endpoints autenticados pertenecen a esa cuenta.

### Modelo final

```text
users
└── un unico registro
```

- No existe tabla `roles`.
- No existe atributo `role`.
- No existen permisos.
- No existe autorizacion por rol o permiso.
- Solo se comprueba si la peticion esta autenticada.

### Base de datos

Edita `V1__identity_and_access.sql` para crear solamente `users`. Elimina:

- `roles`.
- `permissions`.
- `role_permissions`.
- `users.role_id`.
- La clave foranea `fk_users_role`.

Mantiene al menos `id`, `email`, `password`, `created_at` y `updated_at`. Conserva nombre, telefono, genero y direccion solamente si la aplicacion los usa.

### Archivos que se eliminan

Elimina todos los archivos de roles y permisos de los casos anteriores:

- Entidades, repositorios, servicios, controladores y DTOs de roles.
- Entidades, repositorios, servicios, controladores y DTOs de permisos.
- `RoleConstants.java` y `PermissionConstants.java`.
- `RequirePermission.java` y `PermissionCheckAspect.java`.

Tambien elimina los DTOs de CRUD de usuarios y `UserController.java` si no se permitira crear más cuentas por API.

### Archivos que se editan

#### `UserEntity.java`

Elimina por completo el campo `role` y sus imports. Conserva identidad y credenciales.

#### `UserRepository.java`

Conserva `findByEmail`. Elimina `@EntityGraph` y consultas que no se utilicen.

#### `CustomUserDetailsService.java`

Carga el unico usuario sin autoridades:

```java
return new User(user.email, user.password, Collections.emptyList());
```

#### `UserAuthService.java`

Conserva login y sesion. Elimina toda construccion de roles y permisos.

#### `UserSessionDto.java`

Elimina el campo `role`. Conserva solo los datos del usuario.

#### `AuthController.java`

Conserva `/auth/login` y `/auth/session`.

#### `UserService.java`

Eliminalo si no existe CRUD de usuarios. Si se permite editar el perfil del unico usuario, simplificalo a esa operacion y no permitas crear o eliminar cuentas.

#### `DataInitializer.java`

Conserva unicamente la creacion del usuario inicial si no existe. Elimina toda referencia a roles y permisos.

#### `SecurityConfig.java`

Conserva JWT y protege todo excepto login y Swagger:

```java
.requestMatchers("/auth/login", "/docs/**", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
.anyRequest().authenticated()
```

No agregues `@EnableMethodSecurity`: no hay roles que comprobar.

#### Otros archivos

- `JwtAuthenticationFilter.java`: se conserva.
- `UserJwtTokenProvider.java`: se conserva.
- `SwaggerConfig.java`: conserva Bearer JWT.
- `PasswordEncoder`: se conserva para almacenar la contrasena con BCrypt.
- `build.gradle.kts`: conserva Security y JWT; elimina AOP.
- `application.properties`: conserva `jwt.*` y credenciales iniciales.
- `.env.example`: conserva variables JWT y del unico usuario.

### Resultado del caso 3

```text
Autenticacion: JWT
Autorizacion: solo authenticated()
Tablas: users
Roles: no existen
Permisos: no existen
```

## Caso 4: sin autenticacion

Usa este modelo cuando la API debe ser completamente publica y no existen login, sesiones, usuarios de seguridad, roles ni permisos.

### Modelo final

```text
Cliente --------> endpoints publicos
```

- No existe login.
- No existe JWT.
- No existe `SecurityContext`.
- No existen usuarios de autenticacion.
- No existen roles.
- No existen permisos.

### Base de datos

Si `users` solo existia para autenticacion, elimina todas las tablas de identidad de `V1__identity_and_access.sql`. Si la migracion queda vacia, elimina el archivo y crea migraciones unicamente para las entidades funcionales reales del proyecto.

Si los usuarios son datos funcionales del negocio, puedes conservar `users`, pero elimina `password`, `role_id` y cualquier dato usado exclusivamente para autenticacion.

### Archivos que se eliminan

- Todo archivo de roles y permisos mencionado en los casos anteriores.
- `users/controller/AuthController.java`
- `users/service/UserAuthService.java`
- `users/service/CustomUserDetailsService.java`
- `users/filter/JwtAuthenticationFilter.java`
- `users/provider/UserJwtTokenProvider.java`
- `users/dto/UserLoginRequestDto.java`
- `users/dto/AuthLoginResponseDto.java`
- `users/dto/UserSessionDto.java`
- `config/DataInitializer.java` si solo inicializaba cuentas de acceso.
- `config/SecurityConfig.java` si se elimina Spring Security por completo.

Elimina tambien `UserController`, `UserService`, `UserRepository`, `UserEntity` y sus DTOs si el concepto de usuario no pertenece al negocio.

### Archivos que se editan

#### `build.gradle.kts`

Elimina dependencias que ya no se usan:

```kotlin
implementation("org.springframework.boot:spring-boot-starter-aop")
implementation("org.springframework.boot:spring-boot-starter-security")
implementation("io.jsonwebtoken:jjwt-api:0.11.5")
runtimeOnly("io.jsonwebtoken:jjwt-impl:0.11.5")
runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.11.5")
testImplementation("org.springframework.security:spring-security-test")
```

#### `SwaggerConfig.java`

Elimina `SecurityScheme`, `SecurityRequirement` y la configuracion Bearer. Conserva solamente titulo, version y descripcion de OpenAPI.

#### `application.properties`

Elimina:

```properties
jwt.secret=...
jwt.expiration=...
superadmin.email=...
superadmin.password=...
```

#### `.env.example`

Elimina `JWT_SECRET`, `JWT_EXPIRATION`, `SU_EMAIL` y `SU_PASSWORD`.

#### `additional-spring-configuration-metadata.json`

Elimina los metadatos de JWT y superadministrador. Si no quedan propiedades personalizadas, elimina el archivo.

#### `BackendApplication.java`

Si `.env` sigue configurando la base de datos, conserva la carga de dotenv. Si ya no se usa `.env`, elimina `dotenv-java` de Gradle y simplifica el `main` a `SpringApplication.run(...)`.

#### `GlobalExceptionHandler.java`

Conserva el manejo de validacion. Elimina `handleSecurityException` si ninguna parte de la aplicacion lanza `SecurityException`.

#### Controladores funcionales

No necesitan anotaciones de seguridad. Todos quedan accesibles directamente. Al no existir Spring Security, tampoco se necesita `.permitAll()`.

### Resultado del caso 4

```text
Autenticacion: no existe
Autorizacion: no existe
Tablas de identidad: no existen
Security y JWT: se eliminan
```

## Matriz de archivos

`Editar` significa que el archivo se conserva, pero deben aplicarse las instrucciones de su caso. `Eliminar` significa borrar el archivo y todos sus imports y usos.

| Archivo o grupo | Caso 1: tabla `roles` | Caso 2: atributo `role` | Caso 3: usuario unico | Caso 4: sin autenticacion |
|---|---|---|---|---|
| `BackendApplication.java` | Conservar | Conservar | Conservar | Conservar; simplificar si no usa dotenv |
| `BaseEntity.java` | Conservar | Conservar | Conservar | Conservar si quedan entidades |
| `ResponseMessage.java` | Conservar | Conservar | Conservar | Conservar para respuestas REST |
| `GenderEnum.java` | Conservar si se usa | Conservar si se usa | Conservar si se usa | Conservar si se usa |
| `UserEntity.java` | Editar: relacion con `RoleEntity` | Editar: enum o `String` | Editar: sin rol | Eliminar o dejar sin credenciales |
| `RoleEntity.java` | Editar: solo `id` y nombre | Eliminar | Eliminar | Eliminar |
| `PermissionEntity.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `UserRepository.java` | Editar: cargar solo `role` | Editar: sin `EntityGraph` | Editar: solo consultas usadas | Eliminar si no hay usuarios funcionales |
| `RoleRepository.java` | Conservar | Eliminar | Eliminar | Eliminar |
| `PermissionRepository.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `UserService.java` | Editar: usa `RoleRepository` | Editar: asigna atributo | Eliminar o dejar edicion de perfil | Eliminar si no hay usuarios funcionales |
| `RoleService.java` | Editar: CRUD sin permisos | Eliminar | Eliminar | Eliminar |
| `PermissionService.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `UserController.java` | Editar: seguridad por rol | Editar: seguridad por rol | Eliminar o dejar perfil | Eliminar si no hay usuarios funcionales |
| `RoleController.java` | Editar: seguridad por rol | Eliminar | Eliminar | Eliminar |
| `PermissionController.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `CreateUserDto.java` / `UpdateUserDto.java` | Conservar `roleId` | Cambiar a enum o `String` | Eliminar o reducir al perfil | Eliminar si no hay usuarios funcionales |
| `CreateRoleDto.java` / `UpdateRoleDto.java` | Editar: solo nombre | Eliminar | Eliminar | Eliminar |
| DTOs de permisos | Eliminar | Eliminar | Eliminar | Eliminar |
| `UserSessionDto.java` | Editar: rol sin permisos | Editar: atributo `role` | Editar: sin rol | Eliminar |
| `RoleSessionDto.java` | Editar: sin permisos | Eliminar | Eliminar | Eliminar |
| `UserLoginRequestDto.java` | Conservar | Conservar | Conservar | Eliminar |
| `AuthLoginResponseDto.java` | Conservar | Conservar | Conservar | Eliminar |
| `AuthController.java` | Conservar | Conservar | Conservar | Eliminar |
| `UserAuthService.java` | Editar: sesion con rol | Editar: sesion con atributo | Editar: sesion sin rol | Eliminar |
| `CustomUserDetailsService.java` | Editar: autoridad desde tabla | Editar: autoridad desde atributo | Editar: sin autoridades | Eliminar |
| `JwtAuthenticationFilter.java` | Conservar | Conservar | Conservar | Eliminar |
| `UserJwtTokenProvider.java` | Conservar | Conservar | Conservar | Eliminar |
| `RoleConstants.java` | Conservar | Enum: eliminar; `String`: opcional | Eliminar | Eliminar |
| `PermissionConstants.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `RequirePermission.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `PermissionCheckAspect.java` | Eliminar | Eliminar | Eliminar | Eliminar |
| `GlobalExceptionHandler.java` | Editar segun errores de seguridad | Editar segun errores de seguridad | Editar segun errores de seguridad | Eliminar handler de seguridad |
| `SecurityConfig.java` | Editar: JWT y roles | Editar: JWT y roles | Editar: solo JWT | Eliminar |
| `DataInitializer.java` | Editar: roles y usuario | Editar: usuario con atributo | Editar: solo usuario | Eliminar |
| `SwaggerConfig.java` | Conservar Bearer | Conservar Bearer | Conservar Bearer | Eliminar Bearer |
| `application.properties` | Conservar JWT | Conservar JWT | Conservar JWT | Eliminar JWT y superadmin |
| `.env.example` | Conservar JWT y cuenta inicial | Conservar JWT y cuenta inicial | Conservar JWT y cuenta unica | Eliminar variables de acceso |
| Metadatos de Spring | Conservar JWT y cuenta inicial | Conservar JWT y cuenta inicial | Conservar JWT y cuenta unica | Limpiar o eliminar |
| `V1__identity_and_access.sql` | `users` y `roles` | Solo `users` con `role` | Solo `users`, sin `role` | Eliminar identidad |
| `build.gradle.kts` | Security y JWT; AOP no requerido | Security y JWT; AOP no requerido | Security y JWT; AOP no requerido | Eliminar Security, JWT y AOP |
| `BackendApplicationTests.java` | Probar contexto y seguridad por rol | Probar contexto y seguridad por rol | Probar contexto y autenticacion | Probar contexto sin Security |

## Verificacion despues de elegir un caso

1. Busca `Permission`, `permission` y `RequirePermission` en todo `src`; no debe quedar ninguna coincidencia funcional.
2. Para los casos 2, 3 y 4, busca `RoleEntity`, `RoleRepository` y `role_id`; no deben quedar referencias.
3. Para el caso 3, verifica que no exista ninguna comprobacion de rol.
4. Para el caso 4, busca `Jwt`, `Security`, `Authentication`, `PasswordEncoder` y `password`; elimina cualquier uso exclusivo de autenticacion.
5. Verifica que `V1__identity_and_access.sql` refleje solamente las tablas del caso elegido.
6. Ejecuta `./gradlew test`.
7. Prueba un endpoint protegido segun el modelo elegido.

No combines modelos. Una tabla `roles` y un atributo `users.role` no deben coexistir. Tampoco debe conservarse infraestructura de permisos en ninguno de estos cuatro casos.
