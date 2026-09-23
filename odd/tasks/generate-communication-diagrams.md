# Communication diagrams

## Objective

Deliver the CU02, CU03, and CU04 communication diagrams with faithful UML 2.5 communication-diagram notation grounded in the current frontend and backend implementation.

## Checklist

- [x] T1: Map CU02, CU03, and CU04 to the actual frontend and backend call paths.
- [x] T2: Rewrite CU02 with the registration flow through AuthContext, API, controller, service, repository, bcrypt, JWT, and storage.
- [x] T3: Rewrite CU03 with the login flow through AuthContext, API, controller, service, repository, bcrypt, JWT, and storage.
- [x] T4: Rewrite CU04 with the implemented profile-view flow and explicitly document disconnected edit/password operations.
- [x] T5: Validate PlantUML source structure, numbering, code references, and delivery contents.

## Current implementation evidence

- CU02 uses `RegisterPage`, `AuthContext.register`, `api.auth.register`, `AuthController.register`, `AuthService.register`, TypeORM persistence, bcrypt, token generation, local storage, and dashboard navigation.
- CU03 uses `LoginPage`, `AuthContext.login`, `api.auth.login`, `AuthController.login`, `AuthService.login`, TypeORM lookup/update, bcrypt comparison, token generation, local storage, and dashboard navigation.
- CU04 currently supports authenticated profile access and profile retrieval. The profile save button, frontend profile update request, and password-change form are not wired; the diagrams must not present those paths as executable behavior.

## Verification

- `python3` structural validator: PASS — CU02 has 22 numbered solid arrows, CU03 has 24, and CU04 has 19; all required code-path references are present.
- `plantuml -utxt docs/diagramas-comunicacion/CU02-registrar-usuario.puml docs/diagramas-comunicacion/CU03-iniciar-sesion.puml docs/diagramas-comunicacion/CU04-gestionar-perfil-credenciales.puml`: unavailable because `plantuml` is not installed (`zsh: command not found: plantuml`); no PNG/SVG files were generated.
- Runtime harness: N/A — documentation-only change; application code and runtime behavior were not modified.
- Rollback boundary: revert the three `.puml` files and this task document only.

## Progress

Current: CU02, CU03, and CU04 rewritten from the verified implementation paths; source validation complete.

## Next step

Next: install PlantUML only if rendered ASCII verification is required. No commit was created because the user explicitly requested uncommitted changes.
