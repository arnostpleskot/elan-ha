# Home Assistant Repository Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the project into a publishable Home Assistant app repository with a self-contained `elan-ha/` app, CI checks, and GHCR publishing workflow.

**Architecture:** The repository root becomes Home Assistant repository metadata plus contributor documentation. The `elan-ha/` directory becomes the complete app package and Bun application root so Home Assistant builder actions can build it with `./elan-ha` as Docker context. Standalone Docker remains at root but builds from the self-contained app source.

**Tech Stack:** Bun, TypeScript, Elysia, MQTT.js, BullMQ, Valkey, Pino, Home Assistant app packaging, GitHub Actions, GHCR, oxlint.

---

## File Structure

- Create `repository.yaml`: Home Assistant repository metadata.
- Create `.github/workflows/ci.yml`: PR/push CI for Bun checks and Docker builds.
- Create `.github/workflows/publish.yml`: GHCR publishing through Home Assistant builder actions.
- Move `package.json` to `elan-ha/package.json`: app-local Bun package scripts and dependencies.
- Move `bun.lock` to `elan-ha/bun.lock`: app-local lockfile.
- Move `tsconfig.json` to `elan-ha/tsconfig.json`: app-local TypeScript config.
- Move `src/` to `elan-ha/src/`: app source and tests.
- Move `scripts/` to `elan-ha/scripts/`: app-local diagnostic helper scripts.
- Move `config.yaml` to `elan-ha/config.yaml`: Home Assistant app configuration.
- Move `Dockerfile` to `elan-ha/Dockerfile`: Home Assistant app image build using app-local context.
- Move `run.sh` to `elan-ha/run.sh`: Supervisor runtime launcher.
- Move `init.sh` to `elan-ha/init.sh`: base image init override.
- Move `DOCS.md` to `elan-ha/DOCS.md`: Home Assistant user docs.
- Move `CHANGELOG.md` to `elan-ha/CHANGELOG.md`: Home Assistant app changelog.
- Create `elan-ha/README.md`: Home Assistant Store intro.
- Modify root `README.md`: GitHub/contributor overview with commands updated for `elan-ha/`.
- Modify `.dockerignore`: root Docker ignore for standalone builds.
- Create `elan-ha/.dockerignore`: app-context Docker ignore for Home Assistant app builds.
- Modify `standalone/Dockerfile`: build from `elan-ha/` paths within root context.
- Modify `standalone/docker-compose.yml`: continue root context build and `.env` behavior.
- Modify `AGENTS.md`: update Bun development commands to run from `elan-ha/` and keep Docker Compose commands at repository root.
- Modify `docs/superpowers/specs/2026-06-17-home-assistant-repository-publishing-design.md`: already updated; keep as design source.

## Task 1: Move Tests First To Expect Published Repository Layout

**Files:**
- Modify: `src/ha-app/package.test.ts`

- [ ] **Step 1: Replace package layout tests with failing expectations**

