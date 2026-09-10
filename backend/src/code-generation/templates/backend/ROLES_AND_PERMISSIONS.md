# Modelos de autenticacion y autorizacion

## Proposito

Este documento define como adaptar la identidad y el acceso del template al diagrama de clases y a la seleccion del usuario.

El usuario no elige un caso tecnico. Solo responde si necesita autenticacion y, si la necesita, identifica las clases del diagrama que cumplen estas funciones:

- Entidad principal: la cuenta que inicia sesion.
- Rol: agrupacion de acceso, si existe.
- Permiso: autoridad concreta, si existe.

Los nombres no son obligatorios. La entidad principal puede llamarse `Empleado`, `Cliente`, `Doctor`, `Cuenta`, `User` o de cualquier otra forma. De igual manera, un rol puede llamarse `Perfil` y un permiso puede llamarse `Privilegio`.

El template actual es el punto de partida y corresponde al Caso 5: una entidad principal tiene un rol y el rol tiene permisos. Cada generacion copia primero el template y despues conserva, renombra, edita, crea o elimina archivos segun el caso resuelto.

## Indice

1. Configuracion solicitada al usuario.
2. Conceptos y nombres variables.
3. Validacion de la seleccion.
4. Resolucion del caso.
5. Archivos de seguridad del template.
6. Reglas comunes para casos autenticados.
7. Caso 1: sin autenticacion.
8. Caso 2: autenticacion basica.
9. Caso 3: rol como atributo.
10. Caso 4: un rol mediante tabla, sin permisos.
11. Caso 5: un rol mediante tabla con permisos.
12. Caso 6: multiples roles con permisos.
13. Caso 7: permisos directos sin roles.
14. Regla adicional de propietario del recurso.
15. Matriz resumida.
16. Verificacion final.

## 1. Configuracion solicitada al usuario

El frontend debe preguntar:

```text
¿El backend necesita autenticacion?
( ) No
( ) Si
```

Si el usuario responde `No`, no se solicitan clases de seguridad y se aplica el Caso 1.

Si responde `Si`, el frontend muestra las clases existentes del diagrama y solicita:

```text
Entidad que inicia sesion: [seleccion obligatoria, una sola clase]
Entidad de roles:          [seleccion opcional]
Entidad de permisos:       [seleccion opcional]
```

Ayuda que debe mostrarse al usuario:

```text
Selecciona como entidad principal la clase que representa a quien inicia
sesion. Por ejemplo: Empleado, Cliente, Doctor, Cuenta o User.

Selecciona una entidad de roles solo si el diagrama tiene una clase que
agrupa el acceso. Por ejemplo: Rol, Perfil, Grupo o AccessRole.

Selecciona una entidad de permisos solo si el diagrama tiene una clase que
representa acciones autorizadas. Por ejemplo: Permiso, Privilegio o Capability.
```

Payload:

```json
{
  "authentication": {
    "enabled": true,
    "principalClassId": "principal-node-id",
    "roleClassId": "role-node-id",
    "permissionClassId": "permission-node-id"
  }
}
```

Los campos `roleClassId` y `permissionClassId` pueden ser `null`:

```json
{
  "authentication": {
    "enabled": true,
    "principalClassId": "principal-node-id",
    "roleClassId": null,
    "permissionClassId": null
  }
}
```

Sin autenticacion:

```json
{
  "authentication": {
    "enabled": false,
    "principalClassId": null,
    "roleClassId": null,
    "permissionClassId": null
  }
}
```

El usuario no debe seleccionar JWT, Spring Security, RBAC ni un numero de caso. Esas son decisiones internas basadas en el template y en las relaciones UML.

## 2. Conceptos y nombres variables

Este documento utiliza placeholders conceptuales:

| Placeholder | Significado | Ejemplos del diagrama |
|---|---|---|
| `<Principal>` | Entidad que inicia sesion | `Empleado`, `Cliente`, `Cuenta` |
| `<principal>` | Nombre Java en camelCase | `empleado`, `cliente`, `cuenta` |
| `<principals>` | Nombre plural para ruta o tabla | `empleados`, `clientes`, `cuentas` |
| `<Role>` | Entidad o tipo de rol | `Rol`, `Perfil`, `Grupo` |
| `<Permission>` | Entidad de permiso | `Permiso`, `Privilegio` |

