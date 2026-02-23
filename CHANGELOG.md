# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows semantic versioning intent.

## [Unreleased]

### Added
- Added WordPress SQL importer (`admin/api/migrations/wp_sql_import.py`) for people, posts, pages, and bundle media migration into canonical Hugo content.
- Added Story WYSIWYG editor in admin using Toast UI Editor (stores Markdown in `story_md`); includes raw textarea fallback if CDN asset is unavailable.
- Added `THIRD_PARTY.md` to track externally sourced libraries used by the project.
- Added canonical global events schema and API surface (`/api/global-events`, `/api/schema/global-event`).
- Added person `story_md` and structured `timeline[]` support in canonical person schema.
- Added builder `cleanup_warnings` in build responses for non-fatal cleanup issues.
- Added installed-theme manifest storage at `/src/.hft/themes-installed.json`.
- Added read-only installed-theme endpoint:
  - `GET /themes/installed`
  - `GET /api/themes/installed`
- Added troubleshooting guidance for NFS `EBUSY` behavior in builder temp directories.

### Changed
- Reworked children/siblings editor UX to prevent false "reappearing" links: relationship boxes now show only linked people, with separate add-from-search controls and deterministic save payloads.

- Replaced the admin People sidebar search with compact surname/tag filtering: text search + lightweight word-cloud style tag toggles (same family-tag filter model, minimal vertical footprint).

- Person schema and admin editor now support married names (`names.married[]`) and custom person tags (`tags[]`) for surname/tag-based discovery.
- People search APIs now match on married names, maiden names, and custom tags in addition to full/given/surname/AKA.
- Family page now includes a consumer-style filter bar with searchable chips and text search over parsed surname tags + custom tags.

- Family card typography refined: centered name/date text and enabled tabular lining numerals for date rows to improve visual alignment and readability.
- Relaxed media path validation to allow Unicode/space filenames commonly produced by screenshots, while still blocking control chars and unsafe path tokens.
- Admin API validation error payloads are now JSON-safe (`exc.json()` based) to prevent `ValidationError` serialization failures from surfacing as HTTP 500.
- Relationship remove actions now remove entries from the children/siblings box immediately (not just unselect), with toast feedback.
- Switched people-page status notices to a fixed overlay toast so UI messages do not shift content.
- Improved relationship remove actions to use robust click handling and show in-form feedback notices before save.
- Added relationship management controls for children/siblings in admin UI (`Remove Selected`, `Clear All`).
- Added person delete endpoint and admin UI action to delete a person record and scrub relationship references across people/global-events.
- Admin setup/seed now sources canonical scaffold files from tracked assets under `hugo/starter/` instead of inline strings.
- Admin container build now uses repo-root context and packages `hugo/starter/` for runtime seeding.
- Starter scaffold now includes Stage 3 templates/content (family pages, timeline layouts, tree explorer, and tree index).

- Admin API now normalizes legacy bare media filenames (`featured.jpg`, `photo.png`) to `gallery/...` on save to prevent validation failures.
- Added vendored `tui-color-picker` dependency and explicit `colorSyntax` toolbar item so text color control is visible in Story WYSIWYG.
- Added Toast UI color-syntax and table-merged-cell plugins for richer Story WYSIWYG formatting (text color + extended table editing).
- Story/gallery/portrait image uploads now auto-create the person record on first upload when `person_id` does not yet exist.
- Story WYSIWYG now supports bundled image upload via editor image hook (`/api/people/{person_id}/media`, kind `gallery`).
- Added story editor height control (resizable via slider) in admin UI.
- Switched Story editor assets from external CDN references to vendored local static files to avoid CSP/proxy blocking.
- Admin person editor now uses a tabbed layout (Identity, Story, Events, Sources, Gallery, Advanced) to reduce page length and improve navigation.
- Events now use a single editor + date-ordered list workflow (create/save/select/edit/delete) instead of expanding multiple inline cards.
- Admin person editor now supports per-event multi-image media rows and event image uploads into each person bundle gallery.
- Clarified person media UX with a dedicated primary portrait/featured upload field (used for tree cards and featured display).
- Admin person editor now separates **Story**, **Events**, and **Gallery** sections to match the planned schema workflow.
- Added person timeline event editor UI with add/remove actions, event story fields, optional event image path/caption, and related-people/source refs support.
- Event entries are now sorted by date on save and rendered in a date-ordered summary list in the editor.
- Person save now refreshes edit view after update so the timeline immediately reflects sorted order.
- Person payload normalization in admin API now sorts `timeline[]` consistently before validation/write.

- Admin API now includes dedicated global-events CRUD endpoints for public timeline architecture.
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

- Added a dedicated public `/tree/` explorer page with live search and quick relationship navigation cards.
- Enhanced person-page mini tree styling and descendant expand/collapse affordances for easier navigation.
- Improved tree page mobile behavior (single-column cards + non-sticky search header on small screens).

### Documentation
- Updated `/docs/schema/person.md` to document married-name fields, custom tags, and public family surname-tag filtering behavior.

- Updated docs for public-repo exposure hygiene and runtime-content git ignore policy.
- Added `docs/schema/global-events.md` for timeline/global event model contract.
- Updated `README.md` build pipeline notes for managed temp root and same-filesystem requirement.
- Updated `docs/storage.md` with `TMP_DIR`/`PUBLIC_DIR` atomic-swap requirement.
- Updated `docs/troubleshooting.md` for mount-safe temp behavior and expected response fields.
- Updated `docs/developer/api-design.md` for new builder error/success response shape and theme install manifest endpoint.
