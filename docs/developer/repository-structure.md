# Repository Structure

- `admin/` - FastAPI admin service and static UI assets.
- `builder/` - FastAPI build orchestrator with Hugo binary.
- `nginx/` - Public nginx configuration.
- `hugo/starter/` - Tracked starter layouts/content/theme assets used by admin site initialization.
- `src/` - Hugo content source (NFS-backed, gitignored).
- `public/` - Published site output (NFS-backed, gitignored).
- `public_tmp/` - Build staging output (NFS-backed, gitignored).
- `public_prev/` - Previous build backup (NFS-backed, gitignored).

## Why `src` Is Gitignored
Content is treated as primary, durable data and typically stored on NFS or external storage. This keeps repo history clean and avoids committing sensitive or large datasets.
