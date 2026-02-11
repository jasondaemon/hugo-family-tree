# Threat Model

## Trust Zones
- **Public site**: Read-only static content served by nginx.
- **Admin interface**: Authenticated editor UI and API (currently minimal auth placeholder).
- **Builder service**: Internal-only build endpoint.
- **Storage**: NFS-backed content and output directories.

## Threat Actors
- **Internet users**: Untrusted traffic via the public site and reverse proxy.
- **Authenticated editors**: Trusted but potentially error-prone users with write access to `/src`.
- **Compromised container**: A service container with unexpected code execution.

## Key Risks
- Unauthorized admin access leading to content tampering.
- Path traversal or unsafe file writes into `/src`.
- Build process abuse (e.g., repeated builds causing resource exhaustion).
- Compromised builder writing malicious output into `/public`.
