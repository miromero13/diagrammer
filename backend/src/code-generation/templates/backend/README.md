# Backend de usuarios y acceso

Backend Spring Boot para gestionar usuarios, roles y permisos, con autenticacion JWT y autorizacion mediante permisos.

## Requisitos

- Java 17 o superior
- PostgreSQL 12 o superior
- No es necesario instalar Gradle: el proyecto incluye Gradle Wrapper.

## Configuracion

Configura las variables de entorno necesarias:

```env
SERVER_PORT=8090
DB_URL=jdbc:postgresql://localhost:5432/access_db
DB_USERNAME=postgres
DB_PASSWORD=tu_contrasena
JPA_DDL_AUTO=validate
JWT_SECRET=una_clave_larga_y_segura
JWT_EXPIRATION=3600000
SU_EMAIL=admin@example.com
SU_PASSWORD=Admin@123
```

Las migraciones de identidad y acceso crean solamente:

- `users`
- `roles`
- `permissions`
- `role_permissions`

Al iniciar, `DataInitializer` crea los permisos CRUD, los roles base y el usuario superadministrador.

## Ejecutar

```bash
./gradlew bootRun
```

La API queda disponible en `http://localhost:8090/api` y Swagger en `http://localhost:8090/api/docs`.

## Verificacion de compilacion

Compila el codigo principal y los tests sin ejecutar pruebas:

```bash
./gradlew testClasses --no-daemon
```

Para ejecutar las pruebas:

```bash
./gradlew test
```