Replace the full contents of `src/ha-app/package.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("../../", import.meta.url).pathname;

const readRepoFile = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

describe("Home Assistant app repository package", () => {
  test("contains root Home Assistant repository metadata", () => {
    const repository = readRepoFile("repository.yaml");

    expect(repository).toContain("name: eLAN RF-003 Home Assistant Apps");
    expect(repository).toContain("url: https://github.com/arnostpleskot/elan-ha");
    expect(repository).toContain("maintainer: Arnost Pleskot");
  });

  test("keeps the app package self-contained under elan-ha", () => {
    for (const path of [
      "elan-ha/config.yaml",
      "elan-ha/Dockerfile",
      "elan-ha/run.sh",
      "elan-ha/init.sh",
      "elan-ha/README.md",
      "elan-ha/DOCS.md",
      "elan-ha/CHANGELOG.md",
      "elan-ha/package.json",
      "elan-ha/bun.lock",
      "elan-ha/tsconfig.json",
      "elan-ha/src/index.ts",
      "elan-ha/scripts/probe-gateway.ts",
    ]) {
      expect(existsSync(join(repoRoot, path)), path).toBe(true);
    }
  });

  test("does not keep obsolete root app package files", () => {
    for (const path of ["config.yaml", "Dockerfile", "run.sh", "init.sh", "DOCS.md", "CHANGELOG.md", "package.json", "bun.lock", "tsconfig.json", "src/index.ts", "scripts/probe-gateway.ts"]) {
      expect(existsSync(join(repoRoot, path)), path).toBe(false);
    }
  });

  test("declares a headless mqtt-dependent Supervisor app with published image", () => {
    const config = readRepoFile("elan-ha/config.yaml");

    expect(config).toContain('name: "eLAN RF-003 MQTT Bridge"');
    expect(config).toContain('slug: "elan_ha"');
    expect(config).toContain('version: "0.1.0"');
    expect(config).toContain('image: "ghcr.io/arnostpleskot/elan-ha"');
    expect(config).toContain("services:\n  - mqtt:need");
    expect(config).toContain("startup: application");
    expect(config).toContain("boot: auto");
    expect(config).toContain("init: false");

    expect(config).not.toContain("ingress:");
    expect(config).not.toContain("webui:");
    expect(config).not.toContain("ports:");
    expect(config).not.toContain("host_network:");
    expect(config).not.toContain("homeassistant_api:");
    expect(config).not.toContain("hassio_api:");
    expect(config).not.toContain("docker_api:");
    expect(config).not.toContain("full_access:");
    expect(config).not.toContain("apparmor: false");
  });

  test("defines RF-003 options and password schema", () => {
    const config = readRepoFile("elan-ha/config.yaml");

    expect(config).toContain("options:\n  rf003_base_url: \"\"");
    expect(config).toContain('  mqtt_discovery_prefix: "homeassistant"');
    expect(config).toContain('  mqtt_base_topic: "inels"');
    expect(config).toContain("  poll_full_state_interval_ms: 60000");
    expect(config).toContain("  poll_device_state_interval_ms: 300000");
    expect(config).toContain('  log_level: "info"');
    expect(config).toContain("  rf003_base_url: str");
    expect(config).toContain("  rf003_password: password");
    expect(config).toContain("  log_level: list(trace|debug|info|warn|error|fatal)");
  });

  test("starts internal Valkey and maps Supervisor configuration in run.sh", () => {
    const runScript = readRepoFile("elan-ha/run.sh");

    expect(runScript).toContain("#!/usr/bin/env bash");
    expect(runScript).toContain(". /usr/lib/bashio/bashio.sh");
    expect(runScript).not.toContain("with-contenv");
    expect(runScript).toContain('valkey-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no');
    expect(runScript).toContain('bash -c "true >/dev/tcp/127.0.0.1/6379"');
    expect(runScript).toContain("/dev/tcp/127.0.0.1/6379");
    expect(runScript).not.toContain("valkey-cli");
    expect(runScript).toContain('export VALKEY_URL="redis://127.0.0.1:6379"');
    expect(runScript).toContain('bashio::services mqtt "host"');
    expect(runScript).toContain('bashio::services mqtt "port"');
    expect(runScript).toContain('bashio::services mqtt "username"');
    expect(runScript).toContain('bashio::services mqtt "password"');
    expect(runScript).toContain('export RF003_BASE_URL="$(bashio::config \'rf003_base_url\')"');
    expect(runScript).toContain('export RF003_USERNAME="$(bashio::config \'rf003_username\')"');
    expect(runScript).toContain('export RF003_PASSWORD="$(bashio::config \'rf003_password\')"');
    expect(runScript).toContain('export MQTT_URL="mqtt://${MQTT_HOST}:${MQTT_PORT}"');
    expect(runScript).toContain('export MQTT_DISCOVERY_PREFIX="$(bashio::config \'mqtt_discovery_prefix\')"');
    expect(runScript).toContain('export MQTT_BASE_TOPIC="$(bashio::config \'mqtt_base_topic\')"');
    expect(runScript).toContain('export POLL_FULL_STATE_INTERVAL_MS="$(bashio::config \'poll_full_state_interval_ms\')"');
    expect(runScript).toContain('export POLL_DEVICE_STATE_INTERVAL_MS="$(bashio::config \'poll_device_state_interval_ms\')"');
    expect(runScript).toContain('export LOG_LEVEL="$(bashio::config \'log_level\')"');
    expect(runScript).toContain('export MQTT_USERNAME="${MQTT_USERNAME_VALUE}"');
    expect(runScript).toContain('export MQTT_PASSWORD="${MQTT_PASSWORD_VALUE}"');
    expect(runScript).toContain('export HTTP_HOST="127.0.0.1"');
    expect(runScript).toContain('export HTTP_PORT="3000"');
    expect(runScript).toContain("bun /app/dist/index.js");
  });

  test("builds the Home Assistant app from an app-local Docker context", () => {
    const dockerfile = readRepoFile("elan-ha/Dockerfile");

    expect(dockerfile).toContain("FROM oven/bun:1.3.11-alpine AS deps");
    expect(dockerfile).toContain("FROM ghcr.io/home-assistant/base:3.22");
    expect(dockerfile).toContain("COPY package.json bun.lock ./");
    expect(dockerfile).toContain("COPY tsconfig.json ./");
    expect(dockerfile).toContain("COPY src ./src");
    expect(dockerfile).toContain("COPY scripts ./scripts");
    expect(dockerfile).toContain("COPY config.yaml run.sh ./");
    expect(dockerfile).toContain("io.hass.type=\"app\"");
    expect(dockerfile).toContain("apk add --no-cache ca-certificates libstdc++ valkey");
    expect(dockerfile).toContain("COPY --from=builder /app/dist ./dist");
    expect(dockerfile).toContain("COPY init.sh /init");
    expect(dockerfile).toContain("chmod a+x /run.sh /init");
    expect(dockerfile).toContain('CMD ["/run.sh"]');
  });

  test("keeps Home Assistant app Docker builds deploy-focused", () => {
    const dockerfile = readRepoFile("elan-ha/Dockerfile");

    expect(dockerfile).not.toContain("RUN bun test");
    expect(dockerfile).not.toContain("RUN bun run typecheck");
    expect(dockerfile).toContain("RUN bun run build");
  });

  test("keeps standalone Docker Compose separate from the HA app", () => {
    const compose = readRepoFile("standalone/docker-compose.yml");
    const standaloneDockerfile = readRepoFile("standalone/Dockerfile");

    expect(compose).toContain("context: ..");
    expect(compose).toContain("dockerfile: standalone/Dockerfile");
    expect(compose).toContain("VALKEY_URL: ${VALKEY_URL:-redis://valkey:6379}");
    expect(compose).toContain('"${APP_HTTP_PORT:-3000}:3000"');
    expect(standaloneDockerfile).toContain("COPY elan-ha/package.json elan-ha/bun.lock ./");
    expect(standaloneDockerfile).toContain("COPY elan-ha/tsconfig.json ./");
    expect(standaloneDockerfile).toContain("COPY elan-ha/src ./src");
    expect(standaloneDockerfile).toContain("COPY elan-ha/scripts ./scripts");
    expect(standaloneDockerfile).toContain("RUN bun test src/app src/config src/devices src/gateway src/http src/mqtt src/observability src/queue src/storage src/ha-app");
    expect(standaloneDockerfile).toContain("HEALTHCHECK");
    expect(standaloneDockerfile).toContain('CMD ["bun", "dist/index.js"]');
  });

  test("defines real linting separate from typecheck", () => {
    const packageJson = JSON.parse(readRepoFile("elan-ha/package.json")) as { scripts: Record<string, string> };

    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts.lint).toBe("oxlint .");
    expect(packageJson.scripts.lint).not.toBe(packageJson.scripts.typecheck);
  });

  test("defines CI and publishing workflows", () => {
    const ci = readRepoFile(".github/workflows/ci.yml");
    const publish = readRepoFile(".github/workflows/publish.yml");

    expect(ci).toContain("bun test");
    expect(ci).toContain("bun run typecheck");
    expect(ci).toContain("bun run lint");
    expect(ci).toContain("docker build -t elan-ha-ha-app:ci elan-ha");
    expect(ci).toContain("docker build -f standalone/Dockerfile -t elan-ha-standalone:ci .");

    expect(publish).toContain("permissions:");
    expect(publish).toContain("packages: write");
    expect(publish).toContain("home-assistant/builder/actions/build-image");
    expect(publish).toContain("home-assistant/builder/actions/publish-multi-arch-manifest");
    expect(publish).toContain('context: "./elan-ha"');
  });

  test("documents GitHub and Home Assistant audiences separately", () => {
    const rootReadme = readRepoFile("README.md");
    const appReadme = readRepoFile("elan-ha/README.md");
    const docs = readRepoFile("elan-ha/DOCS.md");
    const changelog = readRepoFile("elan-ha/CHANGELOG.md");

    expect(rootReadme).toContain("Home Assistant app repository");
    expect(rootReadme).toContain("cd elan-ha");
    expect(rootReadme).toContain("standalone/docker-compose.yml");
    expect(rootReadme).toContain("GHCR");

    expect(appReadme).toContain("MQTT Discovery");
    expect(appReadme).toContain("RF-003");
    expect(appReadme).not.toContain("bun install");

    expect(docs).toContain("MQTT app is required");
    expect(docs).toContain("RF-003 Network Access");
    expect(docs).toContain("Restart Behavior");

    expect(changelog).toContain("## 0.1.0");
    expect(changelog).toContain("Initial local Home Assistant app package");
  });
});
```

