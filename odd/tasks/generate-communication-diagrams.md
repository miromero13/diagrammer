# Communication diagrams

## Objective

Deliver the CU02, CU03, and CU04 communication diagrams with faithful UML 2.5 communication-diagram notation while preserving the Spanish use-case intent and Enterprise Architect palette.

## Checklist

- [x] T1: Define the four-participant actor, boundary, control, and entity layout.
- [x] T2: Preserve the Spanish use-case messages and sensible hierarchical numbering.
- [x] T3: Use PlantUML declarations and solid labeled arrows for the communication diagrams.
- [x] T4: Keep the final delivery directory limited to the three `.puml` artifacts.
- [x] T5: Validate PlantUML source structure, UML vocabulary, palette, labels, and delivery contents.
- [x] T6: Replace the Draw.io XML deliverables with PlantUML source files.

## PlantUML replacement

PlantUML is authoritative for the final diagrams. The three Draw.io XML deliverables were deleted rather than retained alongside the `.puml` sources. Each source uses `actor`, `boundary`, `control`, and `entity` declarations, the Enterprise Architect-like palette, a left-to-right layout, and solid labeled message arrows.

## Verification

- PlantUML renderer: unavailable locally; no PNG/SVG outputs were generated.
- Structural source validation: passed for all three files; each has balanced `@startuml`/`@enduml`, the four required UML declarations, the requested palette declarations, and every required message label.
- Delivery directory: exactly the three `.puml` files; no `.drawio` files remain.
- `git diff --check`: passed.
- Commit identity: `feat/communication-diagrams` — `feat(diagrams): replace Draw.io communication artifacts with PlantUML`.

## Progress

Current: complete.

## Next step

No further implementation step remains for T6.
