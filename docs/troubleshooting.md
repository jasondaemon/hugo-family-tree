# Troubleshooting

## Builder Error: `[Errno 16] Resource busy: '/public_tmp'`

### Symptom
Build from admin fails intermittently with:

```text
OSError: [Errno 16] Resource busy: PosixPath('/public_tmp')
```

### Cause
On bind mounts and NFS-backed mounts, deleting or renaming the mount root itself can fail with `EBUSY`.

### Mitigation Implemented
- Builder treats `TMP_DIR` as a mount base (default `/public_tmp`) and never creates/deletes/renames that mount root.
- Builder uses a managed child temp root: `/public_tmp/hugo-family-tree`.
- Each build uses unique directories under temp root:
  - `/public_tmp/hugo-family-tree/build-<timestamp>-<rand>`
  - `/public_tmp/hugo-family-tree/publish-<timestamp>-<rand>`
- Snapshot and publish are done with `rsync`, with rename-swap attempted only when safe.
- Builder validates that temp root and public target are on the same filesystem (`st_dev`) before swap.
- Cleanup of temp directories is best-effort:
  - If cleanup hits `EBUSY`, it is logged and ignored.
  - Build result remains successful when publish succeeds.
- Builder lock file lives on writable temp storage:
  - `/public_tmp/hugo-family-tree/.build.lock`

### Verify
- Trigger build from admin UI or:

```bash
curl -sS -X POST http://hugo-family-tree-builder:19000/build | jq
```

- Confirm response includes:
  - `"ok": true`
  - `"work_dir": "/public_tmp/hugo-family-tree/build-..."`
  - `"stage_dir": "/public_tmp/hugo-family-tree/publish-..."`
  - `"publish_mode": "rename-swap"` or `"publish_mode": "rsync"`
  - `"cleanup_warnings": []` (or a non-empty list for non-fatal cleanup issues)

### Cleanup Notes
Builder keeps the most recent temp build directories (default `5`). Older directories are removed best-effort and may remain temporarily on busy mounts.
