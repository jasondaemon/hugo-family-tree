#!/usr/bin/env bash
set -e

echo "Setting up hugo-family-tree skeleton..."

########################################
# Clean junk files
########################################
rm -f .DS_Store || true
find . -name ".DS_Store" -delete || true

########################################
# Folder layout
########################################
mkdir -p nginx builder admin/api admin/ui hugo docs
mkdir -p hugo/content/family hugo/layouts hugo/static

########################################
# docker-compose.yml
########################################
cat > docker-compose.yml <<'YML'
services:
  public-web:
    image: nginx:alpine
    container_name: hugo-family-tree-public
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - site_public:/usr/share/nginx/html:ro
      - ./nginx/public.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - hugo-builder

  internal-web:
    image: nginx:alpine
    container_name: hugo-family-tree-internal
    restart: unless-stopped
    ports:
      - "127.0.0.1:8081:80"
    volumes:
      - ./nginx/internal.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - admin-api
      - admin-ui

  admin-api:
    build:
      context: ./admin/api
    container_name: hugo-family-tree-admin-api
    restart: unless-stopped
    environment:
      REPO_ROOT: /repo
      FAMILY_DIR: /repo/content/family
      BUILD_ENDPOINT: http://hugo-builder:9000/build
    volumes:
      - hugo_repo:/repo
      - site_public:/public
    expose:
      - "8000"
    depends_on:
      - hugo-builder

  admin-ui:
    build:
      context: ./admin/ui
    container_name: hugo-family-tree-admin-ui
    restart: unless-stopped
    expose:
      - "80"

  hugo-builder:
    build:
      context: ./builder
    container_name: hugo-family-tree-hugo-builder
    restart: unless-stopped
    environment:
      REPO_ROOT: /repo
      PUBLIC_DIR: /public
    volumes:
      - hugo_repo:/repo
      - site_public:/public
    expose:
      - "9000"

volumes:
  hugo_repo:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./hugo
  site_public:
YML

########################################
# nginx configs
########################################
cat > nginx/public.conf <<'NGINX'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
NGINX

cat > nginx/internal.conf <<'NGINX'
server {
  listen 80;
  server_name _;
  client_max_body_size 200m;

  location /api/ {
    proxy_pass http://admin-api:8000/;
  }

  location / {
    proxy_pass http://admin-ui:80;
  }
}
NGINX

########################################
# Hugo builder service
########################################
cat > builder/Dockerfile <<'DOCKER'
FROM klakegg/hugo:0.124.1-ext-alpine as hugo

FROM python:3.12-alpine
COPY --from=hugo /usr/local/bin/hugo /usr/local/bin/hugo

WORKDIR /app
RUN pip install fastapi uvicorn
COPY app.py /app/app.py

CMD ["uvicorn","app:app","--host","0.0.0.0","--port","9000"]
DOCKER

cat > builder/app.py <<'PY'
import os, subprocess
from fastapi import FastAPI, HTTPException

app = FastAPI()

REPO_ROOT = os.getenv("REPO_ROOT", "/repo")
PUBLIC_DIR = os.getenv("PUBLIC_DIR", "/public")

@app.post("/build")
def build():
    p = subprocess.run(
        ["hugo","--source",REPO_ROOT,"--destination",PUBLIC_DIR,"--minify"],
        capture_output=True,text=True
    )
    if p.returncode != 0:
        raise HTTPException(500,p.stderr)
    return {"ok":True,"stdout":p.stdout}
PY

########################################
# Admin API placeholder
########################################
cat > admin/api/Dockerfile <<'DOCKER'
FROM python:3.12-slim
WORKDIR /app
RUN pip install fastapi uvicorn requests pyyaml python-multipart
COPY app.py /app/app.py
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000"]
DOCKER

cat > admin/api/app.py <<'PY'
import os,requests
from fastapi import FastAPI,HTTPException

app=FastAPI()
BUILD=os.getenv("BUILD_ENDPOINT","http://hugo-builder:9000/build")

@app.get("/health")
def health():
    return {"ok":True}

@app.post("/build")
def build():
    try:
        r=requests.post(BUILD,timeout=600)
        return r.json()
    except Exception as e:
        raise HTTPException(500,str(e))
PY

########################################
# Admin UI placeholder
########################################
cat > admin/ui/Dockerfile <<'DOCKER'
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
DOCKER

cat > admin/ui/index.html <<'HTML'
<!doctype html>
<html>
<head>
<title>Hugo Family Tree Admin</title>
</head>
<body>
<h1>Admin Placeholder</h1>
<button onclick="build()">Build Hugo</button>
<pre id="out"></pre>

<script>
async function build(){
 let r=await fetch("/api/build",{method:"POST"});
 document.getElementById("out").innerText=
   JSON.stringify(await r.json(),null,2);
}
</script>
</body>
</html>
HTML

########################################
# Minimal Hugo site
########################################
cat > hugo/hugo.toml <<'TOML'
baseURL="http://localhost:8080/"
languageCode="en-us"
title="Hugo Family Tree"
disableKinds=["taxonomy","term"]
TOML

cat > hugo/content/_index.md <<'MD'
---
title: "Hugo Family Tree"
---
Welcome to Hugo Family Tree.
MD

########################################
# README
########################################
cat > README.md <<'MD'
# hugo-family-tree

File-backed Hugo genealogy CMS.

## Start

docker compose up -d --build

Public site:
http://localhost:8080

Admin:
http://localhost:8081
MD

########################################
# LICENSE
########################################
cat > LICENSE <<'TXT'
GPL-3.0
https://www.gnu.org/licenses/gpl-3.0.txt
TXT

########################################
# Architecture doc
########################################
cat > docs/architecture.md <<'MD'
Public nginx serves Hugo output.
Internal nginx serves admin UI + API.
Admin edits files + triggers build.
MD

echo "Setup complete."
