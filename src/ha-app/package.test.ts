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