- [ ] **Step 2: Run the failing package layout test**

Run: `bun test src/ha-app/package.test.ts`

Expected: FAIL because `repository.yaml`, `elan-ha/package.json`, `elan-ha/src/index.ts`, workflows, and other moved files do not exist yet.

- [ ] **Step 3: Commit failing test**

Run:

```bash
git add src/ha-app/package.test.ts
git commit -m "test: expect home assistant repository layout"
```

## Task 2: Move App Source And Package Files Under `elan-ha/`

**Files:**
- Create directory: `elan-ha/`
- Move: `package.json` -> `elan-ha/package.json`
- Move: `bun.lock` -> `elan-ha/bun.lock`
- Move: `tsconfig.json` -> `elan-ha/tsconfig.json`
- Move: `src/` -> `elan-ha/src/`
- Move: `scripts/` -> `elan-ha/scripts/`
- Move: `config.yaml` -> `elan-ha/config.yaml`
- Move: `Dockerfile` -> `elan-ha/Dockerfile`
- Move: `run.sh` -> `elan-ha/run.sh`
- Move: `init.sh` -> `elan-ha/init.sh`
- Move: `DOCS.md` -> `elan-ha/DOCS.md`
- Move: `CHANGELOG.md` -> `elan-ha/CHANGELOG.md`

