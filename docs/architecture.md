# Architecture

## System Overview
Hugo Family Tree is a Docker-based stack that manages genealogy data in files and publishes a static Hugo site. It separates concerns across three services and uses NFS-backed storage for durability and backup.

### Services
- **public-web (nginx)**: Read-only static hosting of `/public`.
- **admin (FastAPI + UI)**: Form-driven editing of `/src`, triggers builds.
- **hugo-builder (FastAPI)**: Builds Hugo into `/public_tmp` and atomically swaps to `/public`.

### Data Contract (People)
- `person_id` is **system-generated UUID4** and hidden from users.
- UI uses display names; relationships store UUIDs internally.
- Folder path: `src/content/family/<uuid>[-slug]/index.md`.
- **Future plan**: add `sort_key` and a short, stable `fs_id` to improve filesystem naming/sorting without changing UUID identity.

## File Layout
- `/nfs/www.daemon.family/src` — content source (Hugo).
- `/nfs/www.daemon.family/public` — active published site (served by nginx).
- `/nfs/www.daemon.family/public_tmp` — build staging output.
- `/nfs/www.daemon.family/public_prev` — previous build backup.

## Data Flow
1. Admin edits a person record under `/src/content/family/<uuid>/index.md`.
2. Admin triggers the builder.
3. Builder runs Hugo output to `/public_tmp`.
4. Builder swaps `/public` -> `/public_prev`, then `/public_tmp` -> `/public`.

## Diagram
```mermaid
graph TD
  user[Public Visitor] --> npm[Reverse Proxy (NPM)] --> web[public-web]
  editor[Editor] --> npm --> admin[admin]
  admin --> builder[hugo-builder]
  admin --> src[(NFS /src)]
  builder --> src
  builder --> tmp[(NFS /public_tmp)]
  builder --> pub[(NFS /public)]
  builder --> prev[(NFS /public_prev)]
  web --> pub
```

## Container Responsibilities
- **public-web**: serve `/public` read-only; no write access.
- **admin**: validate and write schema-compliant content; upload bundle media; trigger build.
- **hugo-builder**: run Hugo; ensure safe, atomic publishes; keep `public_prev`.
