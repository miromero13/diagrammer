# UML 2.5.1 Class Semantics

## Objective

Bring the class-diagram editor closer to a consistent UML 2.5.1 subset across the active React Flow editor, persistence, backend validation, and XMI/UMLDI interchange.

## Authorized Scope

1. Replace internal `uml:AbstractClass` with standard `uml:Class` plus `isAbstract`.
2. Preserve and edit visibility.
3. Add static, abstract, derived, and default-value member semantics.
4. Add association roles and navigability.
5. Represent enum usage as a stereotyped UML dependency rather than an application-only relation kind.
6. Add semantic validation for relationship endpoints and multiplicities.
7. Complete XMI and UMLDI export/import for relationship geometry and supported semantics.

## Constraints

- Work on the current branch; do not create or switch branches.
- Preserve compatibility with saved `uml.AbstractClass`, `<<abstract>>`, and `enumUsage` diagrams.
- Do not stage or modify unrelated `.atl`, `opencode.json`, `.DS_Store`, `.gentle-ai-default-agent.json`, or `test1.xmi` changes.
- Keep technical artifacts in English and avoid new dependencies.
- Preserve existing code-generation behavior unless validation exposes an invalid model.

## Route and Delivery

- Route: delegated direct implementation.
- Trigger evidence: the change spans the model, editor, canvas, persistence, backend normalization, and XMI services.
- Delivery strategy: ask-on-risk; no new branch per user instruction.
- Use focused work-unit commits on the current branch with Conventional Commit messages.

## Checklist

- [x] UML25-1: Define a backward-compatible canonical model for classifier/member/relationship semantics.
- [x] UML25-2: Update editor and canvas for abstract classifiers, visibility, member modifiers/defaults, roles, and navigability.
- [x] UML25-3: Replace `enumUsage` handling with stereotyped dependency semantics while accepting legacy data.
- [x] UML25-4: Add relationship endpoint, multiplicity, and composition/association semantic validation.
- [x] UML25-5: Complete XMI round-trip and UMLDI relationship edge/waypoint handling.
- [x] UML25-6: Add focused regression tests and update task evidence.
- [ ] UML25-7: Run frontend/backend checks, build, diff validation, and record commits.

## Acceptance Criteria

- Abstract classifiers persist as standard `uml:Class` with `isAbstract=true`; legacy input remains readable.
- Visibility is not lost when imported or edited.
- Supported member modifiers and default/derived values round-trip through the active model and XMI.
- Association roles, navigability, and multiplicities are editable, rendered, persisted, and round-trip through XMI.
- Enum usage is represented as a UML dependency with a stereotype; legacy `enumUsage` remains readable.
- Invalid relationship endpoint combinations and multiplicities produce actionable validation errors.
- XMI includes supported relationship semantics and UMLDI edge geometry; import preserves them.

## Verification

- TDD mode: unknown; use existing project test scripts and ordinary focused checks unless repository configuration proves otherwise.
- Frontend focused tests: sidebar/editor/XMI tests plus new semantic regression tests.
- Backend focused tests: UML normalization/validation tests.
- Frontend build: `npm run build` from `frontend`.
- Backend checks: use the existing package scripts discovered by the writer; do not run Gradle commands prohibited by the user.
- Formatting: `git diff --check`.

## Progress

Current: UML25-6 complete; focused frontend XMI/member/relationship-validation tests and backend UML normalization/validation tests cover canonical abstract classes, member semantics, enum dependency compatibility, relationship semantics, and UMLDI waypoints.

## Next Step

Next: run the complete requested checks/builds, record exact results, and close the task with commit evidence.
