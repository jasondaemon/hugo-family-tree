# Deployment

## NFS Mount Expectations
The following directories are expected to be backed by NFS and mounted at the repo root:
- `src/`
- `public/`
- `public_tmp/`
- `public_prev/`

## Docker Compose Deployment
```bash
docker compose up -d --build
```

## Reverse Proxy Setup
Configure NPM to proxy:
- `hugo-family-tree-web:80` for the public site
- `hugo-family-tree-admin:80` for the admin UI/API

The builder service remains internal-only.
