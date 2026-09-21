# Phase 5: Persistence generation

Generate the relationally authoritative JPA persistence model, repositories, enums, and Flyway migration after Phase 4 domain generation while retaining only basic JWT authentication.

## 1. Relational mapping

- **Objective:** Use `UmlAnalysis.relationalModel` plus normalized UML connections as the single persistence authority.
- **Scope:** Resolve association, aggregation, composition, one-to-one, one-to-many, many-to-one, many-to-many, explicit association classes, joined inheritance, physical names, ownership, and deterministic join tables.
- **Constraints:** Reject missing endpoints, explicit ambiguous ownership, duplicate physical names, inheritance cycles, unsupported scalar class values, and incomplete association-class data; UML `id`, `createdAt`, and `updatedAt` attributes never replace `BaseEntity` fields.
- **Acceptance criteria:** Every emitted relationship has a deterministic Java/SQL mapping or a clear validation error; aggregation never cascades remove and composition collections use `CascadeType.ALL, orphanRemoval = true`.
- **Route/delegation evidence:** Persistence generation consumes the normalized model and relational model produced by UML analysis after Phase 4 security resolution and domain generation.
- **Verification evidence:** Focused persistence tests cover relationship cardinalities, ownership, join-table determinism, association classes, inheritance, and rejection paths.
- **Progress:** Completed.
- **Next step:** Preserve the validation rules as new relationship forms are added.

## 2. Entity and JPA generation

- **Objective:** Emit package-by-feature entity classes that compile against the existing UUID `BaseEntity` template.
- **Scope:** Align `@Table` names to relational physical tables; emit relationship annotations, columns, enum attributes, joined inheritance, and one permitted principal rewrite without duplicating or replacing the basic-JWT authentication infrastructure.
- **Constraints:** Preserve `<feature>/entity/<Class>Entity.java`, `<feature>/model/<InterfaceOrAbstract>.java`, no generic `domain` package, and no roles, permissions, privileges, AOP authorization, or endpoint authorization.
- **Acceptance criteria:** Concrete persistible classes are valid entities with relationally correct annotations; root entities extend `BaseEntity`, joined-inheritance children extend their parent without duplicate base fields; UML enums generate Java enum files and `EnumType.STRING` mappings.
- **Route/delegation evidence:** `CodeGenerationService` invokes persistence generation after `GENERATING_DOMAIN` and before compilation; the legacy `SpringBootGenerator` remains unused.
- **Verification evidence:** Generated representative projects compile for principal/Product, 1:N, optional, N:N, enum, and joined-inheritance cases where supported.
- **Progress:** Completed.
- **Next step:** Keep entity output aligned with any future relational-model extensions.

## 3. Repositories and enums

- **Objective:** Generate repositories and enum source files for persistible UML types.
- **Scope:** Emit repositories under each feature package extending `JpaRepository<ClassNameEntity, UUID>` for concrete non-principal persistible classes; emit deterministic enum Java files and mappings.
- **Constraints:** Preserve the selected basic-JWT principal repository and authentication methods; never overwrite it with a generic repository.
- **Acceptance criteria:** Product-like classes receive one repository; the selected principal repository remains the authentication repository; enum files and imports are deterministic.
- **Route/delegation evidence:** Repository and enum generation is delegated from the active code-generation service, not the legacy generator.
- **Verification evidence:** Focused generator tests assert repository paths, principal preservation, enum output, and duplicate-file rejection.
- **Progress:** Completed.
- **Next step:** Preserve principal-repository ownership when future authentication changes are introduced.

## 4. Flyway migration

- **Objective:** Replace the template identity/access migration with one deterministic migration for the complete relational model.
- **Scope:** Generate tables, UUID PKs, BaseEntity timestamps, columns, nullability, login uniqueness, enums, relationship FKs, indexes, join tables, association-class constraints, and inheritance FKs.
- **Constraints:** Remove role/permission tables and do not silently omit unsupported relationships; preserve the existing migration directory and avoid template leftovers.
- **Acceptance criteria:** Exactly one deterministic model migration is emitted; its physical names match `@Table`; no roles or permissions remain; unsafe relational cases fail before files are published.
- **Route/delegation evidence:** Migration generation runs in the same persistence step after the relational mapping is validated.
- **Verification evidence:** Migration assertions cover all required DDL categories and absence of identity/access tables; generated projects compile with Gradle Java/test classes.
- **Progress:** Completed.
- **Next step:** Extend SQL only through the validated persistence plan; never restore template identity/access DDL.

## 5. Pipeline and verification

