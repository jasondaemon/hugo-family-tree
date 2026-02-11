# Contribution Guide

Thank you for contributing. This project is GPL-3.0-only licensed; contributions are expected to be compatible with GPL-3.0-only.

## Branch Naming
- `feature/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`

## Commit Message Style
- Short imperative subject line (e.g., "Add build log manifest").
- Body optional, but include context for non-trivial changes.

## Documentation Requirements
- New features must include updates to relevant docs in `/docs`.
- API changes must update `docs/developer/api-design.md`.

## Testing Expectations
- Validate with `docker compose up -d --build` for container changes.
- If behavior changes, include a manual test note in the PR description.
