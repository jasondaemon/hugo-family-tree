# Trust Boundaries

## Network Separation
- The public site is only reachable via the reverse proxy (NPM).
- The admin UI/API is only reachable via the reverse proxy.
- The builder is internal-only and should not be exposed to the public internet.

## Reverse Proxy Assumptions
- TLS termination and external routing are handled by NPM.
- Only the reverse proxy connects to service containers directly.

## Trust Zones Diagram
```mermaid
flowchart LR
  internet[(Internet)] --> npm[Reverse Proxy (NPM)]
  npm --> web[public-web]
  npm --> admin[admin]
  admin --> builder[hugo-builder]
  admin --> src[(NFS /src)]
  builder --> src
  builder --> pub[(NFS /public)]
```