Cuando el diagrama selecciona `Empleado` como entidad principal, las referencias del template se adaptan de forma coherente:

```text
UserEntity                  -> EmpleadoEntity
UserRepository              -> EmpleadoRepository
UserService                 -> EmpleadoService
UserController              -> EmpleadoController
UserAuthService             -> EmpleadoAuthService
CustomUserDetailsService    -> EmpleadoDetailsService
UserJwtTokenProvider        -> EmpleadoJwtTokenProvider
UserSessionDto              -> EmpleadoSessionDto
UserLoginRequestDto         -> EmpleadoLoginRequestDto
users                       -> empleados
/users                      -> /empleados
```

La adaptacion debe incluir:

- Nombre del archivo.
- Nombre de la clase publica.
- Declaracion `package`.
- Imports.
- Inyeccion por constructor.
- Tipos genericos.
- Nombres de metodos derivados del repository.
- Nombre de tabla y columnas SQL.
- Rutas REST.
- DTOs de sesion y autenticacion.
- Referencias en `SecurityConfig`, `DataInitializer` y tests existentes.

No se debe conservar una segunda `UserEntity` de seguridad si `<Principal>` reemplaza ese concepto. Debe existir una sola entidad principal autenticada.

## 3. Validacion de la seleccion

Antes de llamar a la IA o modificar el template, el backend debe validar:

1. Si `authentication.enabled` es `true`, `principalClassId` es obligatorio.
2. El ID principal pertenece al diagrama actual.
3. Los IDs de rol y permiso, si existen, pertenecen al mismo diagrama.
4. Una misma clase no puede cumplir simultaneamente los tres conceptos.
5. La entidad principal es una clase concreta, no una interfaz ni un enum.
6. La entidad de roles puede ser clase o enum solo para el Caso 3.
7. La entidad de permisos debe ser una clase concreta para los casos 5, 6 y 7.
8. La entidad principal contiene un identificador de login.
9. La entidad principal contiene una credencial o el diagrama declara un metodo de autenticacion compatible.
10. Las relaciones necesarias existen y tienen multiplicidades interpretables.

Identificadores de login reconocidos:

```text
email
username
userName
login
documentNumber
```

Credenciales reconocidas:

```text
password
passwordHash
credential
```

Si se selecciona una entidad principal sin identificador o credencial suficiente, se detiene la generacion y se solicita corregir el diagrama. La IA no debe inventar campos de autenticacion que el usuario no modelo.

Ejemplo de error:

```json
{
  "code": "INVALID_AUTHENTICATION_PRINCIPAL",
  "elementId": "principal-node-id",
  "message": "La entidad seleccionada para iniciar sesion necesita un identificador y una credencial"
}
```

## 4. Resolucion del caso

Los casos 1 al 7 son excluyentes. La regla de propietario puede agregarse despues a cualquiera de los casos autenticados.

| Condicion | Caso |
|---|---|
| Autenticacion desactivada | Caso 1 |
| Principal sin rol ni permiso | Caso 2 |
| Rol modelado como atributo o enum dentro del principal | Caso 3 |
| Principal `N:1` Rol, sin permisos | Caso 4 |
| Principal `N:1` Rol y Rol `N:N` Permiso | Caso 5 |
| Principal `N:N` Rol y Rol `N:N` Permiso | Caso 6 |
| Principal `N:N` Permiso, sin Rol | Caso 7 |

Reglas adicionales:

- Si el usuario selecciona una clase de rol, debe existir una relacion entre el principal y el rol.
- Si selecciona una clase de permiso junto con una clase de rol, debe existir una relacion entre rol y permiso.
- Si selecciona permiso sin rol, debe existir una relacion entre principal y permiso.
- El Caso 5 corresponde a la arquitectura actual del template.
- El Caso 6 se diferencia del Caso 5 exclusivamente porque un principal puede tener varios roles.
- El Caso 7 no tiene una entidad de roles intermedia.
- No se debe combinar `role_id`, un atributo `role` y una tabla `principal_roles` para representar la misma asignacion.

## 5. Archivos de seguridad del template

La adaptacion debe revisar este inventario completo.

