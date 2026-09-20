# Plan de implementación por fases: Generación de backend Spring Boot

## Contexto

El sistema generará un backend Spring Boot desde un diagrama UML, usando el template ubicado en:

```text
backend/src/code-generation/templates/backend/
```

Se implementará de forma progresiva. En cada fase se desarrollará la parte necesaria de backend y frontend; después se probará el flujo completo desde el frontend.

En el backend todo debe estar en la el modulo de code-generation. En el frontend en la parte de diagrams.

Cada generación crea **un solo ZIP**. El ZIP contiene lo que el generador puede producir hasta la última fase implementada y solo se habilita si el backend generado compila correctamente.

```bash
./gradlew compileJava --no-daemon
./gradlew testClasses --no-daemon
```

No se ejecutarán:

```bash
./gradlew test
./gradlew bootRun
```

---

## Formulario inicial de generación

Antes de generar, el frontend mostrará:

```text
Nombre del backend: [________________]

¿El backend necesita autenticación?
( ) No
( ) Sí

Clase principal:        [Seleccionar clase del diagrama]
Clase de rol:           [Opcional]
Clase de permiso:       [Opcional]
```

* [ ] El nombre del backend es obligatorio y cumple `[a-z][a-z0-9_]{0,62}`.
* [ ] Si no hay autenticación, no se muestran los selectores de clases.
* [ ] Si hay autenticación, la clase principal es obligatoria.
* [ ] Las clases se seleccionan desde los nodos reales del diagrama.
* [ ] El frontend guarda el diagrama antes de iniciar la generación.
* [ ] El backend valida las clases seleccionadas contra el diagrama congelado.

Payload:

```json
{
  "backendName": "mi_backend",
  "authentication": {
    "enabled": true,
    "principalClassId": "user-node-id",
    "roleClassId": "role-node-id",
    "permissionClassId": "permission-node-id"
  }
}
```

---

## Fases de implementación

* [ ] **Fase 1: Template copiado**

  **Backend**

  * [ ] Crear entidad, migración y persistencia de generaciones.
  * [ ] Crear endpoint para iniciar una generación.
  * [ ] Copiar de forma segura el template desde `backend/src/code-generation/templates/backend/`.
  * [ ] Excluir `.env`, `.gradle/`, `build/` y secretos.
  * [ ] Renombrar package, proyecto Gradle, carpeta raíz y documentación.
  * [ ] Ejecutar Gradle.
  * [ ] Crear y guardar el ZIP solo si compila.
  * [ ] Crear endpoints de estado y descarga.

  **Frontend**

  * [ ] Agregar botón **Generar backend**.
  * [ ] Mostrar formulario inicial.
  * [ ] Iniciar generación.
  * [ ] Consultar estado.
  * [ ] Mostrar card de progreso.
  * [ ] Permitir descargar el ZIP.

  **Resultado:** ZIP con el template Spring Boot renombrado y compilado.

---

* [x] **Fase 2: Diagrama analizado**

  **Backend**

   * [x] Crear un snapshot inmutable del diagrama.
   * [x] Normalizar `elements` y `connections` en un modelo estructurado obligatorio.
   * [x] Derivar el modelo relacional obligatorio (tablas, columnas de atributos y relaciones, FKs, asociaciones, herencia joined, enums y exclusiones) como entrada estructurada de las fases posteriores.
   * [x] Validar clases, atributos, tipos, relaciones y nombres duplicados.
   * [x] Reconocer y validar enums UML, incluyendo sus literales.
   * [x] Crear `uml-analysis.json` y `UML_ANALYSIS.md` en la raíz del backend generado; el JSON normalizado es la fuente autoritativa para las fases 3-6 y Markdown solo el reporte humano derivado.
   * [x] Detener la generación si el UML es inválido.

  Contenido mínimo de `UML_ANALYSIS.md`:

  ```text
  # Análisis UML

  ## Clases detectadas
  ## Interfaces detectadas
   ## Clases abstractas detectadas
   ## Enums detectados
   ## Atributos detectados
  ## Relaciones detectadas
  ## Configuración de autenticación seleccionada
  ## Errores de validación
  ## Advertencias
  ```

  **Frontend**

   * [x] Mostrar la etapa **Diagrama analizado**.
   * [x] Mostrar errores concretos del UML.
   * [x] Permitir al usuario volver al editor para corregirlos.

  **Resultado:** ZIP con el template y el archivo `UML_ANALYSIS.md`.

