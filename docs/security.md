# Security

## Threat Model
- **Public site**: untrusted internet traffic.
- **Admin UI/API**: trusted editors; requires strong access controls.
- **Builder service**: internal-only and should never be exposed externally.
- **Storage**: NFS-backed content and outputs.

## Hardening Checklist
### Admin Exposure
- Restrict admin to internal access list in NPM.
- Consider IP allowlists or VPN-only access.
- Add authentication (Basic Auth or SSO) at the proxy.

### Auth & Authorization
- Current admin assumes a trusted network.
- Roadmap: RBAC with audit logging.

### CSRF / CORS
- If admin is exposed publicly, enable CSRF protection.
- Restrict CORS to the admin domain only.

### Upload Validation
- Validate content types and size limits.
- Store uploads only under the bundle `gallery/` directory.
- Avoid untrusted file execution.

### Path Traversal
- Enforce bundle-relative paths.
- Reject filenames containing `..` or absolute paths.

### Rate Limiting
- Apply rate limits on admin endpoints (reverse proxy or app-level).
- Limit build triggers to avoid resource exhaustion.

### Dependency Pinning
- Pin docker base images and dependencies.
- Review CVEs regularly.

### Logging
- Log build status and errors.
- Avoid logging sensitive content.


## Public Repository Hygiene
- Do not commit personal/private source archives, secrets, or exported credentials.
- Keep runtime content directories (`src/`, `public/`, `public_tmp/`, `public_prev/`) out of git.
- Import jobs should read from archive paths and write to runtime content, not tracked source files.
