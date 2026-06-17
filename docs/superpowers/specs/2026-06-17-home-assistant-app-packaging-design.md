# Home Assistant App Packaging Design

## Purpose

Package `elan-ha` as a headless Home Assistant Supervisor app while preserving the existing standalone Docker Compose deployment.

The app should be installable and testable locally in Home Assistant before any container publishing workflow exists. Home Assistant provides the user-facing configuration form, MQTT service credentials, lifecycle controls, and log viewer. Device visibility remains Home Assistant's normal MQTT Discovery device/entity UI.

## Current Context

- The bridge already runs as a Bun/TypeScript Docker service with Valkey in `docker-compose.yml`.
- Valkey is mandatory because BullMQ serializes all RF-003 gateway operations with worker concurrency `1`.
- RF-003 remains the durable source of truth for device inventory and state.
- The default Docker Compose Valkey is ephemeral, so restart recovery already depends on startup discovery and MQTT Discovery republishing.
- Home Assistant app docs describe apps as single Supervisor-managed containers, not Docker Compose stacks.

## Packaging Shape

Make the repository root the Home Assistant app folder so Supervisor local builds have access to the application source tree, package metadata, lockfile, and app metadata in one Docker build context:

```text
config.yaml
DOCS.md
CHANGELOG.md
run.sh
Dockerfile

standalone/
|-- Dockerfile
`-- docker-compose.yml

src/
package.json
bun.lock
README.md
```

The root `Dockerfile`, `config.yaml`, `DOCS.md`, `CHANGELOG.md`, and `run.sh` are the Home Assistant app package. The `standalone/` directory owns the non-Supervisor Docker image and Compose runtime. `standalone/docker-compose.yml` uses `context: ..` so it can build the application source while keeping standalone-specific Docker behavior separate from the Home Assistant app package.

The root `README.md` remains the repository README, not the Home Assistant app-store intro. Home Assistant app documentation lives in `DOCS.md` and `CHANGELOG.md`; the root README points users to both the Home Assistant app path and the standalone Compose path.

Do not add ingress, a web UI, or a user-facing diagnostics page in this phase. Discovered devices are exposed through MQTT Discovery and appear in Home Assistant's standard device/entity UI.

## Runtime And Storage

The Home Assistant app container runs both Valkey and the bridge process:

```text
valkey-server
  -> bind 127.0.0.1
  -> no RDB snapshots
  -> no append-only persistence

elan-ha bridge
  -> VALKEY_URL=redis://127.0.0.1:6379
  -> BullMQ worker concurrency 1
  -> MQTT from Supervisor mqtt service
  -> RF-003 from app options
```

Valkey is internal runtime/cache storage only. It must not be exposed outside the container. No Valkey password is required because it binds only to loopback inside the app container.

If the app restarts, internal Valkey state is lost. The bridge should recover the same way it does in the standalone ephemeral-Valkey runtime: enqueue startup discovery, read RF-003 inventory, rebuild the supported device registry, and republish MQTT Discovery.

Startup should fail clearly if internal Valkey cannot start or the bridge cannot connect to it. Running without BullMQ/Valkey is out of scope because it would weaken RF-003 serialization guarantees.

## Home Assistant Configuration

The Home Assistant app uses Supervisor options for RF-003 and bridge settings:

```yaml
options:
  rf003_base_url: ""
  rf003_username: ""
  rf003_password: ""
  mqtt_discovery_prefix: "homeassistant"
  mqtt_base_topic: "inels"
  poll_full_state_interval_ms: 60000
  poll_device_state_interval_ms: 300000
  log_level: "info"
```

Expected schema:

```yaml
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

Use `str` rather than `url` for `rf003_base_url` because Supervisor accepts text fields with an empty initial default for first install. The bridge runtime still validates `RF003_BASE_URL` as an `http` or `https` URL before starting.

The app package should map these options into the existing environment variables:

```text
RF003_BASE_URL
RF003_USERNAME
RF003_PASSWORD
MQTT_DISCOVERY_PREFIX
MQTT_BASE_TOPIC
POLL_FULL_STATE_INTERVAL_MS
POLL_DEVICE_STATE_INTERVAL_MS
LOG_LEVEL
VALKEY_URL
HTTP_HOST
HTTP_PORT
```

The app should set `HTTP_HOST=127.0.0.1` and `HTTP_PORT=3000` unless local testing shows Supervisor health behavior requires a different internal bind. The HTTP port is not published to users in this phase.

