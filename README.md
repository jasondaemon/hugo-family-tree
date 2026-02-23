# Hugo Family Tree

## Project Overview
Hugo Family Tree is a Docker-based, GPL-3.0-only system for managing genealogy data in plain files and publishing a static Hugo site. It includes a form-driven admin UI, a dedicated Hugo build service, NFS-backed storage, and a swap-safe publish workflow.

## Key Features
- Hugo static site with nginx public hosting
- Admin UI + API for editing genealogy records
- Atomic build/publish pipeline (`public_tmp` -> `public` with `public_prev` backup)
- NFS-backed storage for durability
- Person IDs are system-generated and hidden from users
- Public tree explorer (`/tree`) with live search and relationship navigation
- Startup scaffold templates are tracked in `hugo/starter/` and copied by admin setup into `/src`.

## Architecture Summary
Services (docker-compose):
- `public-web` (nginx) serves `/nfs/www.daemon.family/public` read-only
- `admin` (FastAPI + UI) edits `/nfs/www.daemon.family/src` and triggers builds
- `hugo-builder` (FastAPI) builds to `/public_tmp` and swaps to `/public`

Networking:
- No host ports are exposed.
- NPM routes to containers by name on the `nginx-proxy-manager_default` network.
- `hugo-builder` is internal only (default network).

## Build Pipeline
- Builder treats `TMP_DIR` as the mount base (default `/public_tmp`) and uses an internal child root: `/public_tmp/hugo-family-tree`.
- Builder creates a unique work directory per run: `/public_tmp/hugo-family-tree/build-<timestamp>-<rand>`.
- Hugo outputs into that work directory (never into `/public_tmp` mount root directly).
- Builder stages publish content into `/public_tmp/hugo-family-tree/publish-<timestamp>-<rand>`.
- Builder snapshots current `/public` to `/public_prev/_prev` via `rsync -a --delete`.
- Publish step:
  - Tries rename swap when filesystem/mount conditions allow.
  - Falls back to `rsync -a --delete` from stage to `/public` when rename is unsafe or not possible.
- Builder checks that temp root and public target are on the same filesystem before swap.
- Cleanup is best-effort; if NFS returns `EBUSY`, cleanup is skipped and logged without failing the build.
- A service lock file is stored in the managed temp root: `/public_tmp/hugo-family-tree/.build.lock`.

## Quick Start
### 1) Create NFS directories
```bash
mkdir -p /nfs/www.daemon.family/src \
  /nfs/www.daemon.family/public \
  /nfs/www.daemon.family/public_tmp \
  /nfs/www.daemon.family/public_prev
```

### 2) Start the stack
```bash
docker compose up -d --build
```

### 2.1) First-run initialization behavior
- The admin setup/build flow auto-creates missing Hugo essentials in `/nfs/www.daemon.family/src`:
- `config.toml`
- minimal layouts under `layouts/`
- starter content indexes under `content/`
- basic stylesheet under `static/site.css`
- starter theme selection (`Heritage Classic` or `Ledger Modern`) from admin setup
- This is idempotent and does not overwrite existing files.

### 3) Configure NPM Proxy Hosts
- **Public site**
  - Domain: `daemon.family`
  - Forward to: `hugo-family-tree-web:80`

- **Admin site**
  - Domain: `admin.daemon.family`
  - Forward to: `hugo-family-tree-admin:80`
  - Access List: `internal`


## Public Exposure Notes
- This is a public open-source project; keep secrets and private data out of git.
- Runtime content and outputs are intentionally not committed: `src/`, `public/`, `public_tmp/`, `public_prev/`.
- Admin should remain access-restricted; only `public-web` should be internet-facing.

## Documentation
- `CHANGELOG.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/security.md`
- `docs/storage.md`
- `docs/licensing.md`
- `docs/schema/person.md`
- `docs/schema/global-events.md`
- `docs/troubleshooting.md`

## License
GPL-3.0-only. See `LICENSE`.

## Contributing
See `docs/licensing.md` and `docs/developer/contribution-guide.md`.


## Legacy Import (WordPress SQL)
Use the importer to migrate legacy WordPress family records, posts, pages, and media into `/src`:

```bash
python3 admin/api/migrations/wp_sql_import.py \
  --dump /Volumes/docker/website_archive/wp-family/export/dump/wp-salvage.sql \
  --uploads /Volumes/docker/website_archive/wp-family/wordpress/wp-content/uploads \
  --src-root /Volumes/docker/website_www.daemon.family/src \
  --write --clean
```

Then trigger a build from admin (`/build`) or API (`POST /api/build`).