### Configuracion

```text
src/main/java/backend/config/SecurityConfig.java
src/main/java/backend/config/SwaggerConfig.java
src/main/java/backend/config/DataInitializer.java
src/main/resources/application.properties
src/main/resources/META-INF/additional-spring-configuration-metadata.json
.env.example
build.gradle.kts
```

### Infraestructura compartida

```text
src/main/java/backend/common/annotation/RequirePermission.java
src/main/java/backend/common/aspect/PermissionCheckAspect.java
src/main/java/backend/common/constants/PermissionConstants.java
src/main/java/backend/common/constants/RoleConstants.java
src/main/java/backend/common/exception/GlobalExceptionHandler.java
```

### Entidad principal y autenticacion

```text
src/main/java/backend/users/entity/UserEntity.java
src/main/java/backend/users/repository/UserRepository.java
src/main/java/backend/users/service/UserService.java
src/main/java/backend/users/service/UserAuthService.java
src/main/java/backend/users/service/CustomUserDetailsService.java
src/main/java/backend/users/controller/UserController.java
src/main/java/backend/users/controller/AuthController.java
src/main/java/backend/users/filter/JwtAuthenticationFilter.java
src/main/java/backend/users/provider/UserJwtTokenProvider.java
src/main/java/backend/users/dto/CreateUserDto.java
src/main/java/backend/users/dto/UpdateUserDto.java
src/main/java/backend/users/dto/UserLoginRequestDto.java
src/main/java/backend/users/dto/AuthLoginResponseDto.java
src/main/java/backend/users/dto/UserSessionDto.java
```

### Roles

```text
src/main/java/backend/users/entity/RoleEntity.java
src/main/java/backend/users/repository/RoleRepository.java
src/main/java/backend/users/service/RoleService.java
src/main/java/backend/users/controller/RoleController.java
src/main/java/backend/users/dto/CreateRoleDto.java
src/main/java/backend/users/dto/UpdateRoleDto.java
src/main/java/backend/users/dto/RoleSessionDto.java
```

### Permisos

```text
src/main/java/backend/users/entity/PermissionEntity.java
src/main/java/backend/users/repository/PermissionRepository.java
src/main/java/backend/users/service/PermissionService.java
src/main/java/backend/users/controller/PermissionController.java
src/main/java/backend/users/dto/CreatePermissionDto.java
src/main/java/backend/users/dto/UpdatePermissionDto.java
src/main/java/backend/users/dto/PermissionSessionDto.java
```

### Base de datos

```text
src/main/resources/db/migration/V1__identity_and_access.sql
```

Como el proyecto descargado es nuevo y las migraciones todavia no fueron ejecutadas, se permite adaptar `V1__identity_and_access.sql`. Las migraciones del dominio funcional se generan por separado.

## 6. Reglas comunes para casos autenticados

Estas reglas aplican a los casos 2 al 7.

### Conservar

- `spring-boot-starter-security`.
- Dependencias JWT.
- BCrypt mediante `PasswordEncoder`.
- `JwtAuthenticationFilter`.
- Provider JWT.
- `SecurityConfig`.
- Esquema Bearer de Swagger.
- Variables `JWT_SECRET` y `JWT_EXPIRATION`.
- Endpoint publico de login.
- Manejo de errores de autenticacion y acceso denegado.

### Adaptar

- Renombrar el modulo `users` al modulo de `<Principal>` cuando corresponda.
- Cambiar `UserEntity` por `<Principal>Entity`.
- Cambiar `UserRepository` por `<Principal>Repository`.
- Cambiar services, controllers y DTOs relacionados.
- Usar el identificador de login modelado en el diagrama.
- Codificar la credencial con BCrypt antes de persistirla.
- Marcar la credencial con `@JsonIgnore`.
- Excluir la credencial de todos los DTOs de respuesta.
- Hacer unica la columna del identificador de login.
- Actualizar el JWT para utilizar el ID y el identificador del principal.
- Actualizar `DataInitializer` para la entidad principal y el caso resuelto.
- Actualizar `.env.example`, properties y metadatos sin introducir secretos reales.

### Seguridad HTTP