- [ ] **Step 1: Verify parent directory exists**

Run: `ls .`

Expected: repository root listing includes current root files and no `elan-ha/` directory, or `elan-ha/` exists only if created by a previous interrupted attempt.

- [ ] **Step 2: Move files without rewriting contents**

Run:

```bash
mkdir -p elan-ha && git mv package.json bun.lock tsconfig.json src scripts config.yaml Dockerfile run.sh init.sh DOCS.md CHANGELOG.md elan-ha/
```

Expected: command succeeds and `git status --short` shows renames into `elan-ha/`.

- [ ] **Step 3: Verify moved package test path still runs from its new location**

Run: `bun test elan-ha/src/ha-app/package.test.ts`

Expected: FAIL because `repoRoot` inside the moved test still points to `elan-ha/`, not the repository root.

- [ ] **Step 4: Fix repository root detection in moved package test**

In `elan-ha/src/ha-app/package.test.ts`, change:

```ts
const repoRoot = new URL("../../", import.meta.url).pathname;
```

to:

```ts
const repoRoot = new URL("../../../", import.meta.url).pathname;
```

- [ ] **Step 5: Run moved package test again**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: FAIL only for missing repository metadata/workflows/app README and content not yet updated, not because files cannot be found from the wrong root.

- [ ] **Step 6: Commit the move**

Run:

```bash
git add -A
git commit -m "refactor: move app into home assistant package folder"
```

## Task 3: Add Repository Metadata And Published Image Reference

**Files:**
- Create: `repository.yaml`
- Modify: `elan-ha/config.yaml`

- [ ] **Step 1: Add root repository metadata**

Create `repository.yaml` with:

```yaml
name: eLAN RF-003 Home Assistant Apps
url: https://github.com/arnostpleskot/elan-ha
maintainer: Arnost Pleskot
```

- [ ] **Step 2: Add GHCR image reference to app config**

In `elan-ha/config.yaml`, add the image line after `url:`:

```yaml
image: "ghcr.io/arnostpleskot/elan-ha"
```

The top of `elan-ha/config.yaml` should be:

```yaml
name: "eLAN RF-003 MQTT Bridge"
version: "0.1.0"
slug: "elan_ha"
description: "Bridge iNELS RF-003 devices to Home Assistant through MQTT Discovery"
url: "https://github.com/arnostpleskot/elan-ha"
image: "ghcr.io/arnostpleskot/elan-ha"
arch:
  - aarch64
  - amd64
```

- [ ] **Step 3: Run package layout test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: FAIL because Dockerfile paths, package lint script, workflows, and app README are not updated yet.

- [ ] **Step 4: Commit metadata changes**

Run:

```bash
git add repository.yaml elan-ha/config.yaml
git commit -m "feat: add home assistant repository metadata"
```

## Task 4: Update App Docker Contexts And Ignores

**Files:**
- Modify: `elan-ha/Dockerfile`
- Modify: `.dockerignore`
- Create: `elan-ha/.dockerignore`
- Modify: `standalone/Dockerfile`
- Modify: `standalone/docker-compose.yml`

- [ ] **Step 1: Update `elan-ha/Dockerfile` for app-local context**

Replace the full contents of `elan-ha/Dockerfile` with:

