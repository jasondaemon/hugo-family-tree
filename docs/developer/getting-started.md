# Getting Started

## Required Tooling
- Docker Engine + Docker Compose
- Git
- An existing NFS mount for `/src`, `/public`, `/public_tmp`, `/public_prev`

## Start the Stack
```bash
docker compose up -d --build
```

## Access Services
- Public site: via reverse proxy (NPM) to `hugo-family-tree-web:80`
- Admin UI/API: via reverse proxy (NPM) to `hugo-family-tree-admin:80`

## Development Workflow
1. Use the admin UI to create or edit people.
2. Trigger a build from the admin UI or call the builder endpoint.
3. Validate output in `/public`.

## Local Testing
From inside the admin container:
```bash
docker compose exec admin curl -X POST http://localhost:80/api/build
```

## Legacy Migration
To migrate existing records to the canonical person schema:
```bash
docker compose exec admin python -m migrations.legacy_to_schema
```
