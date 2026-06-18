import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const findRepoRoot = (startPath: string): string => {
  let currentPath = startPath;

  while (true) {
    const hasRepoMarker =
      existsSync(join(currentPath, "AGENTS.md")) || existsSync(join(currentPath, "standalone/docker-compose.yml"));

    if (hasRepoMarker) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error(`Could not find repository root from ${startPath}`);
    }
    currentPath = parentPath;
  }
};

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

const readRepoFile = (path: string): string => readFileSync(join(repoRoot, path), "utf8");

const appLocalPaths = [
  "config.yaml",
  "Dockerfile",
  "run.sh",
  "init.sh",
  "README.md",
  "DOCS.md",
  "CHANGELOG.md",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "scripts/probe-gateway.ts",
  "src/app/app.ts",
  "src/app/app.test.ts",
  "src/config/env.ts",
  "src/config/env.test.ts",
  "src/devices/registry.ts",
  "src/devices/registry.test.ts",
  "src/devices/types.ts",
  "src/gateway/client.ts",
  "src/gateway/client.test.ts",
  "src/gateway/operations.ts",
  "src/gateway/operations.test.ts",
  "src/gateway/parser.ts",
  "src/gateway/parser.test.ts",
  "src/gateway/paths.ts",
  "src/gateway/paths.test.ts",
  "src/gateway/session.ts",
  "src/gateway/session.test.ts",
  "src/gateway/types.ts",
  "src/ha-app/package.test.ts",
  "src/http/server.ts",
  "src/http/server.test.ts",
  "src/index.ts",
  "src/mqtt/client.ts",
  "src/mqtt/client.test.ts",
  "src/mqtt/discovery.ts",
  "src/mqtt/discovery.test.ts",
  "src/mqtt/state.ts",
  "src/mqtt/state.test.ts",
  "src/mqtt/topics.ts",
  "src/mqtt/topics.test.ts",
  "src/observability/logger.ts",
  "src/observability/logger.test.ts",
  "src/observability/readiness.ts",
  "src/observability/readiness.test.ts",
  "src/queue/jobs.ts",
  "src/queue/jobs.test.ts",
  "src/queue/scheduler.ts",
  "src/queue/worker.ts",
  "src/queue/worker.test.ts",
  "src/storage/keys.ts",
  "src/storage/keys.test.ts",
  "src/storage/registry.ts",
  "src/storage/registry.test.ts",
  "src/storage/valkey.ts",
];

const rootObsoleteAppPaths = appLocalPaths.filter((path) => path !== "README.md");

describe("Home Assistant app repository package", () => {
  test("contains root Home Assistant repository metadata", () => {
    const repository = readRepoFile("repository.yaml");

    expect(repository).toContain("name: eLAN RF-003 Home Assistant Apps");
    expect(repository).toContain("url: https://github.com/arnostpleskot/elan-ha");
    expect(repository).toContain("maintainer: Arnost Pleskot");
  });

  test("keeps the app package self-contained under elan-ha", () => {
    for (const path of appLocalPaths) {
      const appPath = `elan-ha/${path}`;
      expect(existsSync(join(repoRoot, appPath)), appPath).toBe(true);
    }
  });

  test("does not keep obsolete root app package files", () => {
    for (const path of rootObsoleteAppPaths) {
      expect(existsSync(join(repoRoot, path)), path).toBe(false);
    }
  });

  test("declares a headless mqtt-dependent Supervisor app with published image", () => {
    const config = readRepoFile("elan-ha/config.yaml");

    expect(config).toContain('name: "eLAN RF-003 MQTT Bridge"');
    expect(config).toContain('slug: "elan_ha"');
    expect(config).toContain('description: "Bridge iNELS RF-003 devices to Home Assistant through MQTT Discovery"');
    expect(config).toContain('version: "0.1.0"');
    expect(config).toContain("arch:\n  - aarch64\n  - amd64");
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
    expect(config).toContain('  rf003_username: ""');
    expect(config).toContain('  mqtt_discovery_prefix: "homeassistant"');
    expect(config).toContain('  mqtt_base_topic: "inels"');
    expect(config).toContain("  poll_full_state_interval_ms: 60000");
    expect(config).toContain("  poll_device_state_interval_ms: 300000");
    expect(config).toContain('  log_level: "info"');
    expect(config).toContain("  rf003_base_url: str");
    expect(config).toContain("  rf003_username: str");
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
    expect(dockerfile).not.toContain("COPY config.yaml run.sh ./");
    expect(dockerfile).toContain("io.hass.type=\"app\"");
    expect(dockerfile).toContain("apk add --no-cache ca-certificates libstdc++ valkey");
    expect(dockerfile).toContain("COPY --from=builder /app/dist ./dist");
    expect(dockerfile).toContain("COPY init.sh /init");
    expect(dockerfile).toContain("COPY run.sh /run.sh");
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
    expect(standaloneDockerfile).toContain("RUN bun test src/app src/config src/devices src/gateway src/http src/mqtt src/observability src/queue src/storage");
    expect(standaloneDockerfile).toContain("HEALTHCHECK");
    expect(standaloneDockerfile).toContain('CMD ["bun", "dist/index.js"]');
  });

  test("defines real linting separate from typecheck", () => {
    const packageJson = JSON.parse(readRepoFile("elan-ha/package.json")) as {
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts.lint).toBe("oxlint .");
    expect(packageJson.scripts.lint).not.toBe(packageJson.scripts.typecheck);
    expect(packageJson.devDependencies.oxlint).toEqual(expect.any(String));
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
    expect(rootReadme).not.toContain("The repository root is also a headless Home Assistant Supervisor app package");
    expect(rootReadme).not.toContain("copy the repository root to /addons/elan-ha");

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