```dockerfile
FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY config.yaml run.sh ./

RUN bun run build

FROM ghcr.io/home-assistant/base:3.22

ARG BUILD_VERSION=0.1.0
ARG BUILD_ARCH=amd64

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ca-certificates libstdc++ valkey

COPY --from=deps /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY init.sh /init
COPY run.sh /run.sh
RUN chmod a+x /run.sh /init

CMD ["/run.sh"]
```

- [ ] **Step 2: Update root `.dockerignore` for standalone root-context builds**

Replace `.dockerignore` with:

```dockerignore
.git
.worktrees
.claude
.opencode
.agents
node_modules
elan-ha/node_modules
dist
elan-ha/dist
coverage
elan-ha/coverage
.env
.env.*
!.env.example
*.log
docs
skills-lock.json
opencode.json
```

- [ ] **Step 3: Add app-context `.dockerignore`**

Create `elan-ha/.dockerignore` with:

```dockerignore
.git
node_modules
dist
coverage
.env
.env.*
!.env.example
*.log
```

- [ ] **Step 4: Update `standalone/Dockerfile` for root context with nested app files**

Replace the full contents of `standalone/Dockerfile` with:

```dockerfile
FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY elan-ha/package.json elan-ha/bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

COPY elan-ha/tsconfig.json ./
COPY elan-ha/src ./src
COPY elan-ha/scripts ./scripts

RUN bun test src/app src/config src/devices src/gateway src/http src/mqtt src/observability src/queue src/storage src/ha-app
RUN bun run typecheck
RUN bun run build

FROM oven/bun:1.3.11-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY elan-ha/package.json elan-ha/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "try { const response = await fetch('http://127.0.0.1:3000/healthz'); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }"

CMD ["bun", "dist/index.js"]
```

- [ ] **Step 5: Keep compose context unchanged**

Verify `standalone/docker-compose.yml` still contains:

```yaml
    build:
      context: ..
      dockerfile: standalone/Dockerfile
```

If it does not, restore those lines.

- [ ] **Step 6: Run package layout test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: FAIL because lint script, workflows, and app README are not updated yet.

- [ ] **Step 7: Build Home Assistant Docker image**

Run: `docker build -t elan-ha-ha-app:local elan-ha`

Expected: PASS with an image named `elan-ha-ha-app:local`.

- [ ] **Step 8: Build standalone Docker image**

Run: `docker build -f standalone/Dockerfile -t elan-ha-standalone:local .`

Expected: FAIL until package tests no longer require workflows/app README, or PASS if later tasks were already completed. If it fails only because `src/ha-app/package.test.ts` expects future workflow/docs files, continue to the next task.

- [ ] **Step 9: Commit Docker context changes**

Run:

```bash
git add .dockerignore elan-ha/.dockerignore elan-ha/Dockerfile standalone/Dockerfile standalone/docker-compose.yml
git commit -m "fix: make app package docker context self-contained"
```

## Task 5: Add Real Linting

**Files:**
- Modify: `elan-ha/package.json`
- Modify: `elan-ha/bun.lock`

- [ ] **Step 1: Add oxlint dependency and script**

Run: `cd elan-ha && bun add -d oxlint`

Expected: `elan-ha/package.json` and `elan-ha/bun.lock` update.

- [ ] **Step 2: Set lint script to oxlint**

In `elan-ha/package.json`, ensure scripts are:

```json
"scripts": {
  "dev": "bun --watch src/index.ts",
  "start": "bun src/index.ts",
  "test": "bun test",
  "typecheck": "tsc --noEmit",
  "lint": "oxlint .",
  "format": "bunx prettier --write .",
  "build": "bun build src/index.ts --outdir dist --target bun"
}
```

- [ ] **Step 3: Run lint**

Run: `cd elan-ha && bun run lint`

Expected: PASS. If oxlint reports a concrete issue, fix the issue without disabling the rule globally.

- [ ] **Step 4: Run package layout test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: FAIL because workflows and app README are not updated yet.

- [ ] **Step 5: Commit lint changes**

Run:

```bash
git add elan-ha/package.json elan-ha/bun.lock
git commit -m "chore: add oxlint"
```

## Task 6: Split GitHub And Home Assistant Documentation

**Files:**
- Modify: `README.md`
- Create: `elan-ha/README.md`
- Modify: `elan-ha/DOCS.md`
- Modify: `elan-ha/CHANGELOG.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Replace root `README.md` with contributor-focused content**

Replace root `README.md` with:

```markdown
# elan-ha

> Home Assistant app repository and Bun bridge for iNELS RF-003 to MQTT Discovery.