---

* [ ] **Fase 3: Autenticación y autorización**

  Esta fase se ejecuta inmediatamente después del análisis UML.

  El template contiene:

  ```text
  ROLES_AND_PERMISSIONS.md
  ```

  Ese archivo es la autoridad para adaptar la autenticación, los roles y los permisos. La IA debe seguir sus reglas y no inventar otra arquitectura de seguridad.

  **Backend**

  * [ ] Leer la configuración enviada en el formulario.
  * [ ] Leer y aplicar `ROLES_AND_PERMISSIONS.md`.
  * [ ] Seleccionar el caso correcto.
  * [ ] Conservar, modificar o eliminar JWT, roles, permisos, filtros, providers, tablas y endpoints según el caso.

  Casos de autenticación:

  * [ ] Caso 1: Sin autenticación.
  * [ ] Caso 2: Autenticación básica sin roles ni permisos.
  * [ ] Caso 3: Rol como atributo de la entidad principal.
  * [ ] Caso 4: Un rol mediante tabla, sin permisos.
  * [ ] Caso 5: Un rol mediante tabla con permisos.
  * [ ] Caso 6: Múltiples roles con permisos.
  * [ ] Caso 7: Permisos directos sin roles.

  **Frontend**

  * [ ] Enviar clase principal, rol y permiso seleccionados.
  * [ ] Mostrar la etapa **Generando autenticación y seguridad**.
  * [ ] Mostrar la configuración elegida.

  **Resultado:** ZIP con seguridad adaptada al diagrama y al formulario.

---

* [ ] **Fase 4: Modelo de dominio**

  **Backend**

  * [ ] Generar entidades para clases concretas.
  * [ ] Generar interfaces Java.
  * [ ] Generar clases abstractas.
  * [ ] Generar atributos y tipos Java.
  * [ ] Usar `BaseEntity`, UUID, `@Entity` y `@Table`.
  * [ ] No generar controllers, services ni repositories para interfaces o clases abstractas.

  **Frontend**

  * [ ] Mostrar la etapa **Generando modelo de dominio**.

  **Resultado:** ZIP con entidades e interfaces generadas desde el UML.

---

* [ ] **Fase 5: Persistencia**

  **Backend**

  * [ ] Generar relaciones JPA.
  * [ ] Generar repositories.
  * [ ] Generar migraciones Flyway.
  * [ ] Crear foreign keys, índices, constraints y tablas intermedias.
  * [ ] Aplicar reglas para asociaciones, agregación, composición, herencia y relaciones N:N.

  **Frontend**

  * [ ] Mostrar la etapa **Generando persistencia**.
  * [ ] Mostrar errores cuando una relación sea inválida.

  **Resultado:** ZIP con entidades, relaciones JPA, repositories y migraciones.

---

* [ ] **Fase 6: API y negocio**

  **Backend**

  * [ ] Generar DTOs de creación, actualización y respuesta.
  * [ ] Generar services.
  * [ ] Generar controllers REST.
  * [ ] Aplicar Jakarta Validation.
  * [ ] Aplicar `@Transactional` cuando corresponda.
  * [ ] Generar documentación OpenAPI.
  * [ ] Usar `ResponseMessage`.
  * [ ] Aplicar seguridad y permisos según el caso seleccionado.

  **Frontend**

  * [ ] Mostrar la etapa **Generando API y negocio**.

  **Resultado:** ZIP con endpoints REST funcionales.

---