- Mantener publicos solamente login y Swagger.
- Requerir JWT para el resto de endpoints, salvo una regla explicita del dominio.
- No aceptar el ID del principal enviado por el cliente como prueba de identidad.
- Obtener la identidad autenticada desde `SecurityContext`.
- Responder `401` cuando falta o es invalido el JWT.
- Responder `403` cuando el JWT es valido pero no tiene la autoridad necesaria.

### Compilacion

Despues de aplicar un caso:

```bash
./gradlew compileJava --no-daemon
```

No se ejecutan pruebas ni `bootRun` durante la generacion.

## 7. Caso 1: sin autenticacion

### Cuando aplica

El usuario responde que el backend no necesita autenticacion.

### Modelo final

```text
Cliente HTTP -> endpoints publicos
```

### Eliminar

Eliminar completamente:

```text
users/controller/AuthController.java
users/service/UserAuthService.java
users/service/CustomUserDetailsService.java
users/filter/JwtAuthenticationFilter.java
users/provider/UserJwtTokenProvider.java
users/dto/UserLoginRequestDto.java
users/dto/AuthLoginResponseDto.java
users/dto/UserSessionDto.java
users/entity/RoleEntity.java
users/repository/RoleRepository.java
users/service/RoleService.java
users/controller/RoleController.java
users/dto/CreateRoleDto.java
users/dto/UpdateRoleDto.java
users/dto/RoleSessionDto.java
users/entity/PermissionEntity.java
users/repository/PermissionRepository.java
users/service/PermissionService.java
users/controller/PermissionController.java
users/dto/CreatePermissionDto.java
users/dto/UpdatePermissionDto.java
users/dto/PermissionSessionDto.java
common/constants/RoleConstants.java
common/constants/PermissionConstants.java
common/annotation/RequirePermission.java
common/aspect/PermissionCheckAspect.java
config/SecurityConfig.java
config/DataInitializer.java
```

Eliminar tambien el modulo `users` completo si ninguna clase del diagrama representa una entidad funcional equivalente. Si existe una clase funcional con ese nombre, regenerarla como una entidad CRUD normal, sin password, JWT, roles ni permisos.

### Editar

`build.gradle.kts`:

- Eliminar `spring-boot-starter-security`.
- Eliminar `spring-security-test`.
- Eliminar las tres dependencias JJWT.
- Eliminar AOP si `PermissionCheckAspect` era su unico uso.

`SwaggerConfig.java`:

- Eliminar `SecurityScheme` Bearer.
- Eliminar `SecurityRequirement`.
- Conservar titulo, version y OpenAPI.

`application.properties`:

- Eliminar propiedades `jwt.*`.
- Eliminar propiedades del usuario inicial.
- Conservar base de datos, Flyway, contexto y Swagger.

`.env.example`:

- Eliminar `JWT_SECRET` y `JWT_EXPIRATION`.
- Eliminar credenciales del usuario inicial.
- Conservar variables de aplicacion y base de datos.

`additional-spring-configuration-metadata.json`:

- Eliminar metadatos JWT y de usuario inicial.
- Eliminar el archivo si queda sin entradas.

`GlobalExceptionHandler.java`:

- Eliminar handlers que dependan exclusivamente de Spring Security.
- Conservar validacion y errores funcionales.

`V1__identity_and_access.sql`:

- Eliminar tablas `users`, `roles`, `permissions` y `role_permissions`.
- Eliminar el archivo si queda vacio.
- No eliminar una tabla equivalente si pertenece al dominio funcional; generarla en la migracion del dominio.

### Crear

No crear filters, providers, DTOs de login, tablas de seguridad ni anotaciones de autorizacion.

### Verificar

- No quedan imports de Spring Security.
- No quedan clases `Jwt*`.
- No quedan referencias a `PasswordEncoder`.
- No quedan `@RequirePermission` ni `@PreAuthorize`.
- Todos los controllers funcionales son accesibles sin JWT.

## 8. Caso 2: autenticacion basica

### Cuando aplica

Existe una entidad principal seleccionada, pero no existe rol ni permiso.

Este caso permite multiples registros de la entidad principal. No significa una sola cuenta global.

### Modelo final

```text
<principals>
├── id
├── identificador_login
└── password
```

### Conservar

