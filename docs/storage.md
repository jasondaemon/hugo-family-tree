# Storage

## NFS Layout
Expected NFS-backed directories:
- `/nfs/www.daemon.family/src` — Hugo content source (authoritative data).
- `/nfs/www.daemon.family/public` — published site (served by nginx).
- `/nfs/www.daemon.family/public_tmp` — build staging output.
- `/nfs/www.daemon.family/public_prev` — previous build backup.

## Backup Strategy
- **Required**: `src` must be backed up regularly.
- **Optional**: `public` can be rebuilt; backup is optional.
- **Not a backup**: `public_prev` is a convenience rollback only.

## Restore Procedure
1. Restore `/nfs/www.daemon.family/src` from backup.
2. Start stack: `docker compose up -d --build`.
3. Trigger a build to republish.

## Atomic Publish Notes
- Builder uses `TMP_DIR` as a base mount (default `/public_tmp`) and stages under `/public_tmp/hugo-family-tree`.
- Build outputs use per-run directories (`build-*` and `publish-*`) under the managed temp root.
- `/public_prev` keeps the previous build after a successful swap.
- `TMP_DIR` and `PUBLIC_DIR` must be on the same filesystem for rename-based atomic swap.
