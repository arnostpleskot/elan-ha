# Home Assistant App Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally testable, headless Home Assistant Supervisor app package at the repository root while preserving standalone Docker Compose deployment under `standalone/`.

**Architecture:** The repository root becomes the Home Assistant app build context, with root `config.yaml`, `DOCS.md`, `CHANGELOG.md`, `run.sh`, and `Dockerfile`. Standalone deployment moves to `standalone/Dockerfile` and `standalone/docker-compose.yml`, using `context: ..` so it can build the same source tree. The Home Assistant app runs internal loopback-only ephemeral Valkey and consumes the Supervisor `mqtt:need` service through Bashio.

**Tech Stack:** Bun, TypeScript, Docker, Docker Compose, Home Assistant base image, Bashio, Valkey, MQTT service discovery.

---

## Current Branch State

This revised plan supersedes the earlier nested `home-assistant-app/` plan.

Already completed and retained:

- `src/config/env.ts` accepts `trace`, `debug`, `info`, `warn`, `error`, and `fatal` log levels.
- `src/config/env.test.ts` covers those log levels.

Remove or relocate earlier nested package artifacts during this revised implementation:

- Remove `home-assistant-app/` after its useful content is moved to root or standalone files.
- Update `src/ha-app/package.test.ts` so it validates the root HA app package and `standalone/` runtime instead of `home-assistant-app/`.

## File Structure

- Keep modified: `src/config/env.ts`, `src/config/env.test.ts`.
- Modify: `src/ha-app/package.test.ts` to validate root HA app files and standalone Docker files.
- Move/create: root `config.yaml`, root `Dockerfile`, root `run.sh`, root `DOCS.md`, root `CHANGELOG.md`.
- Move/create: `standalone/Dockerfile`, `standalone/docker-compose.yml`.
- Modify: `README.md` to document both deployment paths.
- Delete: `home-assistant-app/`.

## Task 1: Confirm Log Level Alignment

**Files:**
- Verify: `src/config/env.ts`
- Verify: `src/config/env.test.ts`

- [ ] **Step 1: Run config tests**

Run: `bun test src/config/env.test.ts`

Expected: PASS. The tests must include `trace` and `fatal` acceptance and `verbose` rejection.

- [ ] **Step 2: Inspect log level parser**

Confirm `src/config/env.ts` contains:

```ts
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
```

and `AppConfig["logLevel"]` includes all six values.

- [ ] **Step 3: Commit only if missing fixes were needed**

If this task required edits, commit them:

```bash
git add src/config/env.ts src/config/env.test.ts
git commit -m "fix: support all pino log levels"
```

Expected: On the current branch, no edits or commit should be needed.

## Task 2: Replace Package Contract Tests For Root HA App Layout

**Files:**
- Modify: `src/ha-app/package.test.ts`

- [ ] **Step 1: Replace the package test with the new contract**

