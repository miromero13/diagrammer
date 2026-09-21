# Phase 4: Domain-model generation

Generate the authorized Phase 4 Java domain model from normalized UML while retaining basic JWT authentication without authorization concepts.

## 1. Repair baseline basic-auth adaptation

- **Objective:** Make the retained generated principal compile for a selected UML credential field and expose no authorities.
- **Scope:** Adapt the real basic-auth template so generated source uses the selected credential field, never stale `account.password`, and a no-authority `UserDetails` implementation.
- **Constraints:** Basic JWT only; do not generate or retain roles, permissions, privileges, AOP authorization, or endpoint authorization.
- **Acceptance criteria:** A faithful template-adaptation regression proves `account.password = passwordEncoder.encode(password)` and `user.role.permissions` are absent; generated principal preserves login uniqueness and credential JSON hiding.
- **Route/delegation evidence:** `CodeGenerationService.generateBackend` resolves security and applies `adaptBasicAuthentication` before domain generation.
- **Verification evidence:** The real-template regression passes and proves the stale initializer and `user.role.permissions` fragments are absent.
- **Progress:** Completed.
- **Next step:** Retain this regression while extending later authentication work.

## 2. Generate concrete entities

- **Objective:** Generate each concrete normalized UML class as a JPA entity.
- **Scope:** Add a pure domain-model generator that emits `@Entity`, `@Table`, existing `BaseEntity`/UUID inheritance, and normalized attributes with Java types.
- **Constraints:** Do not emit associations, relationship annotations, repositories, migrations, DTOs, services, controllers, OpenAPI, UML operations, enums, or UML inheritance links; do not duplicate the retained principal entity.
- **Acceptance criteria:** Concrete classes generate canonical attributes and Java types; the authentication principal is adapted rather than duplicated.
- **Route/delegation evidence:** The generator consumes `UmlAnalysis.normalizedModel.elements` after basic-auth adaptation.
- **Verification evidence:** `domain-model-generator.spec.ts` covers deterministic imports for `BigDecimal`, `LocalDate`, `LocalDateTime`, `UUID`, `List`, `Set`, and `Map`; the focused backend Jest command passed on 2026-09-21.
- **Progress:** Completed.
- **Next step:** Defer relationships, repositories, and migrations to later phases.

## 3. Generate interfaces and abstract classes

- **Objective:** Generate normalized UML interfaces and abstract classes without later-phase relationships.
- **Scope:** Emit Java interfaces and abstract classes with normalized attributes and Java types where applicable.
- **Constraints:** Do not emit UML operations, enums, implementation links, inheritance links, associations, or authorization artifacts.
- **Acceptance criteria:** Interfaces and abstract classes are emitted with correct declarations; abstract classes do not become JPA entities solely by being abstract.
- **Route/delegation evidence:** The same domain-model generator branches only on normalized element kind.
- **Verification evidence:** `domain-model-generator.spec.ts` verifies collection imports and declarations in interface/abstract output; the focused backend Jest command passed on 2026-09-21.
- **Progress:** Completed.
- **Next step:** Defer enum and UML inheritance/implementation links to Phase 5.

## 4. Integrate and verify resumable generation

- **Objective:** Integrate domain generation as a resumable status step before compilation.
- **Scope:** Add `GENERATING_DOMAIN` progress handling after basic-auth adaptation and before compilation; update frontend mapping only if generic rendering cannot display it.
- **Constraints:** Preserve existing basic-auth repository/JWT/filter/provider/login infrastructure and avoid unrelated working-tree files.
- **Acceptance criteria:** Resumed generations recognize the domain step; backend tests/build and `git diff --check` pass; generated Gradle commands are run only as authorized or reported blocked.
- **Route/delegation evidence:** `CodeGenerationService` persists steps and resumes pending generation statuses.
- **Verification evidence:** Focused backend Jest suites and `npm run build` pass; the import-correction checks passed on 2026-09-21; the generated User(email, passwordHash) project previously passed `./gradlew compileJava --no-daemon` and `./gradlew testClasses --no-daemon`; frontend was unchanged.
- **Progress:** Completed.
- **Work-unit commit:** `c79731a feat(code-generation): generate UML domain model`.
- **Next step:** Phase 5 may add persistence relationships, repositories, migrations, enums, and UML inheritance mapping.

## Mirror status

- **Repository-relative locator:** `odd/tasks/domain-model-generation.md`
- **Engram topic:** `odd/domain-model-generation/tasks`
- **Status:** Mirror pending: Engram rejected both the initial and final writes because multiple active runtime sessions match this repository; retry with the authoritative session identity.