- JWT, filter, provider y `SecurityConfig`.
- `AuthController` y DTOs de login/sesion.
- Repository y services de la entidad principal.
- Swagger Bearer.
- BCrypt.

### Eliminar

Eliminar todos los archivos de roles, permisos y autorizacion:

```text
RoleEntity.java
RoleRepository.java
RoleService.java
RoleController.java
CreateRoleDto.java
UpdateRoleDto.java
RoleSessionDto.java
PermissionEntity.java
PermissionRepository.java
PermissionService.java
PermissionController.java
CreatePermissionDto.java
UpdatePermissionDto.java
PermissionSessionDto.java
RoleConstants.java
PermissionConstants.java
RequirePermission.java
PermissionCheckAspect.java
```

### Editar

Entidad principal:

- Renombrar `UserEntity` y sus capas al nombre seleccionado.
- Eliminar `role` y `permissions`.
- Conservar ID, identificador, password y atributos UML.
- Mantener identificador unico y password no serializable.

Repository:

- Conservar busqueda por identificador de login.
- Eliminar `@EntityGraph` de roles o permisos.

Details service:

- Cargar la entidad principal sin authorities:

```java
return new User(login, password, Collections.emptyList());
```

Auth service y DTO de sesion:

- Eliminar roles y permisos de la respuesta.
- Mantener token y datos publicos del principal.

Controllers:

- Eliminar `@RequirePermission` y `@PreAuthorize`.
- Depender solamente de `authenticated()` configurado globalmente.

`DataInitializer`:

- Crear solamente una cuenta inicial si el template requiere acceso inicial.
- No crear roles ni permisos.

`build.gradle.kts`:

- Conservar Security y JWT.
- Eliminar AOP si no tiene otro uso.

`V1__identity_and_access.sql`:

- Crear solamente la tabla principal con sus campos UML y credenciales.
- Eliminar `roles`, `permissions`, `role_permissions` y `role_id`.

### Crear

- Crear los archivos renombrados de la entidad principal si el nombre difiere de `User`.
- Crear una consulta repository por el identificador de login elegido.

### Verificar

- Login produce JWT.
- No existen roles ni permisos.
- Todo endpoint distinto de login y Swagger requiere autenticacion.
- La sesion no contiene `role` ni `permissions`.

## 9. Caso 3: rol como atributo

### Cuando aplica

La entidad principal tiene un atributo UML que representa el rol y no existe una clase de rol separada.

### Modelo final

```text
<principals>
├── id
├── identificador_login
├── password
└── role
```

### Elegir tipo del rol

- Usar enum si el diagrama define valores cerrados.
- Usar `String` si el diagrama no define valores cerrados.
- No inventar valores de rol.

### Conservar

- JWT, filter, provider y Security.
- `@EnableMethodSecurity`.
- Auth controller y services.
- Swagger Bearer.

### Eliminar

- Todos los archivos de entidad, repository, service, controller y DTO de roles.
- Todos los archivos de permisos.
- `PermissionConstants`, `RequirePermission` y `PermissionCheckAspect`.
- `RoleConstants` si se genera un enum.

### Editar

Entidad principal:

- Eliminar `@ManyToOne` y `@JoinColumn` de `RoleEntity`.
- Agregar `RoleEnum role` o `String role`.
- Usar `@Enumerated(EnumType.STRING)` cuando sea enum.

DTOs:

- Recibir el rol directamente, no `roleId`.
- Validar los valores permitidos.
- Exponer el rol en el DTO de sesion.

Details service:

- Convertir el valor del atributo en una authority.

Controllers:

- Reemplazar `@RequirePermission` por `@PreAuthorize` con roles existentes.
- No inventar reglas para endpoints si el diagrama no aporta informacion suficiente.

`DataInitializer`:

- Crear la cuenta inicial con un valor de rol valido.
- No crear registros de roles ni permisos.

`V1__identity_and_access.sql`:

- Crear una columna `role` en la tabla principal.
- Eliminar `role_id`, `roles`, `permissions` y `role_permissions`.
- Agregar `CHECK` solo si los valores son cerrados.

### Crear

- Crear `<Role>Enum.java` cuando el diagrama define un enum.

### Verificar

- No existen tablas o repositories de roles.
- El JWT autentica al principal.
- `@PreAuthorize` compara authorities con los valores reales del atributo.