Replace `src/ha-app/package.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("../../", import.meta.url).pathname;

const readRepoFile = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

describe("Home Assistant app package", () => {
  test("contains root Home Assistant app files", () => {
    for (const path of ["config.yaml", "Dockerfile", "run.sh", "DOCS.md", "CHANGELOG.md"]) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  test("contains standalone Docker runtime files", () => {
    for (const path of ["standalone/Dockerfile", "standalone/docker-compose.yml"]) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  test("declares a headless mqtt-dependent Supervisor app", () => {
    const config = readRepoFile("config.yaml");

    expect(config).toContain('name: "eLAN RF-003 MQTT Bridge"');
    expect(config).toContain('slug: "elan_ha"');
    expect(config).toContain('version: "0.1.0"');
    expect(config).toContain("services:\n  - mqtt:need");
    expect(config).toContain("startup: application");
    expect(config).toContain("boot: auto");

    expect(config).not.toContain("ingress:");
    expect(config).not.toContain("webui:");
    expect(config).not.toContain("ports:");
    expect(config).not.toContain("host_network:");
    expect(config).not.toContain("homeassistant_api:");
    expect(config).not.toContain("hassio_api:");
    expect(config).not.toContain("image:");
  });

  test("defines RF-003 options and password schema", () => {
    const config = readRepoFile("config.yaml");

    expect(config).toContain("options:\n  rf003_base_url: \"\"");
    expect(config).toContain('  mqtt_discovery_prefix: "homeassistant"');
    expect(config).toContain('  mqtt_base_topic: "inels"');
    expect(config).toContain("  poll_full_state_interval_ms: 60000");
    expect(config).toContain("  poll_device_state_interval_ms: 300000");
    expect(config).toContain('  log_level: "info"');
    expect(config).toContain("  rf003_password: password");
    expect(config).toContain("  log_level: list(trace|debug|info|warn|error|fatal)");
  });

  test("starts internal Valkey and maps Supervisor configuration in run.sh", () => {
    const runScript = readRepoFile("run.sh");

    expect(runScript).toContain("#!/usr/bin/with-contenv bashio");
    expect(runScript).toContain('valkey-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no');
    expect(runScript).toContain('export VALKEY_URL="redis://127.0.0.1:6379"');
    expect(runScript).toContain('bashio::services mqtt "host"');
    expect(runScript).toContain('bashio::services mqtt "port"');
    expect(runScript).toContain('bashio::services mqtt "username"');
    expect(runScript).toContain('bashio::services mqtt "password"');
    expect(runScript).toContain('export RF003_BASE_URL="$(bashio::config \'rf003_base_url\')"');
    expect(runScript).toContain('export HTTP_HOST="127.0.0.1"');
    expect(runScript).toContain('export HTTP_PORT="3000"');
    expect(runScript).toContain("bun /app/dist/index.js");
  });

  test("builds the Home Assistant app from the repository root", () => {
    const dockerfile = readRepoFile("Dockerfile");

    expect(dockerfile).toContain("FROM oven/bun:1.3.11-alpine AS deps");
    expect(dockerfile).toContain("FROM ghcr.io/home-assistant/base:3.22");
    expect(dockerfile).toContain("COPY src ./src");
    expect(dockerfile).toContain("COPY config.yaml DOCS.md CHANGELOG.md run.sh ./");
    expect(dockerfile).toContain("io.hass.type=\"app\"");
    expect(dockerfile).toContain("apk add --no-cache ca-certificates libstdc++ valkey");
    expect(dockerfile).toContain("COPY --from=builder /app/dist ./dist");
    expect(dockerfile).toContain('CMD ["/run.sh"]');
  });

  test("keeps standalone Docker Compose separate from the HA app", () => {
    const compose = readRepoFile("standalone/docker-compose.yml");
    const standaloneDockerfile = readRepoFile("standalone/Dockerfile");

    expect(compose).toContain("context: ..");
    expect(compose).toContain("dockerfile: standalone/Dockerfile");
    expect(compose).toContain("VALKEY_URL: ${VALKEY_URL:-redis://valkey:6379}");
    expect(compose).toContain('"${APP_HTTP_PORT:-3000}:3000"');
    expect(standaloneDockerfile).toContain("FROM oven/bun:1.3.11-alpine AS deps");
    expect(standaloneDockerfile).toContain("HEALTHCHECK");
    expect(standaloneDockerfile).toContain('CMD ["bun", "dist/index.js"]');
  });

  test("documents local installation, MQTT dependency, logs, and restart behavior", () => {
    const readme = readRepoFile("README.md");
    const docs = readRepoFile("DOCS.md");
    const changelog = readRepoFile("CHANGELOG.md");

    expect(readme).toContain("standalone/docker-compose.yml");
    expect(readme).toContain("/addons/elan-ha");
    expect(readme).toContain("MQTT Discovery");

    expect(docs).toContain("MQTT app is required");
    expect(docs).toContain("/addons/elan-ha");
    expect(docs).toContain("Use the RF-003 IP address");
    expect(docs).toContain("Supervisor logs");
    expect(docs).toContain("republishes MQTT Discovery");

    expect(changelog).toContain("## 0.1.0");
    expect(changelog).toContain("Initial local Home Assistant app package");
  });

  test("does not keep the obsolete nested app package", () => {
    expect(existsSync(join(repoRoot, "home-assistant-app"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the package test to verify it fails**

Run: `bun test src/ha-app/package.test.ts`

Expected: FAIL because root HA app files and `standalone/` files do not yet match this contract.

- [ ] **Step 3: Commit the revised failing contract**

Run:

```bash
git add src/ha-app/package.test.ts
git commit -m "test: revise ha app packaging contract"
```

Expected: commit succeeds.

## Task 3: Move Standalone Runtime Under `standalone/`

**Files:**
- Move: `Dockerfile` to `standalone/Dockerfile`
- Move: `docker-compose.yml` to `standalone/docker-compose.yml`

- [ ] **Step 1: Create `standalone/` and move files**

Move the current standalone files:

```bash
mkdir -p standalone
git mv Dockerfile standalone/Dockerfile
git mv docker-compose.yml standalone/docker-compose.yml
```

- [ ] **Step 2: Update Compose build path**

In `standalone/docker-compose.yml`, change:

```yaml
    build:
      context: .
