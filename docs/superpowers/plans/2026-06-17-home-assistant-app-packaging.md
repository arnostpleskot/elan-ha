# Home Assistant App Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally testable, headless Home Assistant Supervisor app package for `elan-ha` while preserving the existing standalone Docker Compose deployment.

**Architecture:** Add a `home-assistant-app/` packaging folder that builds the existing bridge into a Supervisor app container. The app container runs an internal loopback-only ephemeral Valkey process plus the bridge, reads RF-003 settings from `/data/options.json`, and reads MQTT service credentials from Home Assistant's `mqtt:need` service via Bashio. Existing root Docker Compose remains the manual/standalone deployment path.

**Tech Stack:** Bun, TypeScript, Docker, Home Assistant base image, Bashio, Valkey, MQTT service discovery.

---

## File Structure

- Modify `src/config/env.ts`: extend accepted log levels to include Pino's `trace` and `fatal`, matching the Home Assistant app option schema.
- Modify `src/config/env.test.ts`: add failing coverage for `trace` and `fatal` log levels.
- Create `src/ha-app/package.test.ts`: static validation for the Home Assistant app package files and security posture.
- Create `home-assistant-app/config.yaml`: Supervisor app metadata, options, schema, and `mqtt:need` service declaration.
- Create `home-assistant-app/Dockerfile`: local-buildable Supervisor app image that includes Bun runtime, production dependencies, built app, Valkey, and `run.sh`.
- Create `home-assistant-app/run.sh`: Bashio startup script that starts internal Valkey, maps Supervisor options/services to environment variables, and starts the bridge.
- Create `home-assistant-app/README.md`: short app-store style introduction.
- Create `home-assistant-app/DOCS.md`: user configuration, local testing, logs, MQTT service, RF-003 URL, and restart behavior documentation.
- Create `home-assistant-app/CHANGELOG.md`: initial app package changelog.
- Modify `README.md`: add a short Home Assistant app packaging section while preserving Docker Compose as standalone deployment.

## Task 1: Align Log Level Parsing With App Schema

**Files:**
- Modify: `src/config/env.test.ts`
- Modify: `src/config/env.ts`

- [ ] **Step 1: Add failing tests for `trace` and `fatal` log levels**

Append these tests inside the existing `describe("parseEnv", () => { ... })` block in `src/config/env.test.ts`:

```ts
  test("accepts trace and fatal log levels", () => {
    const baseEnv = {
      RF003_BASE_URL: "http://rf003.local",
      RF003_USERNAME: "admin",
      RF003_PASSWORD: "secret",
      MQTT_URL: "mqtt://mosquitto.local:1883",
      VALKEY_URL: "redis://valkey.local:6379",
    };

    expect(parseEnv({ ...baseEnv, LOG_LEVEL: "trace" }).logLevel).toBe("trace");
    expect(parseEnv({ ...baseEnv, LOG_LEVEL: "fatal" }).logLevel).toBe("fatal");
  });

  test("rejects unsupported log levels", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        LOG_LEVEL: "verbose",
      }),
    ).toThrow("LOG_LEVEL must be one of trace, debug, info, warn, error, fatal");
  });
```

- [ ] **Step 2: Run the focused config tests to verify they fail**

Run: `bun test src/config/env.test.ts`

Expected: FAIL because `trace` and `fatal` are rejected, and the old error message does not include them.

- [ ] **Step 3: Extend the exported config type**

In `src/config/env.ts`, change the `logLevel` type from:

```ts
  logLevel: "debug" | "info" | "warn" | "error";
```

to:

```ts
  logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
```

- [ ] **Step 4: Extend `parseLogLevel`**

Replace the current `parseLogLevel` implementation in `src/config/env.ts` with:

```ts
const logLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

const parseLogLevel = (value: string | undefined): AppConfig["logLevel"] => {
  if (!value) {
    return "info";
  }

  if (logLevels.includes(value as AppConfig["logLevel"])) {
    return value as AppConfig["logLevel"];
  }

  throw new Error(`LOG_LEVEL must be one of ${logLevels.join(", ")}`);
};
```

- [ ] **Step 5: Run config tests to verify they pass**

