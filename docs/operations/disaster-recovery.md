# Disaster Recovery

## Rebuild from Source
1. Restore `src/` from backup.
2. Run `docker compose up -d --build`.
3. Trigger a build to republish to `public/`.

## Restore Volumes
- If `public/` is corrupted, it can be deleted and rebuilt from `src/`.
- If `public_prev/` is intact, it can be swapped back manually.

## Rollback Using public_prev
- Stop the public web container.
- Swap `public/` and `public_prev/` on the same filesystem.
- Start the public web container.
