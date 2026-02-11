# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows semantic versioning intent.

## [Unreleased]

### Added
- Added builder `cleanup_warnings` in build responses for non-fatal cleanup issues.
- Added installed-theme manifest storage at `/src/.hft/themes-installed.json`.
- Added read-only installed-theme endpoint:
  - `GET /themes/installed`
  - `GET /api/themes/installed`
- Added troubleshooting guidance for NFS `EBUSY` behavior in builder temp directories.

### Changed
- Builder now treats `TMP_DIR` as a base mount and uses a managed child temp root:
  - `/public_tmp/hugo-family-tree`
- Builder now keeps lock files under managed temp root:
  - `/public_tmp/hugo-family-tree/.build.lock`
- Builder now validates `TMP_ROOT` and `PUBLIC_DIR` are on the same filesystem before swap.
- Builder error responses now return top-level JSON with consistent fields:
  - `ok`, `error`, `log_tail`, plus build context fields.
- Builder log tail now includes error type and key path context:
  - `TMP_BASE`, `TMP_ROOT`, `PUBLIC_DIR`, `PREV_DIR`
- Theme installer hardened with stricter directory sanitization (`[a-z0-9_-]`).
- Theme installer now blocks arbitrary repo URLs unless:
  - `ALLOW_UNSAFE_THEME_URLS=true`

### Documentation
- Updated `README.md` build pipeline notes for managed temp root and same-filesystem requirement.
- Updated `docs/storage.md` with `TMP_DIR`/`PUBLIC_DIR` atomic-swap requirement.
- Updated `docs/troubleshooting.md` for mount-safe temp behavior and expected response fields.
- Updated `docs/developer/api-design.md` for new builder error/success response shape and theme install manifest endpoint.