Run: `bun test src/config/env.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit log level alignment**

Run:

```bash
git add src/config/env.ts src/config/env.test.ts
git commit -m "fix: support all pino log levels"
```

Expected: commit succeeds.

## Task 2: Add Static Validation For The Home Assistant App Package

**Files:**
- Create: `src/ha-app/package.test.ts`

- [ ] **Step 1: Create the failing package validation test**

Create `src/ha-app/package.test.ts` with this content:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = new URL("../../", import.meta.url).pathname;
const appDir = join(repoRoot, "home-assistant-app");

const readAppFile = (path: string): string => readFileSync(join(appDir, path), "utf8");

describe("Home Assistant app package", () => {
  test("contains the required app files", () => {
    for (const path of ["config.yaml", "Dockerfile", "run.sh", "README.md", "DOCS.md", "CHANGELOG.md"]) {
      expect(existsSync(join(appDir, path))).toBe(true);
    }
  });

  test("declares a headless mqtt-dependent Supervisor app", () => {
    const config = readAppFile("config.yaml");

    expect(config).toContain('name: "eLAN RF-003 MQTT Bridge"');
    expect(config).toContain('slug: "elan_ha"');
    expect(config).toContain("version: \"0.1.0\"");
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
    const config = readAppFile("config.yaml");

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
    const runScript = readAppFile("run.sh");

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

  test("builds from a Home Assistant base image and installs Valkey", () => {
    const dockerfile = readAppFile("Dockerfile");

    expect(dockerfile).toContain("FROM oven/bun:1.3.11-alpine AS deps");
    expect(dockerfile).toContain("FROM ghcr.io/home-assistant/base:3.22");
    expect(dockerfile).toContain("io.hass.type=\"app\"");
    expect(dockerfile).toContain("apk add --no-cache ca-certificates libstdc++ valkey");
    expect(dockerfile).toContain("COPY --from=builder /app/dist ./dist");
    expect(dockerfile).toContain('CMD ["/run.sh"]');
  });
});
```

- [ ] **Step 2: Run the package test to verify it fails**

Run: `bun test src/ha-app/package.test.ts`

Expected: FAIL because `home-assistant-app/` and its files do not exist yet.

- [ ] **Step 3: Commit the failing validation test**

Run:

```bash
git add src/ha-app/package.test.ts
git commit -m "test: define home assistant app package contract"
```

Expected: commit succeeds with a failing test committed intentionally for the next task's TDD cycle.

## Task 3: Add Home Assistant App Metadata And Runtime Files

**Files:**
- Create: `home-assistant-app/config.yaml`
- Create: `home-assistant-app/Dockerfile`
- Create: `home-assistant-app/run.sh`

- [ ] **Step 1: Create `config.yaml`**

Create `home-assistant-app/config.yaml` with this content:

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
  rf003_base_url: url
  rf003_username: str
  rf003_password: password
  mqtt_discovery_prefix: str
  mqtt_base_topic: str
  poll_full_state_interval_ms: int
  poll_device_state_interval_ms: int
  log_level: list(trace|debug|info|warn|error|fatal)
```

- [ ] **Step 2: Create the Home Assistant app Dockerfile**

Create `home-assistant-app/Dockerfile` with this content:

```dockerfile
FROM oven/bun:1.3.11-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

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
COPY home-assistant-app/run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
```

- [ ] **Step 3: Create the startup script**

Create `home-assistant-app/run.sh` with this content:

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

- [ ] **Step 4: Run package validation tests**

Run: `bun test src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 5: Run focused typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit app metadata and runtime files**

Run:

```bash
git add home-assistant-app/config.yaml home-assistant-app/Dockerfile home-assistant-app/run.sh
git commit -m "feat: add home assistant app runtime"
```

Expected: commit succeeds.

## Task 4: Add Home Assistant App Documentation

**Files:**
- Create: `home-assistant-app/README.md`
- Create: `home-assistant-app/DOCS.md`
- Create: `home-assistant-app/CHANGELOG.md`
- Modify: `README.md`
- Modify: `src/ha-app/package.test.ts`

- [ ] **Step 1: Extend validation tests for required documentation content**

Append this test inside the `describe("Home Assistant app package", () => { ... })` block in `src/ha-app/package.test.ts`:

```ts
  test("documents local installation, MQTT dependency, logs, and restart behavior", () => {
    const readme = readAppFile("README.md");
    const docs = readAppFile("DOCS.md");
    const changelog = readAppFile("CHANGELOG.md");

    expect(readme).toContain("iNELS RF-003");
    expect(readme).toContain("MQTT Discovery");

    expect(docs).toContain("MQTT app is required");
    expect(docs).toContain("/addons/elan-ha");
    expect(docs).toContain("Use the RF-003 IP address");
    expect(docs).toContain("Supervisor logs");
    expect(docs).toContain("republishes MQTT Discovery");

    expect(changelog).toContain("## 0.1.0");
    expect(changelog).toContain("Initial local Home Assistant app package");
  });
```

