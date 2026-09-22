# Proyecto backend generado

Proyecto Spring Boot generado a partir de un diagrama UML.

## Requisitos

- Java 17 o superior
- PostgreSQL
- Shell o terminal

## Configuración inicial

1. Crea en PostgreSQL la base de datos indicada por `DB_URL`. Por defecto, `.env.example` apunta a `backend_db`.
2. Copia `.env.example` a `.env` y completa las credenciales de PostgreSQL, el secreto JWT y las credenciales del superadministrador.

| Variable | Valor en `.env.example` | Valor predeterminado de la aplicación |
|---|---|---|
| `SERVER_PORT` | `8090` | `8090` |
| `DB_URL` | `jdbc:postgresql://localhost:5432/backend_db` | `jdbc:postgresql://localhost:5432/mrp_db` |
| `DB_USERNAME` | `ilseromero` | `postgres` |
| `DB_PASSWORD` | vacío | vacío |
| `JPA_DDL_AUTO` | `update` | `update` |
| `FLYWAY_ENABLED` | no definido | `false` |
| `JWT_SECRET` | `replace-with-a-long-random-secret` | `replace-with-a-long-random-secret` |
| `JWT_EXPIRATION` | `3600000` | `3600000` |
| `SU_EMAIL` | vacío | `admin@gmail.com` |
| `SU_PASSWORD` | vacío | `Admin@123` |

Hibernate administra las actualizaciones del esquema por defecto (`JPA_DDL_AUTO=update`). Flyway está deshabilitado por defecto (`FLYWAY_ENABLED=false`).

## Ejecutar

```bash
cp .env.example .env
chmod +x gradlew
./gradlew clean compileJava --no-daemon
./gradlew bootRun
```

Para ejecutar las pruebas opcionales:

```bash
./gradlew test
```

## Solución de problemas

Si `gradlew` pierde permisos después de extraer el proyecto, ejecuta nuevamente `chmod +x gradlew`. El generador también aplica este permiso antes de realizar su propia compilación.
