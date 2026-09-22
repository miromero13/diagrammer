# Phase 6: UML operations and interfaces

Generate Java operations and type contracts from normalized UML while keeping interfaces out of persistence.

## Objective

- Generate methods declared by UML classes, abstract classes, and interfaces.
- Preserve implementation and inheritance relationships as Java `implements` and `extends` declarations.
- Keep interface contracts non-persistible and avoid inventing business behavior.

## Scope

- Extend the domain generator with method signatures, safe placeholder bodies, and relationship declarations.
- Keep persistence-generated entity files aligned with the same operations and UML relationships because persistence overwrites concrete domain files.
- Generate only minimal `UnsupportedOperationException` bodies when a concrete method has no UML implementation.
- Add focused generator regressions for interfaces, abstract methods, implementations, inheritance, operation type imports, and interface table exclusion.

## Constraints

- No DTOs, services, controllers, OpenAPI, or validation generation in this phase.
- Interfaces never produce JPA tables, entities, repositories, or migrations.
- Do not infer business logic from method names, return types, or relationships.
- Preserve unrelated working-tree changes and do not run `./gradlew test` or `./gradlew bootRun`.

## Tasks

- [x] `uml-operations-model-20260921`: render normalized UML operations for classes, abstract classes, and interfaces.
- [x] `uml-operations-contracts-20260921`: render `implements` and `extends` from normalized UML relationships and keep interfaces out of persistence.
- [x] `uml-operations-verification-20260921`: add focused regressions and run the allowed backend checks.

## Authorized scope and route

- **Authorized roots:** `backend/src/code-generation/`, `odd/tasks/uml-operations-interfaces.md`.
- **Implementation route:** delegated direct writer; implementation touches multiple non-trivial generator and test files.
- **Trigger evidence:** operation rendering must be shared by domain output and persistence output because `CodeGenerationService` writes persistence files after domain files.
- **TDD mode:** standard mode; no project capability cache declares strict TDD. Test runner: `cd backend && npm test -- --runInBand <specs>`.
- **Delivery strategy:** stacked-to-main; this Phase 6 commit is the first reviewable feature slice. Unrelated working-tree files remain unstaged.

## Acceptance criteria

- Methods preserve names, parameters, return types, static/abstract semantics where Java permits them, and visibility where applicable.
- Concrete methods without an implementation compile with a minimal unsupported-operation stub rather than invented business logic.
- Interfaces expose contract signatures; implementing classes emit `implements`; inheritance emits `extends`.
- Interface elements remain absent from `relationalModel.tables` and persistence files.
- Focused tests, backend build, and `git diff --check` pass; prohibited Gradle commands are not run.

## Progress

- **Status:** Complete.
- **Implementation:** Generated operations and Java contracts for classes, abstract classes, and interfaces; preserved multi-parent interface inheritance; kept interfaces out of persistence; and used unsupported-operation stubs instead of inventing business logic.
- **Verification:** `cd backend && npm test -- --runInBand code-generation/domain-model-generator.spec.ts code-generation/uml-analysis.spec.ts code-generation/persistence-generator.spec.ts` — 3 suites and 49 tests passed. `cd backend && npm run build` — passed. `git diff --check` — passed. Gradle tests and `bootRun` were not run per constraint.
- **Runtime harness:** N/A — this unit is backend source generation; `bootRun` remains intentionally excluded.
- **Rollback boundary:** Revert the Phase 6 generator, analysis, focused-spec, and task-document changes in this unit; unrelated working-tree files are outside the boundary.
- **Next step:** Commit this work unit after excluding unrelated working-tree files.

## Mirror status

- **Repository-relative locator:** `odd/tasks/uml-operations-interfaces.md`
- **Engram topic:** `odd/uml-operations-interfaces/tasks`
- **Status:** Pending until the authoritative runtime session is available.
