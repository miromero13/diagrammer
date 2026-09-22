# Generated DTO inheritance and relations

## Objective

Make generated CRUD DTOs represent inherited fields and UML relationships instead of exposing only direct scalar attributes.

## Problem

`CreateAdminDto` currently contains only `department` even when `Admin` inherits persisted fields from `User`. Relationship IDs are also omitted, so generated services cannot create entities that depend on existing related rows.

## Scope

- Flatten persisted scalar attributes from UML ancestors into concrete DTOs.
- Represent owning-side `ManyToOne`/`OneToOne` relationships with UUID IDs.
- Represent collection relationships with UUID ID collections where the generated model owns them.
- Resolve relationship IDs in generated services and keep response DTOs cycle-safe.
- Generate child DTOs with Java `extends` instead of copying inherited fields.
- Generate CRUD DTO/service/controller support for materialized many-to-many association classes.
- Preserve the current simple scalar mapper behavior.

## Constraints

- Keep the implementation deterministic and minimal.
- Do not modify the legacy template adaptation path.
- Do not expose inherited relationships as parent IDs.
- Preserve unrelated worktree changes.
- Do not run generated Gradle commands or connect to a database.

## Authorized scope and route

- Route: delegated direct writer, because the fix spans DTO generation, mapper/service generation, and tests.
- Authorized files: `backend/src/code-generation/dto-generator.ts`, `backend/src/code-generation/service-generator.ts`, their focused specs, and supporting generator code only if required by the existing relational model.
- Advisory changed-line forecast: under 400 authored lines.

## Tasks

- [x] DR-1 Build effective inherited DTO attributes and relationship ID fields for create, update, and response DTOs.
- [x] DR-2 Generate service-side relationship resolution while preserving scalar mapper behavior and null/update semantics.
- [x] DR-3 Add focused tests for inheritance, singular relations, collection relations, required IDs, and generated service wiring.
- [x] DR-4 Generate association-class relation IDs and CRUD wiring for materialized many-to-many links.
- [x] DR-5 Render child create/update/response DTOs with `extends` and keep inherited fields out of child bodies.

## Acceptance criteria

- A concrete child DTO contains its persisted inherited scalar fields and own fields.
- Inheritance does not create a synthetic parent ID.
- A required many-side relationship produces a required `UUID <field>Id` in create DTOs.
- Optional relation IDs are not marked required; update DTO relation IDs remain optional.
- Generated services resolve IDs through repositories before saving and fail clearly when a referenced row is absent.
- Generated response DTOs expose relation IDs or ID collections without serializing entity graphs.
- Existing scalar-only generation remains unchanged.

## Checks

- Focused DTO and service generator tests.
- `npm run build`.
- `git diff --check`.

## Progress

- Status: complete.
- Next step: none; generated Gradle compilation remains intentionally unrun.

## Verification record

- Focused generator tests — 75 passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Legacy template adaptation path and unrelated worktree changes — preserved.
- Work-unit commit: `4a5c007` (`fix: include inherited fields and relation ids in generated DTOs`).
- Work-unit commit: `95a22fe` (`fix: generate association and inherited DTOs`).

## Bounded behavior

- Writable relationships targeting entities without generated repositories now fail generation explicitly with the relation and target name instead of emitting uncompilable service wiring.
- Materialized association classes receive their own relation-ID DTOs and CRUD generation; endpoint DTO responses expose read-only association-class ID collections.
- Child DTO declarations extend persisted parent DTOs; inherited fields and relation mappings remain available to generated mappers without synthetic parent IDs.