`elan-ha` connects an existing iNELS RF installation to Home Assistant without replacing hardware or installing a custom Home Assistant integration. The bridge talks to the RF-003 gateway over its HTTP API, serializes gateway operations through BullMQ, and exposes supported devices through MQTT Discovery.

## Repository Layout

This is a Home Assistant app repository.

- `repository.yaml` describes the app repository for Home Assistant Supervisor.
- `elan-ha/` contains the self-contained Home Assistant app package and Bun source code.
- `standalone/` contains a Docker Compose runtime for non-Supervisor development and testing.
- `.github/workflows/` contains CI and GHCR publishing workflows.

## Architecture

```text
RF-003
    -> HTTP API
elan-ha app (Bun + TypeScript)
    -> BullMQ + Valkey
    -> MQTT Discovery, state, commands
MQTT broker
    -> Home Assistant
```

RF-003 is the source of truth for device inventory and state. All RF-003 communication is serialized through a BullMQ worker with concurrency `1` to avoid gateway session races and overlapping RF transmissions.

## Development

Install dependencies:

```bash
cd elan-ha
bun install
```

Run tests:

```bash
cd elan-ha
bun test
```

Type-check:

```bash
cd elan-ha
bun run typecheck
```

Lint:

```bash
cd elan-ha
bun run lint
```

Build:

```bash
cd elan-ha
bun run build
```

## Standalone Runtime

For non-Supervisor development, copy the example env file and start Docker Compose from the repository root:

```bash
cp .env.example .env
docker compose -f standalone/docker-compose.yml up --build
```

Stop it with:

```bash
docker compose -f standalone/docker-compose.yml down
```

## Home Assistant App Repository

Home Assistant users add this repository URL in Supervisor:

```text
https://github.com/arnostpleskot/elan-ha
```

The app package shown in Home Assistant is `elan-ha/`. Its Home Assistant-facing intro, documentation, and changelog live in `elan-ha/README.md`, `elan-ha/DOCS.md`, and `elan-ha/CHANGELOG.md`.

## Publishing

GitHub Actions publishes prebuilt Home Assistant app images to GHCR as:

```text
ghcr.io/arnostpleskot/elan-ha
```

The app `config.yaml` references that generic multi-architecture image. GHCR images are public for users to pull; publishing requires repository/package write permissions.
```

- [ ] **Step 2: Add Home Assistant app intro README**

Create `elan-ha/README.md` with:

```markdown
# eLAN RF-003 MQTT Bridge

Bridge iNELS RF-003 devices into Home Assistant through MQTT Discovery.

This app reads supported devices from the RF-003 gateway, mirrors their state to MQTT, and accepts Home Assistant MQTT commands that are written back to RF-003. It does not install a custom Home Assistant integration and does not require an ingress UI.

## Requirements

- Home Assistant Supervisor.
- The Home Assistant MQTT app configured and running.
- RF-003 reachable from the Home Assistant app container.

Supported RF-003-discovered entities are exposed through Home Assistant's normal MQTT Discovery device and entity UI.
```

- [ ] **Step 3: Update `elan-ha/DOCS.md` installation wording**

In `elan-ha/DOCS.md`, replace the "Local Installation Before Publishing" section with:

```markdown
## Installation

1. Open Home Assistant Supervisor.
2. Add this app repository:

   ```text
   https://github.com/arnostpleskot/elan-ha
   ```

3. Install **eLAN RF-003 MQTT Bridge**.
4. Configure the RF-003 options.
5. Start the app.

The app uses the published GHCR image declared in `config.yaml`. Local manual-copy testing is still possible for development, but the normal user path is adding the app repository in Supervisor.
```

- [ ] **Step 4: Update AGENTS development commands**

In `AGENTS.md`, update the development command list so Bun commands are app-local:

```markdown
- Install dependencies: `cd elan-ha && bun install`
- Start development server: `cd elan-ha && bun run dev`
- Run tests: `cd elan-ha && bun test`
- Type-check: `cd elan-ha && bun run typecheck`
- Lint: `cd elan-ha && bun run lint`
- Format: `cd elan-ha && bun run format`
- Build: `cd elan-ha && bun run build`
```

Keep Docker Compose commands at repository root:

```markdown
- Create local environment file: `cp .env.example .env`
- Start Docker development runtime: `docker compose -f standalone/docker-compose.yml up --build`
- Stop Docker development runtime: `docker compose -f standalone/docker-compose.yml down`
```

- [ ] **Step 5: Run docs-related package test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: FAIL because workflows are not created yet, or PASS if workflows were already created.

- [ ] **Step 6: Commit docs split**

Run:

```bash
git add README.md AGENTS.md elan-ha/README.md elan-ha/DOCS.md elan-ha/CHANGELOG.md
git commit -m "docs: split repository and app documentation"
```

## Task 7: Add CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Create `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  app:
    name: App checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: elan-ha
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun test

      - name: Type-check
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Build
        run: bun run build

  docker:
    name: Docker builds
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Build Home Assistant app image
        run: docker build -t elan-ha-ha-app:ci elan-ha

      - name: Build standalone image
        run: docker build -f standalone/Dockerfile -t elan-ha-standalone:ci .
