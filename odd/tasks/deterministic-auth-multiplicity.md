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

## Authorized scope and route

- Authorized files: UML relationship validation, UML analysis/security resolution, code-generation module wiring, focused tests, and this task record.
- Route: delegated direct writer because implementation spans multiple non-trivial files.
- Trigger evidence: backend normalization/security behavior and frontend validation must remain consistent.

## Acceptance criteria

- `1..0` is accepted as the zero-or-one alias and normalized to `0..1` for analysis/cardinality decisions.
- `0..*` remains valid and is recognized as many.
- Invalid non-range values and genuinely invalid syntax still fail validation.
- Spring Boot generation resolves and adapts authentication deterministically without invoking AI.
- Focused backend and frontend tests, builds, and `git diff --check` pass.

## Progress

Current: implementation complete. Frontend validation and backend UML analysis accept `n`, `n..m`, `n..*`, `*`, and the `1..0` alias; analysis canonicalizes the alias to `0..1`, keeps `0..*` unbounded, and preserves changed source text separately. Security case resolution consumes the normalized numeric cardinalities, and the generation service routes directly through the deterministic resolver/adaptor without an AI/Gemini call.

## Verification evidence

- `npm test -- --run src/pages/diagrams/uml-relationship-validation.test.ts` (frontend): passed, 1 file and 5 tests.
- `npm test -- --runInBand src/code-generation/uml-analysis.spec.ts src/code-generation/security-resolution.spec.ts` (backend): passed, 2 suites and 28 tests.
- `npm run build` (frontend): passed (`tsc` and Vite production build).
- `npm run build` (backend): passed (`nest build`).
- `git diff --check`: passed with no output.
- Inspected `backend/src/code-generation/code-generation.service.ts`: security generation calls `normalizeAndValidateUml`, `resolveSecurityCase`, and `adaptCaseFiveTemplate`; no Gemini/AI dependency is present in this path.
- Removed the unused `AiModule` import from `backend/src/code-generation/code-generation.module.ts`, keeping code generation explicitly independent of AI services.
- Prohibited `./gradlew test` and `./gradlew bootRun` were not run.

## Next step

No further implementation is required for this task; retain the focused checks as regression coverage.
