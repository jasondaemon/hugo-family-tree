# Architecture Overview

## Purpose
This project is a Docker-based, GPL-licensed system for managing family tree data in plain files and publishing a Hugo static site. It combines a form-driven admin interface, a dedicated build orchestrator, and a public nginx site with NFS-backed storage and swap-safe publishing.

## High-Level System Diagram
```mermaid
graph TD
  user[Public Visitor] --> npm[Reverse Proxy (NPM)] --> web[public-web (nginx)]
  editor[Editor] --> npm --> admin[admin (FastAPI + UI)]
  admin --> builder[hugo-builder (FastAPI build endpoint)]
  admin -->|read/write| src[(NFS /src)]
  builder -->|read| src
  builder -->|write| tmp[(NFS /public_tmp)]
  builder -->|swap| pub[(NFS /public)]
  builder -->|backup| prev[(NFS /public_prev)]
  web -->|read| pub
```

## Separation of Concerns
- **Admin interface**: A single FastAPI service that serves the UI and API. It edits `src` content and triggers builds.
- **Builder service**: A separate FastAPI service that runs Hugo builds and publishes to `public` using an atomic swap.
- **Public site**: nginx serves the static output from `public` with no write permissions.
- **Storage volumes**: NFS-backed directories for source and published output, enabling durability and external backups.
