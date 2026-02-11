# Containers

This stack is intentionally small and explicit. Each container has a focused responsibility and clear IO boundaries.

## 1) public-web (nginx)
- **Responsibilities**: Serve the static Hugo output from `/public`.
- **Inputs**: Read-only access to `/public`.
- **Outputs**: HTTP responses to end users via the reverse proxy.
- **Network relationships**: Exposed only on the internal Docker network. NPM proxies to this container.
- **Why it exists**: Keeps the public site read-only and isolated from editing and build concerns.

## 2) admin (FastAPI + UI)
- **Responsibilities**: Provide UI + API for managing person records and triggering builds.
- **Inputs**: Read/write access to `/src`. Read-only access to `/public` (optional for build logs).
- **Outputs**: Writes content bundles into `/src` and calls the builder API.
- **Network relationships**: Accessible only via the reverse proxy. Calls `hugo-builder` directly on the internal network.
- **Why it exists**: Centralizes editing and validation without giving the public site or builder direct edit access.

## 3) hugo-builder (FastAPI)
- **Responsibilities**: Run Hugo builds and publish output safely.
- **Inputs**: Read-only access to `/src`.
- **Outputs**: Writes to `/public_tmp`, then swaps into `/public`, and archives to `/public_prev`.
- **Network relationships**: Internal-only; invoked by admin.
- **Why it exists**: Separates build execution from editing and public serving, and enforces atomic publish.
