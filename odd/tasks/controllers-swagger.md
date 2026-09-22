# Phase 9 — Controllers + Swagger/OpenAPI

## Objective

Generate deterministic Spring Boot REST controllers and OpenAPI metadata for the active UML-to-Spring Boot pipeline.

## Problem and why

Phase 8 produces repositories, DTOs, mappers, and CRUD services, but generated projects still lack an HTTP boundary and usable API documentation.

## Scope

- Generate one REST controller for each eligible concrete persistible UML class.
- Expose create, list, get-one, update, and delete CRUD endpoints.
- Add Swagger/OpenAPI annotations to controllers, endpoints, request/response DTOs, and documented error responses.
- Add a resumable `GENERATING_CONTROLLERS` phase after services and before compilation.
- Generate custom UML operation endpoints only when explicit HTTP metadata and supported mappings exist; current UML data has no such metadata, so this phase emits CRUD endpoints only.
- Preserve UML operation/realization ownership and existing authentication behavior.

## Constraints

- Preserve unrelated worktree changes.
- Do not run `./gradlew test` or `./gradlew bootRun`.
- No new backend dependencies; the generated Spring template already carries springdoc.
- Reuse the existing generated service and DTO contracts.
- Do not infer HTTP verbs, routes, authorization, request bodies, or response mappings from operation names.
- Exclude interfaces, abstract/promoted-abstract classes, repository-less classes, and the configured authentication principal.

## Route

- Mapping trigger: behavior spans controller generation, DTO generation, pipeline persistence, security resolution, generated templates, and focused tests; mapped by a read-only explorer before implementation.
- Writer route: single bounded writer; implementation touches a new controller generator, DTO annotations, pipeline integration, tests, and this task evidence.
- Verification route: focused Jest tests, Nest build, diff check, and an independent read-only verifier. Generated Java compilation remains unavailable under the current command restriction.

## Checklist

- [x] CTL-01 Generate deterministic CRUD controllers for eligible classes.
- [x] CTL-02 Add Swagger/OpenAPI annotations and documented parameters/responses/errors.
- [x] CTL-03 Add DTO class/field schemas without changing UML-derived validation.
- [x] CTL-04 Integrate and persist the `GENERATING_CONTROLLERS` phase with resume support.
- [x] CTL-05 Keep custom endpoint generation disabled until explicit UML HTTP metadata exists.
- [x] CTL-06 Run checks, record evidence, and create a work-unit commit.

## Acceptance criteria

- Every eligible concrete relational class gets one controller with deterministic CRUD routes.
- Controllers use generated services, DTOs, UUID path parameters, validation, and documented 2xx/4xx responses.
- Generated DTOs expose useful schemas and preserve existing validation semantics.
- Interfaces, abstract/promoted-abstract classes, repository-less classes, and authentication principals are excluded.
- No custom endpoint is inferred from a UML operation without explicit HTTP mapping metadata.
- Generation status exposes and resumes through `GENERATING_CONTROLLERS` before compilation.
- Focused tests and `npm run build` pass; unrelated files remain untouched.

## Progress

- Status: complete.
- Next step: parent spot-check and independent verification of the Phase 9 correction.
- Verification evidence: the original Phase 9 checks passed (`npm test -- --runInBand src/code-generation/controller-generator.spec.ts src/code-generation/dto-generator.spec.ts src/code-generation/service-generator.spec.ts src/code-generation/code-generation.service.spec.ts` — 4 suites, 10 tests; `npm run build`; `git diff --check`). The correction passes `npm test -- --runInBand src/code-generation/controller-generator.spec.ts` — 1 suite, 2 tests; `npm run build`; and `git diff --check`. Independent verification remains pending parent rerun; Gradle test/bootRun were not run.
- Implementation evidence: `controller-generator.ts` emits deterministic CRUD only, reuses `eligibleCrudElements`, documents validation/error/security responses, uses the status-aware response factory with `HttpStatus.CREATED.value()` for create bodies, and has no custom UML-operation route mapping. `dto-generator.ts` adds class/field `@Schema` annotations without changing `@NotNull` derivation. `GENERATING_CONTROLLERS` is persisted in `PHASE_STEPS`, resumed by startup status lookup, and runs between services and compilation.
- Checklist: CTL-01, CTL-02, CTL-03, CTL-04, CTL-05, and CTL-06 complete.
- Commit: original Phase 9 work-unit commit remains unchanged; the correction commit is reported in the delivery summary.