- **Objective:** Make persistence generation resumable and verify the full Phase 5 path.
- **Scope:** Add `GENERATING_PERSISTENCE` after `GENERATING_DOMAIN` and before `COMPILING`, include it in resumable statuses, invoke it before Gradle compilation, and preserve analysis errors.
- **Constraints:** Do not generate future API/business layers; do not run `./gradlew test` or `./gradlew bootRun`; do not touch unrelated pre-existing working-tree changes.
- **Acceptance criteria:** Required focused Jest suites, build, diff check, and representative Gradle compile/testClasses commands run exactly as requested with observed results recorded.
- **Route/delegation evidence:** Status persistence, resume handling, and step ordering are verified in `CodeGenerationService` and its callers.
- **Verification evidence:** Record exact commands and outcomes in this task document and final report, including intentionally rejected cases.
- **Progress:** Completed.
- **Verification evidence:** The original Phase 5 focused command passed with 5 suites and 28 tests; `npm run build` passed; `git diff --check` passed. Generated principal/Product, 1:N, optional, N:N, enum, joined-inheritance, composition, and association-class projects each passed `./gradlew compileJava --no-daemon` and `./gradlew testClasses --no-daemon`. No `./gradlew test` or `./gradlew bootRun` was run.
- **Work-unit commit:** `2105cb7 feat(code-generation): generate JPA persistence`.
- **Next step:** Phase 6 may add DTOs, services, controllers, validation, and OpenAPI.

## 6. Bugfix: domain names must not imply authorization

- **Task ID:** `persistence-generation-basic-jwt-domain-names-20260921`
- **Objective:** Allow modeled `User`, `Role`, and `Permission` business classes while keeping authorization controlled only by explicit basic-JWT authentication configuration.
- **Scope:** Remove reserved-name persistence rejection, remove UML Role-User authentication special handling, and preserve removal of template role/permission security artifacts during basic-JWT adaptation.
- **Constraints:** Use generic multiplicity-based relation mapping for every class pair; do not reintroduce role/permission authorization or change Phase 6.
- **Regression coverage:** Add focused tests for `Permission` feature persistence, generic User/Role relationships, and absence of template authorization artifacts in basic-JWT output.
- **Progress:** Completed.
- **Verification evidence:** `cd backend && npm test -- --runInBand src/code-generation/uml-analysis.spec.ts src/code-generation/security-resolution.spec.ts src/code-generation/domain-model-generator.spec.ts src/code-generation/persistence-generator.spec.ts src/code-generation/dto/generate-code.dto.spec.ts` passed with 5 suites and 29 tests; `cd backend && npm run build` passed with `nest build`; `git diff --check` passed; a representative generated User/Role/Permission project passed `./gradlew compileJava --no-daemon` (`BUILD SUCCESSFUL`, 1 task executed) and `./gradlew testClasses --no-daemon` (`BUILD SUCCESSFUL`, 3 tasks, 2 executed and 1 up-to-date). No `./gradlew test` or `./gradlew bootRun` was run.
- **Work-unit commits:** `302ac52 fix(code-generation): stop inferring auth from UML names`; `security-resolution.spec.ts` regression test recorded in the follow-up test commit.

## 7. Bugfix: BaseEntity identity and implicit one-to-one ownership

- **Task ID:** `persistence-generation-base-entity-ownership-20260921`
- **Objective:** Generate every persistible table with `BaseEntity` UUID identity/audit fields and avoid rejecting one-to-one relationships that have no navigability flags.
- **Scope:** Ignore UML `id`, `createdAt`, and `updatedAt` attributes; force UUID primary/foreign keys; use the source end as the deterministic owner only when both navigability flags are absent; preserve rejection for explicit both-true/both-false ownership.
- **Regression coverage:** UML analysis, persistence, and domain-model tests cover UUID identity, inherited audit fields, implicit one-to-one ownership, and explicit ambiguity.
- **Verification evidence:** `cd backend && npm run test -- --runInBand` passed with 8 suites and 44 tests; `cd backend && npm run build` passed with `nest build`; `git diff --check` passed. No Gradle commands were run.
- **Progress:** Implemented; pending work-unit commit.

## 8. Enum package layout

- **Task ID:** `persistence-generation-common-enums-20260921`
- **Objective:** Place every generated UML enum in the shared `common.enums` package.
- **Scope:** Generate enum sources under `src/main/java/<base-package>/common/enums` and import them from entity fields using the same package.
- **Verification:** Update persistence generation coverage for the shared path and enum import.
- **Verification:** `cd backend && npm run test -- --runInBand src/code-generation/persistence-generator.spec.ts src/code-generation/uml-analysis.spec.ts` passed with 2 suites and 27 tests; `cd backend && npm run build` passed; `git diff --check` passed.
- **Progress:** Completed.
- **Work-unit commit:** `7430ed4 fix(code-generation): centralize generated enums`.

## Mirror status

- **Repository-relative locator:** `odd/tasks/persistence-generation.md`
- **Engram topic:** `odd/persistence-generation/tasks`
- **Status:** Mirror pending: the requested Engram save was attempted, but multiple active runtime sessions match this repository and no authoritative session identity was available.
