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
- Builder never deletes or renames `/public_tmp` mount root.
- Each build uses unique directories under temp root:
  - `/public_tmp/build-<timestamp>-<rand>`
  - `/public_tmp/publish-<timestamp>-<rand>`
- Snapshot and publish are done with `rsync`, with rename-swap attempted only when safe.
- Cleanup of temp directories is best-effort:
  - If cleanup hits `EBUSY`, it is logged and ignored.
  - Build result remains successful when publish succeeds.
- Builder lock file lives on writable temp storage:
  - `/public_tmp/.hugo_build.lock`

### Verify
- Trigger build from admin UI or:

```bash
curl -sS -X POST http://hugo-family-tree-builder:19000/build | jq
```

- Confirm response includes:
  - `"ok": true`
  - `"work_dir": "/public_tmp/build-..."`
  - `"stage_dir": "/public_tmp/publish-..."`
  - `"publish_mode": "rename-swap"` or `"publish_mode": "rsync"`

### Cleanup Notes
Builder keeps the most recent temp build directories (default `5`). Older directories are removed best-effort and may remain temporarily on busy mounts.
