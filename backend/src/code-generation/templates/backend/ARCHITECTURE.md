# Arquitectura del proyecto

## 1. Resumen

Este proyecto es un backend REST monolitico construido con Spring Boot 3.3.4 y Java 17.

Actualmente implementa el modulo de identidad y acceso:

- Usuarios.
- Roles.
- Permisos.
- Autenticacion mediante JWT.
- Autorizacion mediante permisos.
- Documentacion OpenAPI/Swagger.

La aplicacion usa PostgreSQL como base de datos y JPA/Hibernate para persistencia y administracion del esquema. Flyway queda deshabilitado por defecto y solo se habilita explicitamente.

## 2. Flujo de una peticion

```text
Cliente HTTP
    |
    v
Context path /api
    |
    v
CorsConfiguration
    |
    v
JwtAuthenticationFilter
    |
    v
SecurityFilterChain
    |
    v
Controller REST
    |
    v
PermissionCheckAspect (@RequirePermission)
    |
    v
Service
    |
    v
Repository Spring Data JPA
    |
    v
PostgreSQL
```

El endpoint `POST /api/auth/login` es publico. Las demas rutas requieren un JWT valido, y las operaciones protegidas requieren ademas el permiso declarado en `@RequirePermission`.

## 3. Estructura de paquetes

```text
src/main/java/backend/
├── BackendApplication.java
├── config/
├── common/
│   ├── annotation/
│   ├── aspect/
│   ├── constants/
│   ├── entity/
│   ├── enums/
│   ├── exception/
│   └── utils/
└── users/
    ├── controller/
    ├── dto/
    ├── entity/
    ├── filter/
    ├── provider/
    ├── repository/
    └── service/
```

### `config`

- `BackendApplication.java`: punto de entrada y carga del archivo `.env`.
- `SecurityConfig.java`: Spring Security, CORS, BCrypt, AuthenticationManager y filtro JWT.
- `SwaggerConfig.java`: configuracion OpenAPI y esquema Bearer JWT.
- `DataInitializer.java`: permisos, roles y superadministrador iniciales.

### `common`

- `aspect/PermissionCheckAspect.java`: comprueba el permiso antes de ejecutar el metodo anotado.
- `constants/PermissionConstants.java`: nombres y grupos de permisos del sistema.
- `constants/RoleConstants.java`: nombres de roles base.
- `entity/BaseEntity.java`: UUID, `createdAt` y `updatedAt` compartidos por las entidades.
- `enums/GenderEnum.java`: valores de genero aceptados por la API.
- `exception/GlobalExceptionHandler.java`: respuestas para errores de validacion y seguridad.
- `utils/ResponseMessage.java`: formato comun de respuesta JSON.

### `users`

El paquete contiene la funcionalidad actual de usuarios, roles, permisos y autenticacion.

- `controller`: recibe peticiones HTTP y delega en servicios.
- `dto`: modelos de entrada y salida de la API.
- `entity`: modelos persistidos mediante JPA.
- `repository`: interfaces de acceso a PostgreSQL.
- `service`: reglas de negocio y transacciones.
- `filter`: autenticacion de peticiones mediante JWT.
- `provider`: generacion y validacion de tokens JWT.

## 4. Modelo de datos

```text
roles 1 ------- N users
roles N ------- N permissions
              |
              +-- role_permissions
```

Tablas administradas por Hibernate a partir del modelo JPA:

- `users`: datos del usuario y referencia obligatoria a `roles`.
- `roles`: nombre unico del rol.
- `permissions`: nombre y descripcion del permiso.
- `role_permissions`: tabla intermedia de roles y permisos.

Todas las entidades heredan de `BaseEntity` y utilizan UUID como identificador.

## 5. Autenticacion y autorizacion

### Autenticacion

1. El cliente envia correo y contrasena a `/api/auth/login`.
2. `UserAuthService` busca el usuario por correo.
3. `PasswordEncoder` compara la contrasena recibida con el hash BCrypt.
4. `UserJwtTokenProvider` genera un JWT firmado con `jwt.secret`.
5. El cliente envia el token en `Authorization: Bearer <token>`.
6. `JwtAuthenticationFilter` valida el token y carga las autoridades del usuario.

### Autorizacion

Los permisos son las autoridades de Spring Security. Un endpoint protegido declara el permiso requerido:

```java
@RequirePermission(PermissionConstants.LISTAR_USUARIO)
@GetMapping
public ResponseMessage<List<UserEntity>> getAllUsers() {
    return userService.getAllUsers();
}
```

`PermissionCheckAspect` compara el valor de `@RequirePermission` con las autoridades del usuario.

## 6. Configuracion y ejecucion

- `application.properties`: puerto, base de datos, Hibernate, Flyway opcional, contexto `/api`, Swagger y JWT.
- `.env.example`: plantilla de variables locales.
- `.env`: valores locales; no debe versionarse.
- `build.gradle.kts`: dependencias y tareas Gradle.
- `dockerfile`: compilacion y ejecucion en dos etapas con Java 17.

Variables principales:

```text
SERVER_PORT
DB_URL
DB_USERNAME
DB_PASSWORD
JPA_DDL_AUTO
JWT_SECRET
JWT_EXPIRATION
SU_EMAIL
SU_PASSWORD
```

## 7. Reglas de arquitectura

- El controlador no contiene reglas de negocio ni acceso directo al repositorio.
- El servicio contiene validaciones de negocio y operaciones transaccionales.
- El repositorio solo contiene consultas y acceso a datos.
- Las entidades representan persistencia; los DTOs representan el contrato HTTP.
- Los endpoints protegidos deben declarar `@RequirePermission`.
- Las contrasenas nunca se devuelven en JSON.
- Los cambios de esquema del backend generado se administran mediante JPA/Hibernate con `spring.jpa.hibernate.ddl-auto=update`.
- Flyway permanece disponible solo como opt-in mediante `FLYWAY_ENABLED=true`.
- Los errores deben conservar el formato `ResponseMessage`.
- Las pruebas nuevas deben cubrir al menos el caso exitoso y los casos de seguridad o validacion relevantes.

## 8. Riesgos conocidos de la implementacion actual

- Algunos controladores devuelven entidades JPA directamente en lugar de DTOs de respuesta.
- La prueba existente solo verifica que el contexto de Spring cargue correctamente.
- Los valores de base de datos por defecto no son iguales entre `README.md`, `.env.example` y `application.properties`.
- La aplicacion devuelve `403` para errores producidos por `SecurityException`; autenticacion ausente y permiso insuficiente no estan diferenciados completamente.
