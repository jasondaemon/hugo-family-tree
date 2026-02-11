# Authentication

## Current State
The admin service currently assumes a trusted network environment. It does not enforce a built-in authentication layer and should be protected by the reverse proxy and network controls.

## Recommended Near-Term Options
- Basic auth at the reverse proxy.
- IP allowlists for admin endpoints.

## Future RBAC Recommendations
- User accounts with roles (viewer, editor, admin).
- Audit logging of edits and build triggers.
- API tokens for automated workflows.