The standalone Compose runtime still sets `HTTP_HOST=0.0.0.0`, publishes `${APP_HTTP_PORT:-3000}:3000`, and reads `.env` as before.

## MQTT Service Integration

The Home Assistant app requires the Supervisor MQTT service:

```yaml
services:
  - mqtt:need
```

The app does not expose manual MQTT options in this phase. Manual or external MQTT remains supported through the existing standalone Docker Compose deployment path.

At startup, `run.sh` reads the MQTT service details with Bashio, for example:

```bash
MQTT_HOST="$(bashio::services mqtt "host")"
MQTT_PORT="$(bashio::services mqtt "port")"
MQTT_USERNAME="$(bashio::services mqtt "username")"
MQTT_PASSWORD="$(bashio::services mqtt "password")"
```

`run.sh` then builds `MQTT_URL`, exports `MQTT_USERNAME` and `MQTT_PASSWORD` when present, and starts the bridge. If Supervisor cannot provide MQTT service details despite `mqtt:need`, startup should fail with a clear log message.

Do not call Home Assistant Core APIs. Do not set `homeassistant_api: true` for this phase.

## Network And Security

Use normal container networking. Do not request `host_network` by default.

RF-003 access is outbound HTTP from the app container to the configured LAN URL. Home Assistant app docs do not describe a separate permission for outbound LAN access. Users should prefer an RF-003 IP address if local DNS or mDNS names do not resolve inside the app container.

The app should avoid unnecessary privileges:

- No `ingress`.
- No `webui`.
- No exposed `ports` by default.
- No `homeassistant_api`.
- No broad `hassio_api` unless implementation proves Bashio service lookup requires it.
- No `host_network` unless real Supervisor testing proves it is required.
- No `privileged`, `full_access`, `docker_api`, device mappings, USB/UART/GPIO, or host mounts.

Logs go to stdout/stderr and are visible in the Supervisor app log viewer. Sensitive options use the `password` schema where applicable and remain redacted by the bridge logger where they enter application logs.

## Local Home Assistant Testing

The app must be testable in Home Assistant before GHCR publishing exists.

Primary local test path:

1. Install SSH or Samba app on the target Home Assistant system.
2. Copy the repository root to `/addons/elan-ha` so `config.yaml`, `Dockerfile`, `run.sh`, `src/`, `package.json`, and `bun.lock` are all in the Supervisor build context.
3. Keep `image` omitted from `config.yaml` so Supervisor builds locally instead of pulling a registry image.
4. Reload local apps in Supervisor.
5. Configure RF-003 options and start the app.
6. Confirm logs show internal Valkey startup, MQTT service configuration, RF-003 discovery, and MQTT Discovery publishing.

The Home Assistant devcontainer path can also validate app metadata and Supervisor behavior, but the real HA device path is preferred for RF-003 network reachability.

## Validation Outside Home Assistant

Add lightweight local validation where possible:

- A script or test checks root `config.yaml` for required keys.
- The validation confirms `services` includes `mqtt:need`.
- The validation confirms no `ingress`, `webui`, or exposed `ports` are configured.
- The validation confirms RF-003 password uses `password` schema.
- The root Home Assistant app Dockerfile builds locally with Docker using repository root context.
- The standalone Dockerfile builds locally with Docker using repository root context.
- Option-to-environment mapping is testable if implemented in a small script/helper rather than only inline shell.

Local validation cannot replace testing under Home Assistant Supervisor because Supervisor service injection and local app installation are Supervisor behavior.

## Documentation

App documentation should include:

- Root `README.md`: repository overview, standalone Compose instructions through `standalone/docker-compose.yml`, and Home Assistant local app testing instructions.
- Root `DOCS.md`: Home Assistant app configuration fields, MQTT app requirement, RF-003 URL guidance, no-UI behavior, logs, restart rediscovery behavior, and local testing instructions.
- Root `CHANGELOG.md`: initial entry for the first Home Assistant app package.

## Out Of Scope

- GHCR publishing workflow.
- Multi-architecture release automation.
- Adding `image:` to `config.yaml` for published app installs.
- Ingress UI or diagnostics page.
- Manual MQTT mode inside the Home Assistant app.
- Direct Home Assistant Core API integration.
- Host networking unless proven necessary by Supervisor testing.
- Removing or replacing the existing standalone Docker Compose runtime.
- Duplicating the application source tree under a nested Home Assistant app directory.

## Open Follow-Up After This Phase

Once the local Home Assistant app package works on a real Supervisor installation, the next likely phase is release readiness: versioning, GHCR image publishing, multi-architecture build workflow, and repository installation documentation.