## 10. Caso 4: un rol mediante tabla, sin permisos

### Cuando aplica

Existe una relacion `N:1` entre la entidad principal y una entidad de roles. No existe una entidad de permisos.

### Modelo final

```text
<principals> N -------- 1 <roles>
```

### Conservar

- JWT, filter, provider y Security.
- Entidad, repository, service, controller y DTOs de roles.
- `RoleConstants` solo si el inicializador necesita roles base.
- `@EnableMethodSecurity`.

### Eliminar

- Todos los archivos de permisos.
- `PermissionConstants`.
- `RequirePermission`.
- `PermissionCheckAspect`.
- `permissionIds` de DTOs de roles.
- `role_permissions` de SQL.

### Editar

Entidad principal:

- Agregar relacion `@ManyToOne` hacia `<Role>Entity`.
- Usar `@JoinColumn` no nulo cuando el diagrama lo requiera.

Entidad de rol:

- Conservar atributos del diagrama.
- Eliminar coleccion de permisos.
- No agregar permisos inexistentes.

Repository principal:

- Cargar el rol con `@EntityGraph(attributePaths = {"role"})` cuando la respuesta lo use.

Details service:

- Convertir el nombre o identificador del rol en una authority.

DTOs:

- Los DTOs de principal reciben `roleId`.
- Los DTOs de rol no reciben `permissionIds`.
- La sesion devuelve el rol sin permisos.

Controllers:

- Eliminar `@RequirePermission`.
- Usar `@PreAuthorize` con roles cuando exista una regla explicita.

`DataInitializer`:

- Crear roles base y cuenta inicial.
- No crear permisos.

`V1__identity_and_access.sql`:

- Crear tabla principal y tabla de roles.
- Crear `role_id` y su foreign key.
- Eliminar tablas de permisos.

### Crear

- Crear o renombrar todas las capas de `<Role>` si el nombre difiere del template.
- Crear constantes de rol solo para valores iniciales requeridos.

### Verificar

- Cada principal tiene un solo rol.
- Un rol puede pertenecer a varios principales.
- No existe ninguna referencia funcional a permisos.

## 11. Caso 5: un rol mediante tabla con permisos

### Cuando aplica

Existe una relacion `N:1` entre principal y rol, y una relacion `N:N` entre rol y permiso.

Este es el modelo actual del template.

### Modelo final

```text
<principals> N -------- 1 <roles>
<roles>      N -------- N <permissions>
                       role_permissions
```

### Conservar

- Toda la infraestructura JWT y Security.
- `RequirePermission` y `PermissionCheckAspect`.
- `PermissionConstants`.
- Todas las capas de rol y permiso.
- AOP.
- Relacion `role_permissions`.

### Eliminar

- No eliminar archivos de seguridad por defecto.
- Eliminar solamente campos, imports, constantes o endpoints que contradigan el diagrama.
- Eliminar permisos iniciales del template que no correspondan a funcionalidades existentes.

### Editar

Entidad principal:

- Adaptar `UserEntity` a `<Principal>Entity`.
- Conservar una relacion `@ManyToOne` con `<Role>Entity`.

Entidad de rol:

- Adaptar nombre, tabla y atributos al diagrama.
- Conservar `@ManyToMany` con permisos y `@JoinTable`.

Entidad de permiso:

- Adaptar nombre, tabla y atributos.
- Mantener nombre unico de permiso.

Repositories:

- Cargar `role.permissions` cuando se crea la sesion.
- Evitar consultas N+1 mediante `@EntityGraph` o consulta equivalente.

DTOs:

- Principal recibe `roleId`.
- Rol recibe `permissionIds`.
- Sesion devuelve rol y permisos.
- Nunca devolver password.

Details service:

- Convertir permisos del rol en authorities.
- No utilizar el nombre del rol como sustituto de permisos, salvo una regla explicita.

Controllers funcionales:

- Declarar permisos con `@RequirePermission`.
- Cada permiso utilizado debe existir en `PermissionConstants` y `DataInitializer`.

`DataInitializer`:

- Sincronizar permisos del dominio generado.
- Crear roles base.
- Asignar permisos a roles.
- Crear cuenta inicial con un rol valido.