```

- [ ] **Step 2: Run package layout test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: FAIL because publishing workflow is not created yet.

- [ ] **Step 3: Commit CI workflow**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add app checks and docker builds"
```

## Task 8: Add GHCR Publishing Workflow

**Files:**
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create publishing workflow**

Create `.github/workflows/publish.yml` with:

```yaml
name: Publish Home Assistant app

on:
  workflow_dispatch:
  release:
    types:
      - published

permissions:
  contents: read
  id-token: write
  packages: write

jobs:
  prepare:
    name: Prepare build
    runs-on: ubuntu-latest
    outputs:
      architectures: ${{ steps.info.outputs.architectures }}
      build_matrix: ${{ steps.matrix.outputs.matrix }}
      image_name: ${{ steps.normalize.outputs.image_name }}
      name: ${{ steps.normalize.outputs.name }}
      description: ${{ steps.normalize.outputs.description }}
      url: ${{ steps.normalize.outputs.url }}
      registry_prefix: ${{ steps.normalize.outputs.registry_prefix }}
      version: ${{ steps.normalize.outputs.version }}
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Get app information
        id: info
        uses: home-assistant/actions/helpers/info@master
        with:
          path: ./elan-ha

      - name: Normalize app information
        id: normalize
        run: |
          image=${{ steps.info.outputs.image }}
          echo "image_name=${image##*/}" >> "$GITHUB_OUTPUT"
          echo "registry_prefix=${image%/*}" >> "$GITHUB_OUTPUT"
          echo "version=${{ steps.info.outputs.version }}" >> "$GITHUB_OUTPUT"
          echo "name=${{ steps.info.outputs.name }}" >> "$GITHUB_OUTPUT"
          echo "description=${{ steps.info.outputs.description }}" >> "$GITHUB_OUTPUT"
          url=${{ steps.info.outputs.url }}
          if [[ -n "$url" && "$url" != "null" ]]; then
            echo "url=${url}" >> "$GITHUB_OUTPUT"
          fi

      - name: Prepare build matrix
        id: matrix
        uses: home-assistant/builder/actions/prepare-multi-arch-matrix@2026.03.2
        with:
          architectures: ${{ steps.info.outputs.architectures }}
          image-name: ${{ steps.normalize.outputs.image_name }}
          registry-prefix: ${{ steps.normalize.outputs.registry_prefix }}

  build:
    name: Build ${{ matrix.arch }} image
    needs: prepare
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix: ${{ fromJSON(needs.prepare.outputs.build_matrix) }}
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Build image
        uses: home-assistant/builder/actions/build-image@2026.03.2
        with:
          arch: ${{ matrix.arch }}
          container-registry-password: ${{ secrets.GITHUB_TOKEN }}
          context: "./elan-ha"
          image: ${{ matrix.image }}
          image-tags: |
            ${{ needs.prepare.outputs.version }}
            latest
          labels: |
            io.hass.type=app
            io.hass.name=${{ needs.prepare.outputs.name }}
            io.hass.description=${{ needs.prepare.outputs.description }}
            ${{ needs.prepare.outputs.url && format('io.hass.url={0}', needs.prepare.outputs.url) || '' }}
          push: true
          version: ${{ needs.prepare.outputs.version }}

  manifest:
    name: Publish multi-arch manifest
    needs:
      - prepare
      - build
    runs-on: ubuntu-latest
    steps:
      - name: Publish multi-arch manifest
        uses: home-assistant/builder/actions/publish-multi-arch-manifest@2026.03.2
        with:
          architectures: ${{ needs.prepare.outputs.architectures }}
          container-registry-password: ${{ secrets.GITHUB_TOKEN }}
          image-name: ${{ needs.prepare.outputs.image_name }}
          image-tags: |
            ${{ needs.prepare.outputs.version }}
            latest
          registry-prefix: ${{ needs.prepare.outputs.registry_prefix }}
```

