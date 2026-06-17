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

Add a Home Assistant app folder beside the existing standalone runtime:

```text
home-assistant-app/
|-- config.yaml
|-- DOCS.md
|-- README.md
|-- CHANGELOG.md
|-- Dockerfile
`-- run.sh
```

The root `Dockerfile`, `docker-compose.yml`, and `.env` path remain the standalone deployment path. The Home Assistant app folder owns Supervisor metadata, option schema, user documentation, and startup translation from `/data/options.json` plus Supervisor services into bridge environment variables.

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
  rf003_base_url: url
  rf003_username: str
  rf003_password: password
  mqtt_discovery_prefix: str
  mqtt_base_topic: str
  poll_full_state_interval_ms: int
  poll_device_state_interval_ms: int
  log_level: list(trace|debug|info|warn|error|fatal)
```

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
2. Copy `home-assistant-app/` to `/addons/elan-ha`.
3. Keep `image` omitted or commented out in `config.yaml` so Supervisor builds locally instead of pulling a registry image.
4. Reload local apps in Supervisor.
5. Configure RF-003 options and start the app.
6. Confirm logs show internal Valkey startup, MQTT service configuration, RF-003 discovery, and MQTT Discovery publishing.

The Home Assistant devcontainer path can also validate app metadata and Supervisor behavior, but the real HA device path is preferred for RF-003 network reachability.

## Validation Outside Home Assistant

Add lightweight local validation where possible:

- A script or test checks `home-assistant-app/config.yaml` for required keys.
- The validation confirms `services` includes `mqtt:need`.
- The validation confirms no `ingress`, `webui`, or exposed `ports` are configured.
- The validation confirms RF-003 password uses `password` schema.
- The app Dockerfile builds locally with Docker.
- Option-to-environment mapping is testable if implemented in a small script/helper rather than only inline shell.

Local validation cannot replace testing under Home Assistant Supervisor because Supervisor service injection and local app installation are Supervisor behavior.

## Documentation

App documentation should include:

- `home-assistant-app/README.md`: short app-store style introduction.
- `home-assistant-app/DOCS.md`: configuration fields, MQTT app requirement, RF-003 URL guidance, no-UI behavior, logs, restart rediscovery behavior, and local testing instructions.
- `home-assistant-app/CHANGELOG.md`: initial entry for the first app package.
- Root `README.md`: short section pointing to the Home Assistant app package while preserving Docker Compose as the standalone deployment path.

## Out Of Scope

- GHCR publishing workflow.
- Multi-architecture release automation.
- Adding `image:` to `config.yaml` for published app installs.
- Ingress UI or diagnostics page.
- Manual MQTT mode inside the Home Assistant app.
- Direct Home Assistant Core API integration.
- Host networking unless proven necessary by Supervisor testing.
- Removing or replacing the existing standalone Docker Compose runtime.

## Open Follow-Up After This Phase

Once the local Home Assistant app package works on a real Supervisor installation, the next likely phase is release readiness: versioning, GHCR image publishing, multi-architecture build workflow, and repository installation documentation.
