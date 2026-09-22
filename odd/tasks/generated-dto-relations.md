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
- Next step: commit the verified work unit; generated Gradle compilation remains intentionally unrun.

## Verification record

- Focused generator tests — 72 passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Legacy template adaptation path and unrelated worktree changes — preserved.

## Bounded behavior

- Writable relationships targeting entities without generated repositories now fail generation explicitly with the relation and target name instead of emitting uncompilable service wiring.
