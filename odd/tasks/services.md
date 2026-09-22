# Phase 8 — Services

## Objective

Generate Java service contracts and implementations for every concrete persistible UML class in the active Spring Boot generation pipeline.

## Problem and why

The generator currently stops after DTOs and mappers. Generated projects therefore have repositories and API models but no application service layer for CRUD or UML-declared service behavior.

## Scope

- Add deterministic service-interface and service-implementation generation.
- Generate create, delete, edit, get-one, and get-many operations for concrete relational classes only.
- Use generated DTOs, mappers, repositories, UUID identifiers, and Spring transactions.
- Preserve UML 2.5+ realization semantics: UML interfaces remain implemented by the classifier whose realization is declared; do not invent service ownership from names.
- Include compatible UML-declared operations in generated service contracts/implementations where the service classifier is explicitly represented by the UML model; otherwise preserve the existing unsupported-operation behavior.
- Integrate a resumable `GENERATING_SERVICES` phase before Java compilation.
- Do not modify the legacy `SpringBootGenerator`, templates, controllers, migrations, or authentication behavior.

## Constraints

- Preserve unrelated worktree changes.
- Do not run `./gradlew test` or `./gradlew bootRun`.
- No new dependencies.
- Abstract classes, interfaces, and excluded authentication principals do not receive generic CRUD services when no generated repository exists.
- Do not infer pagination, relationship mutation, or business rules absent from the normalized UML contract.

## Route

- Mapping trigger: active behavior spans `code-generation.service.ts`, UML normalization/rendering, persistence, DTOs, and tests; mapped by a read-only explorer before implementation.
- Writer route: delegated direct writer; implementation touches a new generator, focused tests, and the active orchestration service.
- Verification route: focused Jest tests, Nest build, diff check, and an independent read-only verifier. Generated Java compilation remains unavailable under the current command restriction.

## Checklist

- [x] SVC-01 Define deterministic service file names, packages, imports, and CRUD contracts.
- [x] SVC-02 Generate CRUD implementations using repository and mapper APIs.
- [x] SVC-03 Preserve UML operation and realization contracts without inventing ownership.
- [x] SVC-04 Integrate and persist the `GENERATING_SERVICES` phase with resume support.
- [x] SVC-05 Add focused generator and pipeline regression coverage.
- [x] SVC-06 Run checks, record evidence, and create a work-unit commit.

## Acceptance criteria

- Every eligible concrete relational class gets a service contract and implementation.
- CRUD methods use the generated repository, DTOs, mapper, and UUID id type.
- Generated output is deterministic and excludes interfaces, abstract classes, and repository-less classes.
- UML realization/operation semantics are not reassigned based only on naming conventions.
- Generation status exposes and resumes through `GENERATING_SERVICES` before compilation.
- Focused tests and `npm run build` pass; unrelated files remain untouched.

## Progress

- Status: complete.
- Next step: none.
- Verification evidence: corrective verification covers promoted-abstract service, repository, entity/table, and mapper behavior; `npm test -- --runInBand src/code-generation/service-generator.spec.ts src/code-generation/dto-generator.spec.ts src/code-generation/persistence-generator.spec.ts src/code-generation/domain-model-generator.spec.ts src/code-generation/uml-analysis.spec.ts` passed (5 suites, 56 tests); `npm run build` and `git diff --check` passed. Gradle commands were not run per task constraints.
- Commit: one corrective work-unit commit created for Phase 8 services; the repository history records the new commit.