```

to:

```yaml
    build:
      context: ..
      dockerfile: standalone/Dockerfile
```

Keep the existing `env_file`, `environment`, `ports`, `depends_on`, and Valkey service behavior unchanged.

- [ ] **Step 3: Run package test and observe remaining failures**

Run: `bun test src/ha-app/package.test.ts`

Expected: FAIL because root HA app files are still missing, but standalone-specific assertions should pass.

- [ ] **Step 4: Commit standalone move**

Run:

```bash
git add standalone/Dockerfile standalone/docker-compose.yml Dockerfile docker-compose.yml src/ha-app/package.test.ts
git commit -m "chore: move standalone docker runtime"
```

Expected: commit succeeds.

## Task 4: Add Root Home Assistant App Runtime Files

**Files:**
- Create: `config.yaml`
- Create: `Dockerfile`
- Create: `run.sh`
- Delete: `home-assistant-app/config.yaml`
- Delete: `home-assistant-app/Dockerfile`
- Delete: `home-assistant-app/run.sh`

- [ ] **Step 1: Create root `config.yaml`**

Create root `config.yaml`:

```yaml
name: "eLAN RF-003 MQTT Bridge"
version: "0.1.0"
slug: "elan_ha"
description: "Bridge iNELS RF-003 devices to Home Assistant through MQTT Discovery"
url: "https://github.com/arnostpleskot/elan-ha"
arch:
  - aarch64
  - amd64
startup: application
boot: auto
services:
  - mqtt:need
options:
  rf003_base_url: ""
  rf003_username: ""
  rf003_password: ""
  mqtt_discovery_prefix: "homeassistant"
  mqtt_base_topic: "inels"
  poll_full_state_interval_ms: 60000
  poll_device_state_interval_ms: 300000
  log_level: "info"
schema:
  rf003_base_url: str
  rf003_username: str
  rf003_password: password
  mqtt_discovery_prefix: str
  mqtt_base_topic: str
  poll_full_state_interval_ms: int
  poll_device_state_interval_ms: int
  log_level: list(trace|debug|info|warn|error|fatal)
```

Use `str` here so Supervisor accepts the empty first-install default. The bridge runtime still validates `RF003_BASE_URL` as an `http` or `https` URL before starting.

- [ ] **Step 2: Create root Home Assistant `Dockerfile`**

Create root `Dockerfile`:

```dockerfile
FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY config.yaml DOCS.md CHANGELOG.md run.sh ./

RUN bun test
RUN bun run typecheck
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
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
```

- [ ] **Step 3: Create root `run.sh`**

Create root `run.sh`:

```bash
#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -euo pipefail

CONFIG_PATH=/data/options.json

bashio::log.info "Starting internal Valkey"
valkey-server --bind 127.0.0.1 --port 6379 --save "" --appendonly no &
VALKEY_PID="$!"

