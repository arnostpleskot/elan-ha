# Phase 2 Docker Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Docker development runtime that starts the Bun bridge app and a mandatory Valkey service with Compose.

**Architecture:** The app image uses the official Bun runtime, installs dependencies from `bun.lock`, copies source, and runs `bun run start`. Compose builds the app image, starts Valkey, wires environment values from `.env`, exposes the app HTTP port on localhost, and keeps Valkey available for future BullMQ/storage phases even though Phase 2 does not connect to it yet.

**Tech Stack:** Docker, Docker Compose, Bun, Valkey.

---

## File Structure

- Create `Dockerfile`: development-friendly Bun app container.
- Create `.dockerignore`: excludes local dependencies, build artifacts, git metadata, env secrets, and worktrees from Docker build context.
- Create `docker-compose.yml`: app and Valkey services.
- Modify `.env.example`: use Compose service DNS names for MQTT/Valkey defaults and keep placeholder RF-003 credentials.
- Modify `AGENTS.md`: document Docker/Compose development commands.
- Modify `docs/specs/mvp.md`: mark Phase 2 runtime expectations and acceptance details.

## Task 1: Docker Image Definition

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM oven/bun:1.3.11-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

EXPOSE 3000

CMD ["bun", "run", "start"]
```

- [ ] **Step 2: Create `.dockerignore`**

```gitignore
.git
.worktrees
node_modules
dist
coverage
.env
.env.*
!.env.example
*.log
```

- [ ] **Step 3: Verify Dockerfile parses by building the image**

Run: `docker build -t elan-ha:phase2 .`

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "chore: add docker image definition"
```

## Task 2: Compose Development Runtime

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  app:
    build:
      context: .
    image: elan-ha:dev
    env_file:
      - path: .env
        required: false
    environment:
      VALKEY_URL: ${VALKEY_URL:-redis://valkey:6379}
      HTTP_HOST: 0.0.0.0
      HTTP_PORT: 3000
    ports:
      - "${APP_HTTP_PORT:-3000}:3000"
    depends_on:
      valkey:
        condition: service_started

  valkey:
    image: valkey/valkey:8-alpine
    command: ["valkey-server", "--save", "", "--appendonly", "no"]
    ports:
      - "6379:6379"
    volumes:
      - valkey-data:/data

volumes:
  valkey-data:
```

- [ ] **Step 2: Update `.env.example` for Compose defaults**

```dotenv
RF003_BASE_URL=http://rf003.local
RF003_USERNAME=admin
RF003_PASSWORD=change-me

MQTT_URL=mqtt://mosquitto.local:1883
# MQTT_USERNAME=
# MQTT_PASSWORD=
MQTT_DISCOVERY_PREFIX=homeassistant
MQTT_BASE_TOPIC=inels

VALKEY_URL=redis://valkey:6379

POLL_FULL_STATE_INTERVAL_MS=60000
POLL_DEVICE_STATE_INTERVAL_MS=300000

LOG_LEVEL=info
HTTP_HOST=0.0.0.0
# The app listens on port 3000 inside the container.
APP_HTTP_PORT=3000
```

- [ ] **Step 3: Validate Compose config without local env**

Run: `docker compose config`

Expected: Compose renders valid config with `app` and `valkey` services.

- [ ] **Step 4: Confirm example env can be copied for runtime startup**

Run: `cp .env.example .env && git status --short`

Expected: `.env` is ignored and does not appear in status.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker compose development runtime"
```

## Task 3: Docker Runtime Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/specs/mvp.md`

- [ ] **Step 1: Update `AGENTS.md` development commands**

Add these bullets under `Development Commands`:

```markdown
- Copy local environment template: `cp .env.example .env`
- Start Docker development runtime: `docker compose up --build`
- Stop Docker development runtime: `docker compose down`
```

- [ ] **Step 2: Update `docs/specs/mvp.md` Phase 2 acceptance details**

Add this text under `Phase 2: Docker Development Runtime`:

```markdown
Phase 2 acceptance requires `docker compose config` to render successfully even without `.env`. Copy `.env.example` to `.env` before `docker compose up --build`; startup requires RF-003 and MQTT environment values. The app health endpoint must respond at `http://127.0.0.1:3000/healthz` by default, or the configured `APP_HTTP_PORT` host port if changed.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md docs/specs/mvp.md
git commit -m "docs: document docker development runtime"
```

## Task 4: Phase 2 Verification

**Files:**
- Verify all Phase 2 files.

- [ ] **Step 1: Run app checks**

Run: `bun test && bun run typecheck && bun run build`

Expected: all pass.

- [ ] **Step 2: Validate Compose config**

Run: `docker compose config`

Expected: config renders successfully even without `.env`.

- [ ] **Step 3: Create local env for runtime startup**

Run: `cp .env.example .env`

Expected: `.env` exists locally and remains ignored by Git.

- [ ] **Step 4: Start Compose runtime**

Run: `docker compose up --build -d`

Expected: `app` and `valkey` containers start.

- [ ] **Step 5: Verify app health endpoint**

Run: `curl --silent --show-error --fail http://127.0.0.1:3000/healthz`

Expected: `{"status":"ok"}`. If `APP_HTTP_PORT` is changed, use that host port instead of `3000`.

- [ ] **Step 6: Stop Compose runtime**

Run: `docker compose down`

Expected: containers stop and default network is removed.

- [ ] **Step 7: Remove local `.env`**

Run: `rm .env`

Expected: `.env` is removed and remains ignored by Git.

- [ ] **Step 8: Check repository status**

Run: `git status --short`

Expected: clean, or only intentional uncommitted files if verification produced non-ignored artifacts that need cleanup.

## Phase 2 Completion Criteria

- `Dockerfile` builds successfully.
- `.dockerignore` excludes local/generated/secrets files from build context while allowing `.env.example`.
- `docker-compose.yml` defines `app` and `valkey` services.
- Compose uses optional `.env`, has defaults for `VALKEY_URL`, pins container `HTTP_HOST` to `0.0.0.0` and container `HTTP_PORT` to `3000`, and uses `APP_HTTP_PORT` for the host port.
- `docker compose up --build -d` starts both services.
- `GET /healthz` returns `{ "status": "ok" }` from the containerized app.
- `bun test`, `bun run typecheck`, and `bun run build` pass outside Docker.
- No real `.env` or secrets are committed.
