# UML Sidebar Previews

## Objective

Make every UML palette button preview the element or relationship it creates.

## Problem

The sidebar currently relies on icons and text, so users cannot see UML visual semantics before adding an item.

## Why

Compact visual previews make the palette discoverable while preserving accessible button names.

## Scope

- Add compact UML-like previews for class, interface, abstract class, and enum buttons.
- Add SVG previews with the correct markers and dash patterns for every relationship button.
- Preserve labels, buttons, and existing add callbacks.

## Constraints

- Do not add dependencies.
- Reuse existing Tailwind, React, Lucide, and canvas relationship semantics.
- Do not change persistence, XMI, or canvas behavior.
- Keep the palette compact and responsive.
- Do not modify unrelated workspace changes.

## Delivery

- Route: delegated.
- Trigger evidence: the sidebar UI touches multiple non-trivial files (sidebar, canvas semantics, and its page integration).
- Strategy: ask-on-risk.
- One focused work-unit commit with tests/docs for this behavior.

## Checklist

- [x] UMLSP-1: Inspect sidebar and canvas relation semantics.
- [x] UMLSP-2: Add accessible element and relationship previews to the sidebar.
- [x] UMLSP-3: Add focused rendered preview coverage.
- [x] UMLSP-4: Run focused checks, frontend build, and diff validation.
- [x] UMLSP-5: Commit only feature files and record evidence.
- [x] UMLSP-6: Make the palette content scrollable and render item names as cards.
- [x] UMLSP-7: Show only visual previews while retaining accessible names.

## Acceptance Checks

- Each element button shows a compact UML-like card matching its type.
- Each relationship button shows its semantic line marker and dash pattern.
- Labels remain readable and buttons remain accessible.
- Existing creation behavior is unchanged.
- The palette scrolls when its content exceeds the sidebar height.
- Every preview label is displayed in its own card.
- Palette items show only their UML previews and retain accessible names.

## Verification

- TDD mode: disabled/unknown; use ordinary focused checks.
- Focused test: `npm test -- --run src/pages/diagrams/components/diagram-elements-sidebar.test.tsx` — observed 2026-09-20: 1 file, 9 tests passed.
- Frontend build: `npm run build` — observed 2026-09-20: passed (`tsc && vite build`; 2184 modules transformed).
- `git diff --check`: observed 2026-09-20: passed for staged and unstaged changes.
- Runtime harness: N/A; the happy-dom Testing Library test renders every preview and verifies preserved element callbacks.
- Sidebar refinement: `npm test -- --run src/pages/diagrams/components/diagram-elements-sidebar.test.tsx` — observed 2026-09-20: 1 file, 9 tests passed.
- Sidebar refinement build: `npm run build` — observed 2026-09-20: passed.
- Sidebar refinement diff check: `git diff --check` — observed 2026-09-20: passed.
- Preview-only refinement: `npm test -- --run src/pages/diagrams/components/diagram-elements-sidebar.test.tsx` — observed 2026-09-20: 1 file, 9 tests passed.

## Review Assessment

- Receipt-driven development: enabled globally.
- Committed-only assessment: medium risk, 207 changed lines, `under_budget`; native review is not due for this slice yet.

## Progress

Current: completed.

## Commit Evidence

- Work-unit commit: `feat(diagrams): preview UML sidebar palette items` (final SHA reported with delivery).
- Staged scope: only the sidebar implementation, its focused test, and this task document.
- Sidebar refinement commit: `fix(diagrams): make sidebar palette scrollable` (SHA reported with delivery).
- Preview-only refinement commit: SHA reported with delivery.

## Next Step

No further implementation work is planned.