`V1__identity_and_access.sql`:

- Adaptar nombres de tablas al diagrama.
- Conservar tablas principal, roles, permisos y tabla intermedia.
- Conservar foreign keys y constraints unicos.

### Crear

- Crear constantes de permiso para endpoints funcionales generados.
- Crear entradas del inicializador para esos permisos.
- Crear o renombrar capas de principal, rol y permiso segun las clases seleccionadas.

### Verificar

- Cada principal tiene exactamente un rol.
- Cada rol puede tener varios permisos.
- Las authorities provienen de permisos.
- Todo `@RequirePermission` referencia una constante existente.

## 12. Caso 6: multiples roles con permisos

### Cuando aplica

Existe una relacion `N:N` entre principal y rol. Los permisos se obtienen mediante los roles.

### Modelo final

```text
<principals> N -------- N <roles>
                      principal_roles

<roles>      N -------- N <permissions>
                      role_permissions
```

### Conservar

- JWT, Security, permisos, aspect y AOP.
- Todas las capas de roles y permisos.
- `RequirePermission` y `PermissionConstants`.

### Eliminar

- Eliminar `role_id` de la entidad principal y SQL.
- Eliminar campos singulares `role` y `roleId`.
- Eliminar logica que presuponga un unico rol.

### Editar

Entidad principal:

- Agregar `@ManyToMany` con la entidad de roles.
- Usar una tabla intermedia `<principal>_roles`.
- Inicializar la coleccion para evitar `null`.

DTOs:

- `Create<Principal>Dto` y `Update<Principal>Dto` reciben `roleIds`.
- DTO de sesion devuelve una lista de roles.
- DTO de sesion devuelve permisos efectivos sin duplicados.

Repository principal:

- Cargar `roles` y `roles.permissions` para autenticacion.
- Evitar duplicados mediante `distinct` cuando sea necesario.

Details service:

- Recorrer todos los roles.
- Unir sus permisos.
- Eliminar authorities duplicadas.

Principal service:

- Validar que todos los `roleIds` existan.
- Reemplazar la asignacion completa dentro de una transaccion.

`DataInitializer`:

- Crear permisos y roles.
- Asignar uno o mas roles a la cuenta inicial.

`V1__identity_and_access.sql`:

- Eliminar `role_id` de la tabla principal.
- Crear `<principal>_roles` con primary key compuesta o constraint unico.
- Conservar `role_permissions`.

### Crear

- Crear entidad o mapping de tabla intermedia si el estilo JPA lo requiere.
- Crear consultas para cargar roles y permisos completos.

### Verificar

- Un principal puede tener varios roles.
- No queda ninguna referencia a un rol singular.
- Los permisos efectivos no se duplican.

## 13. Caso 7: permisos directos sin roles

### Cuando aplica

Existe una relacion `N:N` entre principal y permiso y no existe una entidad de rol seleccionada.

### Modelo final

```text
<principals> N -------- N <permissions>
                      principal_permissions
```

### Conservar

- JWT y Spring Security.
- Entidad, repository, service, controller y DTOs de permisos.
- `RequirePermission`, `PermissionConstants` y `PermissionCheckAspect`.
- AOP.

### Eliminar

- Todos los archivos de roles.
- `RoleConstants`.
- `role_id`.
- `role_permissions`.
- Campos `role`, `roles`, `roleId` y `roleIds`.

### Editar

Entidad principal:

- Agregar relacion `@ManyToMany` directa con permisos.
- Usar tabla intermedia `<principal>_permissions`.

DTOs:

- DTOs de principal reciben `permissionIds`.
- DTO de sesion devuelve permisos directos.
- No devolver roles.

Repository principal:

- Cargar permisos directos para autenticacion.

Details service:

- Convertir permisos directos en authorities.

Principal service:

- Validar que todos los permisos existan.
- Asignarlos dentro de una transaccion.

`DataInitializer`:

- Crear permisos.
- Asignarlos directamente a la cuenta inicial.
- No crear roles.

`V1__identity_and_access.sql`:

- Crear tabla principal, permisos y `<principal>_permissions`.
- Eliminar tablas de roles y `role_permissions`.

### Crear

- Crear tabla intermedia y foreign keys.
- Crear consultas para cargar permisos directos.

