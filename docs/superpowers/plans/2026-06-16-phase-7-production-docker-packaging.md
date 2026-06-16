# Phase 7 Production Docker Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Docker packaging and make the default Compose runtime production-like while preserving a dedicated development Compose file.

**Architecture:** Keep application code unchanged. Build and verify the TypeScript app in a Docker builder stage, then run the compiled `dist/index.js` in a smaller non-root runtime stage. Use `docker-compose.yml` for production-like app + persistent Valkey deployment and `docker-compose.dev.yml` for ephemeral local development.

**Tech Stack:** Bun, TypeScript, Docker, Docker Compose, Valkey.

---

## File Map

- Modify `Dockerfile`: convert from single-stage source runtime to multi-stage verified build and non-root runtime.
- Modify `.dockerignore`: exclude local, secret, generated, and dev-only artifacts while retaining files required by the Docker build and TypeScript config.
- Modify `docker-compose.yml`: make it production-like default with persistent Valkey and restart policies.
- Create `docker-compose.dev.yml`: provide local development runtime with ephemeral Valkey.
- Modify `README.md`: document production-like default Compose usage, development Compose usage, Valkey persistence behavior, and verification commands.

Do not change app source code for this phase unless Docker verification exposes a packaging-specific issue.

---

### Task 1: Harden The Dockerfile

**Files:**
- Modify: `Dockerfile`

- [x] **Step 1: Replace the single-stage Dockerfile with a multi-stage build**

Use a `deps` stage for frozen dependency install, a `builder` stage that copies `tsconfig.json`, `src`, and `scripts` before running `bun test`, `bun run typecheck`, and `bun run build`, and a non-root `runtime` stage that installs production dependencies, copies `dist`, exposes `3000`, adds a `/healthz` healthcheck, and runs `bun dist/index.js`.

- [x] **Step 2: Build the image**

Run: `docker build .`

Expected: Docker build completes. During the builder stage, output includes successful `bun test`, `bun run typecheck`, and `bun run build` commands.

---

### Task 2: Tighten Docker Ignore Rules

**Files:**
- Modify: `.dockerignore`

- [x] **Step 1: Replace `.dockerignore` with explicit build-context exclusions**

Exclude local git/worktree/tooling folders, host dependencies, generated output, coverage, environment files, logs, Compose files, docs, and local agent config. Keep `scripts` available because `tsconfig.json` includes `scripts/**/*.ts` and the Docker builder stage type-checks it.

- [x] **Step 2: Verify required Docker build inputs are still included**

Required files must not be ignored:

```text
package.json
bun.lock
tsconfig.json
src/**
scripts/**
```

Run: `docker build .`

Expected: build succeeds and Docker type-checking covers the same TypeScript inputs as local type-checking.

---

### Task 3: Make Default Compose Production-Like

**Files:**
- Modify: `docker-compose.yml`

- [x] **Step 1: Replace `docker-compose.yml` with production-like defaults**

Use services `app` and `valkey`; image `elan-ha:latest`; optional `.env`; `VALKEY_URL=redis://valkey:6379`; `HTTP_HOST=0.0.0.0`; `HTTP_PORT=3000`; `${APP_HTTP_PORT:-3000}:3000`; `restart: unless-stopped`; Valkey append-only persistence; and named volume `valkey-data:/data`.

- [x] **Step 2: Validate default Compose config**

Run: `docker compose config`

Expected: config renders successfully and includes `restart: unless-stopped`, `valkey-data`, and `valkey-server --appendonly yes`.

---

### Task 4: Add Dedicated Development Compose File

**Files:**
- Create: `docker-compose.dev.yml`

- [x] **Step 1: Create `docker-compose.dev.yml`**

Use services `app` and `valkey`; image `elan-ha:dev`; optional `.env`; the same app environment and port mapping as default Compose; and an ephemeral Valkey command `valkey-server --save "" --appendonly no`.

- [x] **Step 2: Validate development Compose config**

Run: `docker compose -f docker-compose.dev.yml config`

Expected: config renders successfully and the Valkey command includes `--save "" --appendonly no`.

---

### Task 5: Update README Docker Documentation

**Files:**
- Modify: `README.md`

- [x] **Step 1: Update Quick Start Docker command**

Document `docker compose up --build` as the production-like runtime and `docker compose -f docker-compose.dev.yml up --build` as the development runtime with ephemeral Valkey storage.

- [x] **Step 2: Add a Docker Runtime section after the configuration note**

Document the production-like default Compose file, persistent `valkey-data` volume, append-only Valkey persistence, development ephemeral Valkey behavior, restart/remapping expectations, and external MQTT broker/Home Assistant dependencies.

- [x] **Step 3: Remove outdated development-only wording**

Ensure README does not imply the default Compose file is development-only and does not imply Zigbee2MQTT is a runtime dependency for this bridge.

---

### Task 6: Full Verification

**Files:**
- No source file changes unless verification exposes issues.

- [ ] **Step 1: Run Bun tests**

Run: `bun test`

Expected: all tests pass with `0 fail`.

- [ ] **Step 2: Run TypeScript type-check**

Run: `bun run typecheck`

Expected: exit code `0`.

- [ ] **Step 3: Run Bun build**

Run: `bun run build`

Expected: exit code `0` and `dist/index.js` is produced.

- [ ] **Step 4: Validate production-like Compose config**

Run: `docker compose config`

Expected: exit code `0`.

- [ ] **Step 5: Validate development Compose config**

Run: `docker compose -f docker-compose.dev.yml config`

Expected: exit code `0`.

- [ ] **Step 6: Build Docker image**

Run: `docker build .`

Expected: exit code `0`; builder stage runs tests, type-check, and build.

- [ ] **Step 7: Inspect git status and diff**

Run: `git status --short`

Expected: only intended Phase 7 files are changed.

Run: `git diff --stat`

Expected: changes are limited to Docker packaging, Compose files, README documentation, and Phase 7 planning/spec docs.

Do not commit unless the user explicitly requests a commit.