cleanup() {
  if kill -0 "${VALKEY_PID}" 2>/dev/null; then
    kill "${VALKEY_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

for attempt in $(seq 1 50); do
  if valkey-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
    bashio::log.info "Internal Valkey is ready"
    break
  fi

  if [ "${attempt}" = "50" ]; then
    bashio::log.fatal "Internal Valkey did not become ready"
    exit 1
  fi

  sleep 0.1
done

MQTT_HOST="$(bashio::services mqtt "host")"
MQTT_PORT="$(bashio::services mqtt "port")"
MQTT_USERNAME_VALUE="$(bashio::services mqtt "username")"
MQTT_PASSWORD_VALUE="$(bashio::services mqtt "password")"

export RF003_BASE_URL="$(bashio::config 'rf003_base_url')"
export RF003_USERNAME="$(bashio::config 'rf003_username')"
export RF003_PASSWORD="$(bashio::config 'rf003_password')"
export MQTT_URL="mqtt://${MQTT_HOST}:${MQTT_PORT}"
export MQTT_DISCOVERY_PREFIX="$(bashio::config 'mqtt_discovery_prefix')"
export MQTT_BASE_TOPIC="$(bashio::config 'mqtt_base_topic')"
export POLL_FULL_STATE_INTERVAL_MS="$(bashio::config 'poll_full_state_interval_ms')"
export POLL_DEVICE_STATE_INTERVAL_MS="$(bashio::config 'poll_device_state_interval_ms')"
export LOG_LEVEL="$(bashio::config 'log_level')"
export VALKEY_URL="redis://127.0.0.1:6379"
export HTTP_HOST="127.0.0.1"
export HTTP_PORT="3000"

if [ -n "${MQTT_USERNAME_VALUE}" ]; then
  export MQTT_USERNAME="${MQTT_USERNAME_VALUE}"
fi

if [ -n "${MQTT_PASSWORD_VALUE}" ]; then
  export MQTT_PASSWORD="${MQTT_PASSWORD_VALUE}"
fi

bashio::log.info "Starting eLAN RF-003 MQTT bridge"
bun /app/dist/index.js &
APP_PID="$!"

wait -n "${APP_PID}" "${VALKEY_PID}"
EXIT_CODE="$?"

cleanup
exit "${EXIT_CODE}"
```

- [ ] **Step 4: Remove obsolete nested runtime files**

Run:

```bash
git rm -r home-assistant-app
```

Expected: removes obsolete nested package files. If the directory is already gone, no action is needed.

- [ ] **Step 5: Run package tests**

Run: `bun test src/ha-app/package.test.ts`

Expected: FAIL only for missing root docs content if `DOCS.md` or `CHANGELOG.md` are not ready yet.

- [ ] **Step 6: Commit HA runtime files**

Run:

```bash
git add config.yaml Dockerfile run.sh home-assistant-app src/ha-app/package.test.ts
git commit -m "feat: add root home assistant app runtime"
```

Expected: commit succeeds.

## Task 5: Add Root Home Assistant App Documentation

**Files:**
- Create: `DOCS.md`
- Create: `CHANGELOG.md`
- Modify: `README.md`
- Delete or absorb: `home-assistant-app/README.md`, `home-assistant-app/DOCS.md`, `home-assistant-app/CHANGELOG.md`

- [ ] **Step 1: Create root `DOCS.md`**

Create root `DOCS.md`:

```markdown
# eLAN RF-003 MQTT Bridge Documentation

## Requirements

- Home Assistant Supervisor.
- The Home Assistant MQTT app is required and must be configured before this app starts.
- RF-003 gateway reachable from the Home Assistant app container.

## Configuration

| Option | Description |
| --- | --- |
| `rf003_base_url` | RF-003 gateway URL, for example `http://192.168.1.50`. |
| `rf003_username` | RF-003 username. |
| `rf003_password` | RF-003 password. |
| `mqtt_discovery_prefix` | MQTT Discovery prefix. Keep `homeassistant` unless your Home Assistant MQTT integration uses a different prefix. |
| `mqtt_base_topic` | Bridge MQTT state and command base topic. Default: `inels`. |
| `poll_full_state_interval_ms` | Full state poll interval in milliseconds. Default: `60000`. |
| `poll_device_state_interval_ms` | Per-device state poll interval in milliseconds. Default: `300000`. |
| `log_level` | Bridge log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. |

The app reads MQTT host, port, username, and password from the Supervisor MQTT service. Manual MQTT broker configuration is available through the standalone Docker Compose deployment, not this Home Assistant app package.

## Local Installation Before Publishing

1. Install the SSH or Samba app on the Home Assistant system.
2. Copy the repository root to `/addons/elan-ha` so `config.yaml`, `Dockerfile`, `run.sh`, `src/`, `package.json`, and `bun.lock` are all present.
3. Reload local apps in Supervisor.
4. Configure the RF-003 options.
5. Start the app.

The app package intentionally omits `image:` in `config.yaml` so Supervisor builds it locally while the package is not yet published to a container registry.

## RF-003 Network Access

Use the RF-003 IP address if local DNS or mDNS names do not resolve from inside the app container. For example, prefer `http://192.168.1.50` over `http://rf003.local` when troubleshooting startup connectivity.

## Logs And Diagnostics

Diagnostics are written to stdout/stderr and are visible in Supervisor logs. Use `debug` or `trace` log level only while troubleshooting because these levels include sanitized RF-003 and MQTT boundary details.

Discovered devices are exposed through MQTT Discovery and appear in Home Assistant's normal device and entity UI. The app does not provide an ingress UI or separate device list page.

## Restart Behavior

The app runs an internal ephemeral Valkey instance for BullMQ and runtime cache. Valkey is not persisted. After restart, the bridge reads RF-003 again, rebuilds its supported device registry, and republishes MQTT Discovery. Home Assistant entity remapping should not be required as long as RF-003 device identities remain stable.
```

- [ ] **Step 2: Create root `CHANGELOG.md`**

Create root `CHANGELOG.md`:

```markdown
# Changelog

## 0.1.0

- Initial local Home Assistant app package.
- Runs internal ephemeral Valkey for BullMQ serialization.
- Uses Home Assistant Supervisor MQTT service credentials.
- Exposes RF-003 devices through MQTT Discovery without an ingress UI.
```

- [ ] **Step 3: Update root README deployment sections**

In `README.md`, update Docker commands to reference standalone Compose:

```bash
docker compose -f standalone/docker-compose.yml up --build
docker compose -f standalone/docker-compose.yml down
```

Add or update the Home Assistant app section so it says:

```markdown
## Home Assistant App Package

The repository root is also a headless Home Assistant Supervisor app package for local testing before published images exist.

The app uses Home Assistant's MQTT service, reads RF-003 settings from the Supervisor configuration form, runs an internal ephemeral Valkey instance for BullMQ, and exposes devices through MQTT Discovery. It does not provide an ingress UI.

For local testing, copy the repository root to `/addons/elan-ha` on a Home Assistant system, reload local apps in Supervisor, configure the RF-003 options, and start the app.

The standalone Docker Compose deployment remains available through `standalone/docker-compose.yml` for non-Supervisor environments and manual MQTT broker configuration.
```

- [ ] **Step 4: Run package tests**

Run: `bun test src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit documentation**

Run:

```bash
git add DOCS.md CHANGELOG.md README.md src/ha-app/package.test.ts home-assistant-app
git commit -m "docs: document root home assistant app package"
```

Expected: commit succeeds.

## Task 6: Verify Full Revised Packaging

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused package tests**

Run: `bun test src/config/env.test.ts src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 4: Build Home Assistant app image**

Run: `docker build -t elan-ha-ha-app:local .`

Expected: Docker build completes successfully.

- [ ] **Step 5: Build standalone image**

Run: `docker build -f standalone/Dockerfile -t elan-ha-standalone:local .`

Expected: Docker build completes successfully.

- [ ] **Step 6: Validate standalone Compose config**

Run: `docker compose -f standalone/docker-compose.yml config`

Expected: Compose config renders successfully and includes app and Valkey services.

- [ ] **Step 7: Run production Bun build**

Run: `bun run build`

Expected: PASS and `dist/index.js` is produced.

- [ ] **Step 8: Stop on verification failures**

If any verification command fails, stop execution and report the exact failing command and error output before making additional changes. Do not guess at fixes during final verification.

Expected: no source edits or commits are needed if all verification commands pass.

## Self-Review

- Spec coverage: The plan implements the revised root Home Assistant app package, standalone runtime directory, MQTT service dependency, internal Valkey, local HA testing docs, and no UI/ingress/security expansion.
- Standalone preservation: Existing Compose behavior is preserved under `standalone/docker-compose.yml` with `context: ..` and the old standalone Dockerfile moved to `standalone/Dockerfile`.
- Local HA buildability: Root `Dockerfile` can access `src/`, `package.json`, `bun.lock`, `config.yaml`, `DOCS.md`, `CHANGELOG.md`, and `run.sh` in one build context.
- Out of scope preserved: No GHCR workflow, `image:`, ingress, manual HA-app MQTT mode, Home Assistant Core API integration, or host networking is added.
