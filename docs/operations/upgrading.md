# Upgrading

## Pull Latest Version
```bash
git pull
```

## Rebuild Containers
```bash
docker compose up -d --build
```

## Compatibility Expectations
- Content format is file-based and should remain backwards compatible.
- If front matter fields change, include a migration note in the release.
