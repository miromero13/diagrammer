# Generated backend template cleanup

## Objective

Keep generated Spring Boot projects focused on the files and configuration they actually use.

## Scope

- Remove unused generated documentation files.
- Keep Hibernate/Flyway configuration consistent with the current generation flow.
- Ensure `gradlew` is executable before generated-project compilation.

## Constraints

- Edit the backend template and generation flow only.
- Preserve unrelated worktree changes.
- Do not run `./gradlew test` or `./gradlew bootRun`.

## Tasks

- [x] GT-1 Remove obsolete `ROLES_AND_PERMISSIONS.md`, `DEVELOPMENT_GUIDE.md`, and `ARCHITECTURE.md` from the generated template.
- [x] GT-2 Ensure generated `gradlew` has executable permissions before `compileJava` runs, and record the required `chmod +x gradlew` command in the template workflow.
- [x] GT-3 Restore a concise operational `README.md` with only setup, configuration, compilation, and startup instructions.

## Checks

- Focused code-generation tests.
- `npm run build`.
- `git diff --check`.
- Verify the generated template no longer contains the removed documentation files and that the wrapper permission step precedes compilation.

## Progress

- Status: complete.

## Implementation record

- Deleted the three obsolete conceptual top-level documentation files from `backend/src/code-generation/templates/backend/`.
- Restored `README.md` as the single concise operational guide for setup, configuration, compilation, startup, and optional tests.
- Added `await fs.chmod(join(projectRoot, 'gradlew'), 0o755)` immediately before the existing `exec('./gradlew', ['compileJava', '--no-daemon'], ...)` call in `code-generation.service.ts`.
- Added the comment `Equivalent to \`chmod +x gradlew\` before compilation.`
- Preserved the existing copy-time `gradlew` chmod as a separate defensive step.

## Verification record

- `npm test -- --runInBand code-generation` — 11 suites passed, 67 tests passed.
- `npm run build` — passed (`nest build`).
- `git diff --check` — passed.
- Template cleanup and chmod ordering verification — passed; removed files are absent, the precompile chmod precedes `compileJava`, and copy-time chmod remains present.

## Scope correction

- GT-3 restores the README as the single concise operational guide for generated projects; endpoint documentation and the removed conceptual guides remain excluded.