- [ ] **Step 2: Run package layout test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit publish workflow**

Run:

```bash
git add .github/workflows/publish.yml
git commit -m "ci: publish home assistant app image"
```

## Task 9: Update Environment Example And Path-Sensitive Docs

**Files:**
- Move: `.env.example` -> `elan-ha/.env.example` or keep root depending on compose needs
- Modify: `standalone/docker-compose.yml`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Keep `.env.example` at root for Docker Compose**

Do not move `.env.example`. `standalone/docker-compose.yml` reads `../.env` from the standalone directory, so root `.env.example` remains the right user-facing template for standalone Compose.

- [ ] **Step 2: Verify compose env file path**

Read `standalone/docker-compose.yml` and confirm it contains:

```yaml
    env_file:
      - path: ../.env
        required: false
```

If those lines are missing, restore them.

- [ ] **Step 3: Verify root README standalone instructions**

Confirm root `README.md` contains:

```bash
cp .env.example .env
docker compose -f standalone/docker-compose.yml up --build
```

If missing, add those exact commands under "Standalone Runtime".

- [ ] **Step 4: Run package layout test**

Run: `cd elan-ha && bun test src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit env/docs path updates if any changed**

Run:

```bash
git add .env.example standalone/docker-compose.yml README.md AGENTS.md
git diff --cached --quiet || git commit -m "docs: clarify standalone environment paths"
```

Expected: If there were no changes, no commit is created.

## Task 10: Run Full Verification

**Files:**
- No intentional source changes.

- [ ] **Step 1: Install app dependencies from app directory**

Run: `cd elan-ha && bun install --frozen-lockfile`

Expected: PASS.

- [ ] **Step 2: Run all tests**

Run: `cd elan-ha && bun test`

Expected: PASS with all tests passing.

- [ ] **Step 3: Run typecheck**

Run: `cd elan-ha && bun run typecheck`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `cd elan-ha && bun run lint`

Expected: PASS.

- [ ] **Step 5: Run build**

Run: `cd elan-ha && bun run build`

Expected: PASS.

- [ ] **Step 6: Build Home Assistant app image**

Run: `docker build -t elan-ha-ha-app:local elan-ha`

Expected: PASS.

- [ ] **Step 7: Build standalone image**

Run: `docker build -f standalone/Dockerfile -t elan-ha-standalone:local .`

Expected: PASS.

- [ ] **Step 8: Inspect git status**

Run: `git status --short`

Expected: only intended files changed. If there are generated `elan-ha/dist/` or `elan-ha/node_modules/` files shown, update ignore rules instead of committing generated output.

- [ ] **Step 9: Final commit for any verification fixes**

If verification required fixes, commit them with:

```bash
git add <fixed-files>
git commit -m "fix: complete repository publishing verification"
```

If no fixes were needed, skip this step.

## Task 11: GitHub Remote Setup And Branch Protection

**Files:**
- No code files. GitHub repository settings only.

- [ ] **Step 1: Inspect status and recent commits before pushing**

Run:

```bash
git status --short
git log --oneline -10
```

Expected: worktree is clean except any intentional uncommitted files the user asks not to commit.

- [ ] **Step 2: Push main and set upstream**

Run only after explicit user approval to push:

```bash
git push -u origin main
```

Expected: remote `main` branch exists on GitHub.

- [ ] **Step 3: Verify GitHub Actions check names**

Run:

```bash
gh run list --limit 5
```

Expected: latest `CI` run appears. Wait for completion if needed.

- [ ] **Step 4: Enable Dependabot security updates**

Run:

```bash
gh api --method PATCH repos/arnostpleskot/elan-ha/vulnerability-alerts
```

Expected: command succeeds or reports already enabled.

- [ ] **Step 5: Protect main branch**

Run only after CI has completed at least once and exact check names are known:

```bash
gh api --method PUT repos/arnostpleskot/elan-ha/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["App checks", "Docker builds"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Expected: branch protection is enabled. If GitHub reports that contexts are invalid, query the latest check run names and rerun with the exact names.

- [ ] **Step 6: Verify branch protection**

Run:

```bash
gh api repos/arnostpleskot/elan-ha/branches/main/protection
```

Expected: output includes required status checks and force pushes disabled.

## Self-Review Notes

- Spec coverage: repository layout, separate READMEs, GHCR image reference, CI, publishing, branch protection, and deferred AppArmor are covered.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation steps remain.
- Type consistency: package test paths use `../../../` after moving under `elan-ha/src/ha-app`, and commands consistently run Bun from `elan-ha/`.
