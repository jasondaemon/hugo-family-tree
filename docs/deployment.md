# Deployment

## Prerequisites
- Docker Engine + Docker Compose
- NFS mounted at `/nfs/www.daemon.family`
- DNS control for `daemon.family` and `admin.daemon.family`
- Nginx Proxy Manager (NPM) on the `nginx-proxy-manager_default` network

## Directory Setup
```bash
mkdir -p /nfs/www.daemon.family/src \
  /nfs/www.daemon.family/public \
  /nfs/www.daemon.family/public_tmp \
  /nfs/www.daemon.family/public_prev
```

## Bring the Stack Up
```bash
docker compose up -d --build
```

## Bring the Stack Down
```bash
docker compose down
```

## NPM Proxy Host Setup
Create two Proxy Hosts in NPM:

### 1) Public Site
- **Domain**: `daemon.family`
- **Scheme**: `http`
- **Forward Hostname / IP**: `hugo-family-tree-web`
- **Forward Port**: `80`
- **Access List**: `public` (or none)
- **Websockets**: off (not required)

### 2) Admin Site
- **Domain**: `admin.daemon.family`
- **Scheme**: `http`
- **Forward Hostname / IP**: `hugo-family-tree-admin`
- **Forward Port**: `80`
- **Access List**: `internal`

## DNS Notes
Point `daemon.family` and `admin.daemon.family` to the NPM host. Use A/AAAA records for the host IP.

## TLS Notes
- Use NPM to request Let’s Encrypt certificates for both domains.
- Enable “Force SSL” and HSTS if your environment supports it.

## Network Notes
- `public-web` and `admin` must be attached to the NPM external network.
- `hugo-builder` must remain internal only (default network only).