* [ ] **Fase 7: Revisión, compilación y entrega**

  **Backend**

  * [ ] Revisar archivos Java y recursos permitidos con IA.
  * [ ] Limitar a la IA al proyecto temporal y a archivos permitidos.
  * [ ] Ejecutar `compileJava` y `testClasses`.
  * [ ] Corregir errores y reintentar como máximo dos veces.
  * [ ] Crear ZIP solo si ambos comandos terminan con código `0`.
  * [ ] Guardar checksum, tamaño, fecha de creación y expiración.
  * [ ] Permitir descarga solo al owner de la generación.

  **Frontend**

  * [ ] Mostrar intento de compilación.
  * [ ] Mostrar errores de Gradle.
  * [ ] Mostrar modal de resultado.
  * [ ] Habilitar **Descargar ZIP** al completar.
  * [ ] Mostrar **Reintentar** cuando corresponda.

  **Resultado:** ZIP final, compilado y descargable.

---

## Estados globales de generación

El backend guardará estos valores en inglés como enum; el frontend mostrará la etiqueta en español.

| Enum                     | Texto mostrado                      |
| ------------------------ | ----------------------------------- |
| `QUEUED`                 | En espera                           |
| `COPYING_TEMPLATE`       | Copiando template                   |
| `PARSING_DIAGRAM`        | Analizando diagrama                 |
| `VALIDATING_DIAGRAM`     | Validando diagrama                  |
| `GENERATING_SECURITY`    | Generando autenticación y seguridad |
| `GENERATING_DOMAIN`      | Generando modelo de dominio         |
| `GENERATING_PERSISTENCE` | Generando persistencia              |
| `GENERATING_API`         | Generando API y negocio             |
| `REVIEWING_FILES`        | Revisando archivos con IA           |
| `COMPILING`              | Compilando con Gradle               |
| `FIXING_COMPILATION`     | Corrigiendo errores de compilación  |
| `PACKAGING_ZIP`          | Creando archivo ZIP                 |
| `COMPLETED`              | Completado                          |
| `FAILED`                 | Fallido                             |

---

## Estados de cada etapa en el card

| Enum          | Texto      | Indicador                  |
| ------------- | ---------- | -------------------------- |
| `PENDING`     | Pendiente  | Círculo vacío              |
| `IN_PROGRESS` | En proceso | Spinner o indicador activo |
| `COMPLETED`   | Completada | Check verde                |
| `FAILED`      | Fallida    | Ícono rojo                 |

---

## Consulta de estado

El frontend consultará:

```http
GET /api/code-generation/:generationId/status
```

Respuesta esperada:

```json
{
  "status": "GENERATING_DOMAIN",
  "message": "Generando entidades e interfaces...",
  "compileAttempt": 0,
  "steps": [
    {
      "id": "COPYING_TEMPLATE",
      "label": "Template copiado",
      "status": "COMPLETED"
    },
    {
      "id": "PARSING_DIAGRAM",
      "label": "Diagrama analizado",
      "status": "COMPLETED"
    },
    {
      "id": "GENERATING_SECURITY",
      "label": "Generando autenticación y seguridad",
      "status": "COMPLETED"
    },
    {
      "id": "GENERATING_DOMAIN",
      "label": "Generando modelo de dominio",
      "status": "IN_PROGRESS"
    },
    {
      "id": "GENERATING_PERSISTENCE",
      "label": "Generando persistencia",
      "status": "PENDING"
    }
  ]
}
```

El frontend mostrará un card como este:

```text
┌─────────────────────────────────────────────────────┐
│ Generando backend                                    │
│                                                     │
│ ✓  Template copiado                    Completada   │
│ ✓  Diagrama analizado                  Completada   │
│ ✓  Generando autenticación y seguridad Completada   │
│ ●  Generando modelo de dominio          En proceso  │
│ ○  Generando persistencia               Pendiente   │
│                                                     │
│ Mensaje: Generando entidades e interfaces...        │
└─────────────────────────────────────────────────────┘
```

* [ ] El card solo muestra fases que ya estén implementadas.
* [ ] Las fases futuras aún no implementadas no aparecen.
* [ ] La fase activa usa `IN_PROGRESS`.
* [ ] Las fases completadas usan `COMPLETED`.
* [ ] Las fases pendientes usan `PENDING`.
* [ ] Si una fase falla, usa `FAILED` y detiene el flujo.
* [ ] Cuando la generación termina, muestra **Descargar ZIP**.
* [ ] Si falla, muestra los errores y **Reintentar** cuando corresponda.
