# Deterministic authentication and UML multiplicity

## Objective

Continue Spring Boot authentication and authorization generation without AI and accept the relationship multiplicity forms used by the diagram editor, including reversed zero/one notation such as `1..0` when it represents `0..1`.

## Scope

- Normalize and validate relationship multiplicities consistently in frontend and backend UML analysis.
- Ensure security case resolution consumes normalized cardinalities.
- Keep authentication adaptation deterministic; do not add or invoke Gemini/AI in code generation.
- Add focused regression coverage for `1..0`, `0..*`, and deterministic security case resolution.

## Constraints

- Preserve unrelated worktree changes.
- Do not run `./gradlew test` or `./gradlew bootRun`.
- Use existing frontend/backend test scripts and builds.

## Tasks

- [x] AUTH-MULT-1: Normalize reversed numeric multiplicity ranges and align frontend/backend validation.
- [x] AUTH-MULT-2: Verify deterministic security resolution and generation has no AI dependency.
- [x] AUTH-MULT-3: Add focused regression tests and run allowed checks.
- [x] AUTH-MULT-4: Accept principal-role one-to-many relationships regardless of endpoint direction.
- [x] AUTH-MULT-5: Accept one-to-one principal-role relationships as the single-role topology.

## Authorized scope and route

- Authorized files: UML relationship validation, UML analysis/security resolution, code-generation module wiring/template contract, focused tests, and this task record.
- Route: delegated direct writer because implementation spans multiple non-trivial files.
- Trigger evidence: backend normalization/security behavior and frontend validation must remain consistent.

## Acceptance criteria

- `1..0` is accepted as the zero-or-one alias and normalized to `0..1` for analysis/cardinality decisions.
- `0..*` remains valid and is recognized as many.
- Invalid non-range values and genuinely invalid syntax still fail validation.
- Spring Boot generation resolves and adapts authentication deterministically without invoking AI.
- Focused backend and frontend tests, builds, and `git diff --check` pass.

## Progress

Current: AUTH-MULT-5 is complete. The resolver accepts `0..1` and `1..1` principal-role relationships as the valid one-to-one topology.

## Verification evidence

- `npm test -- --run src/pages/diagrams/uml-relationship-validation.test.ts` (frontend): passed, 1 file and 5 tests.
- `npm test -- --runInBand src/code-generation/uml-analysis.spec.ts src/code-generation/security-resolution.spec.ts` (backend): passed, 2 suites and 35 tests.
- `npm run build` (frontend): passed (`tsc` and Vite production build).
- `npm run build` (backend): passed (`nest build`).
- `git diff --check`: passed with no output.
- Added reversed principal-role regression coverage for Case 4 and Case 5, including normalized `1..0`/`0..*` input; the existing both-many regression continues to resolve Case 6.
- Added one-to-one principal-role regression coverage for Case 4 and Case 5 using both `0..1`/`1..1` endpoint permutations; the focused backend command passed all 35 tests.
- Updated security resolution so one-to-one principal-role relationships resolve to Case 4 without permissions and Case 5 with a many-to-many role-permission relationship; Case 6 and Case 7 constraints remain unchanged.
- Updated `ROLES_AND_PERMISSIONS.md` so the authentication contract documents `1:1` as a valid Case 4/5 principal-role topology.
- Inspected `backend/src/code-generation/code-generation.service.ts`: security generation calls `normalizeAndValidateUml`, `resolveSecurityCase`, and `adaptCaseFiveTemplate`; no Gemini/AI dependency is present in this path.
- Removed the unused `AiModule` import from `backend/src/code-generation/code-generation.module.ts`, keeping code generation explicitly independent of AI services.
- Prohibited `./gradlew test` and `./gradlew bootRun` were not run.

## Next step

AUTH-MULT-5 is complete; no further work remains for this task.
