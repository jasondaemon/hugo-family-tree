# API Design

## Builder API Contract
- `POST /build`
  - Triggers a Hugo build and safe publish.
  - Success response:
    ```json
    {
      "ok": true,
      "public": "/public",
      "duration_sec": 1.234,
      "cleanup_warnings": [],
      "log_tail": "..."
    }
    ```
  - `cleanup_warnings` contains non-fatal cleanup issues (for example NFS `EBUSY` while pruning old temp dirs).
  - Error response (HTTP 500):
    ```json
    {
      "ok": false,
      "error": "...",
      "log_tail": "..."
    }
    ```

## Admin API Philosophy
- REST-style JSON endpoints.
- All person writes are validated against the canonical schema in `docs/schema/person.md`.
- Read endpoints do not mutate state.

### Admin Endpoints
- `GET /people/list` - lightweight index (used by relationship dropdowns).
- `GET /people/search?q=` - search by name/aliases.
- `GET /api/people` - list/search people (full payload).
- `GET /api/people/{person_id}` - load a person record.
- `GET /api/people/by-slug/{slug}` - load a person record by slug/alias.
- `POST /people` - create a new person bundle (UUID assigned server-side).
- `PUT /people/{person_id}` - update an existing record.
- `POST /api/people/{person_id}/media` - upload media into the bundle gallery.
- `GET /api/setup/status` - setup status and current starter theme.
- `GET /api/setup/themes` - curated starter theme catalog.
  - Includes metadata such as `name`, `description`, `license`, `demo_url`, `repo_url`, `selectable`, and `installable`.
  - `selectable = "true"` means the theme can be applied by setup.
  - `selectable = "false"` means reference-only links for discovery.
  - `installable = "true"` means the allowlisted repository can be installed into `/src/themes`.
- `POST /api/setup` - initialize missing Hugo files, optional `{ "theme_id": "..." }`.
- `POST /api/setup/theme` - apply/update starter theme assets and marker.
- `POST /api/setup/theme/install` - clone or update an allowlisted external theme and set Hugo `theme`.
  - Request body: `{ "theme_id": "papermod-reference", "ref": "optional-tag-or-branch" }`
  - Arbitrary `repo_url` is blocked by default and requires `ALLOW_UNSAFE_THEME_URLS=true`.
  - `theme_dir` is sanitized and restricted to `[a-z0-9_-]`.
  - Response includes `license`, `repo_url`, `theme_dir`, `commit`, and install logs.
- `GET /themes/installed` / `GET /api/themes/installed` - read installed theme manifest with detected license info.
- `POST /api/build` - proxy to builder.

## Error Handling Format
- Errors return non-2xx status codes with a JSON `detail` or `error` string.
- Validation errors return a list of structured error objects.