### Verificar

- No existen roles como mecanismo de seguridad.
- Las authorities provienen de permisos directos.
- Todo `@RequirePermission` referencia un permiso inicializado.

## 14. Regla adicional de propietario del recurso

Esta regla no es otro caso de autenticacion. Puede combinarse con los casos 2 al 7.

Aplica cuando existe una relacion entre la entidad principal y una entidad funcional:

```text
<Principal> 1 -------- N <Resource>
```

### Crear o editar

Entidad funcional:

- Agregar relacion hacia `<Principal>Entity`.
- Definir la foreign key de propietario.

Repository funcional:

- Crear consultas filtradas por ID de recurso e ID del principal.
- Crear listados filtrados por principal.

Service funcional:

- Obtener el principal desde `SecurityContext`.
- No confiar en `principalId` enviado por el cliente.
- Verificar propiedad antes de leer, editar o eliminar.
- Usar `@Transactional` en cambios de propietario.

DTOs:

- No aceptar libremente el propietario en operaciones normales.
- Exponerlo en respuesta solo si el contrato lo requiere.

Migracion:

- Crear foreign key hacia la tabla principal.
- Crear indice por propietario.

### Verificar

- Un principal no accede a recursos de otro.
- Un rol administrativo solo omite la restriccion si existe una regla explicita.
- Los listados se filtran en base de datos, no despues de cargar todos los registros.

## 15. Matriz resumida

| Elemento | Caso 1 | Caso 2 | Caso 3 | Caso 4 | Caso 5 | Caso 6 | Caso 7 |
|---|---|---|---|---|---|---|---|
| JWT | Eliminar | Conservar | Conservar | Conservar | Conservar | Conservar | Conservar |
| Spring Security | Eliminar | Conservar | Conservar | Conservar | Conservar | Conservar | Conservar |
| Principal | Dominio normal | Conservar | Conservar | Conservar | Conservar | Conservar | Conservar |
| Rol atributo | No | No | Si | No | No | No | No |
| Tabla de roles | No | No | No | Si | Si | Si | No |
| Varios roles | No | No | No | No | No | Si | No |
| Tabla de permisos | No | No | No | No | Si | Si | Si |
| `RequirePermission` | Eliminar | Eliminar | Eliminar | Eliminar | Conservar | Conservar | Conservar |
| `@PreAuthorize` por rol | No | No | Si | Si | Opcional | Opcional | No |
| Tabla intermedia principal-rol | No | No | No | No | No | Si | No |
| Tabla intermedia rol-permiso | No | No | No | No | Si | Si | No |
| Tabla intermedia principal-permiso | No | No | No | No | No | No | Si |

## 16. Verificacion final

Despues de aplicar cualquier caso:

1. Buscar referencias a clases eliminadas en todo `src`.
2. Verificar que nombres de archivo, clases publicas, packages e imports coincidan.
3. Verificar que exista una sola entidad principal autenticada.
4. Verificar que el modelo JPA coincida con Flyway.
5. Verificar que no coexistan `role`, `role_id` y `<principal>_roles` para la misma finalidad.
6. Verificar que no existan permisos sin `PermissionCheckAspect` o sin authorities.
7. Verificar que no exista `RequirePermission` cuando se eliminaron permisos.
8. Verificar que el DTO de respuesta nunca incluya password o secretos.
9. Verificar que login y Swagger sean las unicas rutas publicas en casos autenticados, salvo una regla explicita.
10. Verificar que `build.gradle.kts` solo conserve dependencias utilizadas.
11. Verificar que `.env.example` no contenga secretos reales.
12. Ejecutar:

```bash
./gradlew compileJava --no-daemon
```

La generacion solo puede continuar al ZIP si el comando termina con codigo `0`.

## Restricciones

- No inventar clases de principal, rol o permiso no seleccionadas por el usuario.
- No inferir una tabla de seguridad solamente por el nombre de una clase.
- No mezclar dos casos principales.
- No asignar roles o permisos que no aparezcan en el diagrama o en una regla generada para endpoints reales.
- No modificar el Gradle Wrapper.
- No introducir secretos en archivos generados.
- No permitir que la IA escriba fuera de la copia temporal del template.
