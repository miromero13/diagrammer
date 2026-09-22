# Phase 7: DTOs and validations

Generate the smallest useful API boundary for the current Spring Boot generator: create, update, response, and query DTOs with UML-derived validation and explicit entity/DTO mapping.

## Objective

- Generate DTOs for create, update, response, and query operations.
- Derive Jakarta Validation annotations from normalized UML attributes without inventing business rules.
- Generate deterministic conversion methods between DTOs and entities.

## Scope

- Add one focused API generator consumed by the current `CodeGenerationService` pipeline after persistence generation.
- Generate DTO classes and mapper methods only; do not add services, controllers, OpenAPI, or authentication changes.
- Use normalized UML attributes and their source types/multiplicity as the authoritative input.

## Constraints

- Preserve unrelated working-tree changes.
- Do not run `./gradlew test` or `./gradlew bootRun`.
- Do not add dependencies; use Jakarta Validation already present in the generated template.
- Keep generated artifacts in English.

## Tasks

- [x] `dto-model-20260921`: generate create, update, response, and query DTOs from normalized UML.
- [x] `dto-validation-20260921`: derive safe validation annotations from UML attributes and multiplicity.
- [x] `dto-mapping-20260921`: generate explicit entity/DTO conversion methods and focused regressions.
- [x] `dto-verification-20260921`: run focused tests, backend build, and diff validation.

## Authorized scope and route

- **Authorized roots:** `backend/src/code-generation/`, `odd/tasks/dto-validations.md`.
- **Implementation route:** delegated direct writer; the change spans generator orchestration, generated Java output, and tests.
- **TDD mode:** standard mode; use the existing backend Jest scripts.
- **Delivery strategy:** stacked-to-main; one reviewable work-unit commit.

## Acceptance criteria

- Each persistible UML class gets create, update, response, and query DTOs.
- Required and size/type constraints come only from explicit UML attribute data; absent constraints remain absent.
- Generated mappings copy scalar fields and do not expose entity internals in request DTOs.
- Generated output is deterministic and compiles at the TypeScript level; prohibited Gradle commands are not run.

## Progress

- **Status:** Complete.
- **Next step:** None for Phase 7; later phases may consume the generated API boundary.

## Evidence

- `cd backend && npm test -- --runInBand src/code-generation/dto-generator.spec.ts`: 3 tests passed.
- `cd backend && npm test -- --runInBand src/code-generation/dto-generator.spec.ts src/code-generation/persistence-generator.spec.ts src/code-generation/domain-model-generator.spec.ts src/code-generation/uml-analysis.spec.ts`: 4 suites and 52 tests passed.
- `cd backend && npm run build`: passed.
- `git diff --check`: passed.
- `./gradlew test` and `./gradlew bootRun`: not run, as prohibited for this task.

Deliberate simplifications: query DTOs contain only `page` and `size`; mappers copy scalar attributes only; validation derives only `@NotNull` from explicit positive UML multiplicity lower bounds and does not infer email, pattern, or size rules.

## Mirror status

- **Repository-relative locator:** `odd/tasks/dto-validations.md`
- **Engram topic:** `odd/dto-validations/tasks`
- **Status:** Pending until the authoritative runtime session is available.
