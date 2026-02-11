# Backups

## What to Back Up
- `src/` is the canonical data source and must be backed up.
- `public/` can be regenerated from `src/` and is optional for backups.
- `public_prev/` is a convenience rollback and should not be relied on as a backup.

## Recommended Strategy
- Daily snapshot of `src/` with a retention policy.
- Keep offsite copies of `src/` for disaster recovery.
- Test restore procedures regularly.