- [ ] **Step 2: Run package validation tests to verify they fail**

Run: `bun test src/ha-app/package.test.ts`

Expected: FAIL because documentation files are missing or empty.

- [ ] **Step 3: Create app README**

Create `home-assistant-app/README.md` with this content:

```markdown
# eLAN RF-003 MQTT Bridge

Bridge an existing iNELS RF installation exposed by an RF-003 gateway into Home Assistant through MQTT Discovery.

The app discovers supported RF-003 devices, publishes retained MQTT Discovery payloads, mirrors RF-003 state to MQTT, and sends Home Assistant MQTT commands back to RF-003 through a serialized BullMQ worker.

Devices appear in Home Assistant through the normal MQTT device and entity UI. This app does not provide an ingress UI.
```

- [ ] **Step 4: Create app docs**

Create `home-assistant-app/DOCS.md` with this content:

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
2. Copy this app folder to `/addons/elan-ha`.
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

- [ ] **Step 5: Create app changelog**

Create `home-assistant-app/CHANGELOG.md` with this content:

```markdown
# Changelog

## 0.1.0

- Initial local Home Assistant app package.
- Runs internal ephemeral Valkey for BullMQ serialization.
- Uses Home Assistant Supervisor MQTT service credentials.
- Exposes RF-003 devices through MQTT Discovery without an ingress UI.
```

- [ ] **Step 6: Add root README section**

In `README.md`, after the Docker Runtime section and before `## MQTT Topics`, add:

```markdown
## Home Assistant App Package

This repository also contains a headless Home Assistant Supervisor app package in `home-assistant-app/`.

The app package is for local Supervisor testing before published images exist. It uses Home Assistant's MQTT service, reads RF-003 settings from the Supervisor configuration form, runs an internal ephemeral Valkey instance for BullMQ, and exposes devices through MQTT Discovery. It does not provide an ingress UI.

For local testing, copy `home-assistant-app/` to `/addons/elan-ha` on a Home Assistant system, reload local apps in Supervisor, configure the RF-003 options, and start the app.

The existing `docker-compose.yml` remains the standalone deployment path for non-Supervisor environments and for manual MQTT broker configuration.
```

- [ ] **Step 7: Run package validation tests**

Run: `bun test src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit documentation**

Run:

```bash
git add home-assistant-app/README.md home-assistant-app/DOCS.md home-assistant-app/CHANGELOG.md README.md src/ha-app/package.test.ts
git commit -m "docs: document home assistant app package"
```

Expected: commit succeeds.

## Task 5: Verify Docker Build And Full Project Checks

**Files:**
- No source edits expected unless verification exposes a defect.

- [ ] **Step 1: Run focused app package tests**

Run: `bun test src/config/env.test.ts src/ha-app/package.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `bun test`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 4: Run root Docker build**

Run: `docker build -t elan-ha:local .`

Expected: Docker build completes successfully.

- [ ] **Step 5: Run Home Assistant app Docker build**

Run: `docker build -f home-assistant-app/Dockerfile -t elan-ha-ha-app:local .`

Expected: Docker build completes successfully.

- [ ] **Step 6: Run production build**

Run: `bun run build`

Expected: PASS and `dist/index.js` is produced.

- [ ] **Step 7: Stop on verification failures**

If any verification command fails, stop execution and report the exact failing command and error output before making additional changes. Do not guess at fixes during final verification.

Expected: no source edits or commits are needed if all verification commands pass.

## Self-Review

- Spec coverage: Tasks 2 through 4 create the app folder, metadata, runtime, docs, and local testing instructions. Task 3 covers internal Valkey, `mqtt:need`, Bashio service lookup, normal networking, and no exposed UI/ports. Task 5 covers local Docker validation.
- Log-level consistency: Task 1 aligns the app schema's `trace|debug|info|warn|error|fatal` values with `parseEnv` before the app exposes them.
- Standalone Docker preservation: No task modifies `docker-compose.yml` or removes root Docker behavior; README explicitly keeps it as the standalone path.
- Out of scope preserved: No ingress, web UI, manual HA-app MQTT mode, GHCR workflow, host networking, or Home Assistant Core API access is added.
