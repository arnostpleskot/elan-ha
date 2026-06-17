# elan-ha

> iNELS RF-003 to MQTT bridge for Home Assistant

`elan-ha` connects an existing iNELS RF installation to Home Assistant without replacing hardware or installing a custom Home Assistant integration. It talks to the RF-003 gateway over its HTTP API, serializes all gateway operations through BullMQ, and exposes supported devices through Home Assistant MQTT Discovery.

## Features

- Discovers supported devices from the RF-003 gateway
- Publishes Home Assistant MQTT Discovery entities for switches, on/off lights, dimmable lights, and fans
- Mirrors RF-003 state to MQTT state topics
- Accepts MQTT commands and writes them back to RF-003
- Serializes all RF-003 access through a BullMQ worker with concurrency `1`
- Stores runtime/cache device registry and bridge metadata in Valkey
- Provides operational HTTP endpoints for health, readiness, devices, and forced discovery
- Runs locally with Bun or in Docker Compose with Valkey

> [!IMPORTANT]
> RF-003 is the source of truth. The bridge only exposes devices returned by RF-003 discovery and classified as supported entities.

## Architecture

```text
RF-003
    -> HTTP API
elan-ha (Bun + TypeScript)
    -> BullMQ + Valkey
    -> MQTT Discovery, state, commands
MQTT broker
    -> Home Assistant
```

All RF-003 communication goes through the gateway queue:

```text
MQTT commands
Poll jobs
Discovery jobs
        -> BullMQ queue
        -> Worker concurrency = 1
        -> RF-003 gateway
```

This avoids RF gateway overload, cookie/session races, and overlapping RF transmissions.

## Supported Devices

The bridge supports RF-003-discovered outputs that expose one of the action/state shapes below.

| RF-003 product/type | Required RF-003 shape | Home Assistant entity | MQTT payload |
| --- | --- | --- |
| RFSA-66M or compatible relay output with RF-003 type `light` or `lamp` | Primary action `on`, action info `on.type = bool`, state `on = true/false` | On/off light | `ON` / `OFF` |
| RFSA-66M or compatible relay output with RF-003 type `ventilation` | Primary action `on`, action info `on.type = bool`, state `on = true/false` | Fan | `ON` / `OFF` |
| Relay-like output with unknown or missing RF-003 type | Primary action `on`, action info `on.type = bool`, state `on = true/false` | Switch | `ON` / `OFF` |
| RFDA-71B or compatible dimmer with RF-003 type `dimmed light`, `light`, `lamp`, unknown, or missing | Primary action `brightness`, action info `brightness.type = int`, state `brightness = number/null` | Dimmable light | JSON state with RF-003-native brightness scale, currently `0-100` |

Unsupported RF-003 devices are ignored until support is implemented.

### Adding Support For More RF-003 Devices

If RF-003 exposes a device that the bridge logs as unsupported, [open a GitHub issue](https://github.com/arnostpleskot/elan-ha/issues/new/choose) with the unsupported-device warning from startup or forced discovery.

To produce the log entry:

```bash
curl -X POST http://localhost:3000/discovery/force
```

Then collect the log line with this message:

```text
unsupported gateway device ignored
```

The warning includes `deviceId`, the full sanitized RF-003 detail payload from `GET /api/devices/:id`, and the state payload from `GET /api/devices/:id/state`. That should include the device type, product type, actions info, primary actions, secondary actions when RF-003 provides them, settings, and any unusual state shape needed to design support.

Before sharing logs, remove local hostnames/IP addresses, credentials, cookies, and any room/device names you do not want public. Do not include `.env` contents.

## Requirements

- [Bun](https://bun.sh/) for local development
- Docker and Docker Compose for the bundled runtime
- RF-003 gateway reachable from the bridge
- MQTT broker reachable from the bridge and Home Assistant
- Valkey or Redis-compatible server
- Home Assistant with MQTT integration enabled

## Quick Start

1. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your RF-003 and MQTT settings:

   ```dotenv
   RF003_BASE_URL=http://rf003.local
   RF003_USERNAME=admin
   RF003_PASSWORD=change-me

   MQTT_URL=mqtt://mosquitto.local:1883
   MQTT_DISCOVERY_PREFIX=homeassistant
   MQTT_BASE_TOPIC=inels
   ```

3. Start the standalone runtime:

   ```bash
   docker compose -f standalone/docker-compose.yml up --build
   ```

4. Check the bridge:

   ```bash
   curl http://localhost:3000/healthz
   curl http://localhost:3000/readyz
   ```

Home Assistant should discover supported RF-003 devices through MQTT Discovery after the bridge starts and completes discovery.

## Device Lifecycle

RF-003 remains the source of truth for device inventory and state. The bridge keeps a runtime/cache registry in Valkey so command routing and polling can use the last discovered supported devices.

Discovery runs in these cases:

- On bridge startup, the app queues `discovery.force` once.
- When `POST /discovery/force` is called, the app queues `discovery.force` on demand.

Discovery does not currently run on a periodic timer. Periodic jobs poll state for the already discovered registry; they do not search RF-003 for new devices.

When discovery runs, the bridge:

1. Reads the RF-003 device list.
2. Reads each RF-003 device detail and initial state through the serialized gateway queue.
3. Classifies supported devices as Home Assistant switches, lights, dimmable lights, or fans.
4. Saves the supported registry in Valkey.
5. Clears retained MQTT Discovery configs for stale entities that disappeared or changed domain/object ID.
6. Publishes retained MQTT Discovery configs for the current supported entities.

If you add, remove, rename, or reclassify a device in eLAN/RF-003, trigger rediscovery with:

```bash
curl -X POST http://localhost:3000/discovery/force
```

Restarting Docker also works because startup queues forced discovery, but the HTTP endpoint is faster and does not interrupt MQTT, Valkey, or the HTTP server. Home Assistant should update existing entities when the MQTT Discovery topic and `unique_id` stay the same. New RF-003 devices appear after Home Assistant receives the new retained discovery config.

## Configuration

Configuration is read from environment variables. Required deployment-specific values should not be hard-coded.

| Variable | Default | Description |
| --- | --- | --- |
| `RF003_BASE_URL` | none | RF-003 gateway base URL, for example `http://rf003.local` |
| `RF003_USERNAME` | none | RF-003 username |
| `RF003_PASSWORD` | none | RF-003 password |
| `MQTT_URL` | none | MQTT broker URL, for example `mqtt://mosquitto.local:1883` |
| `MQTT_USERNAME` | unset | Optional MQTT username |
| `MQTT_PASSWORD` | unset | Optional MQTT password |
| `MQTT_DISCOVERY_PREFIX` | `homeassistant` | Home Assistant MQTT Discovery prefix |
| `MQTT_BASE_TOPIC` | `inels` | Base topic for bridge state, commands, and availability |
| `VALKEY_URL` | `redis://valkey:6379` | Valkey or Redis-compatible connection URL |
| `POLL_FULL_STATE_INTERVAL_MS` | `60000` | Full state poll interval |
| `POLL_DEVICE_STATE_INTERVAL_MS` | `300000` | Device state poll interval |
| `LOG_LEVEL` | `info` | Pino log level |
| `HTTP_HOST` | `0.0.0.0` | HTTP listen host inside the container/process |
| `HTTP_PORT` | `3000` | HTTP listen port inside the container/process |
| `APP_HTTP_PORT` | `3000` | Docker Compose host port |

> [!NOTE]
> `APP_HTTP_PORT` is used by Docker Compose for host port mapping. The app container listens on `HTTP_PORT`, usually `3000`.

## Docker Runtime

The standalone `standalone/docker-compose.yml` runs the app and an ephemeral Valkey service:

- app container built from the hardened multi-stage `Dockerfile`
- Valkey service with RDB snapshots and append-only persistence disabled
- no Valkey data volume; RF-003 discovery rebuilds the registry after restart
- `restart: unless-stopped` for app and Valkey

Start it with:

```bash
docker compose -f standalone/docker-compose.yml up --build
```

Stop it with:

```bash
docker compose -f standalone/docker-compose.yml down
```

Valkey stores runtime/cache registry, queue metadata, and bridge metadata. RF-003 remains the durable source of truth for device inventory and state. If Valkey is recreated, the bridge queues forced discovery on startup and rebuilds the device registry from RF-003. Home Assistant remapping should not be required as long as RF-003 device IDs and MQTT Discovery identifiers remain stable, but discovery and state updates may be delayed until RF-003 rediscovery succeeds.

Mosquitto or another MQTT broker, and Home Assistant, are intentionally external to this repository. Point `MQTT_URL` at the broker you want the bridge to use.

## Home Assistant App Package

The repository root is also a headless Home Assistant Supervisor app package for local testing before published images exist.

The app uses Home Assistant's MQTT service, reads RF-003 settings from the Supervisor configuration form, runs an internal ephemeral Valkey instance for BullMQ, and exposes devices through MQTT Discovery. It does not provide an ingress UI.

For local testing, copy the repository root to `/addons/elan-ha` on a Home Assistant system, reload local apps in Supervisor, configure the RF-003 options, and start the app.

The standalone Docker Compose deployment remains available through `standalone/docker-compose.yml` for non-Supervisor environments and manual MQTT broker configuration.

## MQTT Topics

The bridge centralizes MQTT topic construction and uses retained messages where Home Assistant expects them.

Examples with the default topic settings:

```text
homeassistant/switch/<object_id>/config
homeassistant/light/<object_id>/config
homeassistant/fan/<object_id>/config
inels/switch/<object_id>/state
inels/switch/<object_id>/set
inels/light/<object_id>/state
inels/light/<object_id>/set
inels/fan/<object_id>/state
inels/fan/<object_id>/set
inels/status
```

Discovery messages are retained. They are published after startup discovery and forced discovery. State is published after successful RF-003 reads or confirmed writes.

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | Process liveness check |
| `GET` | `/readyz` | Checks MQTT, Valkey, and RF-003 readiness |
| `GET` | `/devices` | Returns discovered supported entities from Valkey |
| `POST` | `/discovery/force` | Queues a forced RF-003 rediscovery |

`/readyz` returns HTTP `503` when any dependency is unavailable.

## Development

Install dependencies:

```bash
bun install
```

Run the app locally:

```bash
bun run dev
```

Run tests:

```bash
bun test
```

Type-check:

```bash
bun run typecheck
```

Format files:

```bash
bun run format
```

Build:

```bash
bun run build
```

## Project Structure

```text
src/
|-- app/             # Application composition
|-- config/          # Typed environment parsing
|-- devices/         # RF-003 device classification
|-- gateway/         # RF-003 session, client, parser, operations
|-- http/            # Elysia operational endpoints
|-- mqtt/            # MQTT client, topics, discovery, state payloads
|-- observability/   # Logger and readiness checks
|-- queue/           # BullMQ jobs, queue, worker
`-- storage/         # Valkey client, keys, registry persistence
```

## Gateway Probe

For development, `scripts/probe-gateway.ts` can query RF-003 directly with the configured credentials:

```bash
bun scripts/probe-gateway.ts
bun scripts/probe-gateway.ts <device-id>
```

Use this only as a diagnostic helper. Runtime RF-003 access in the application is serialized through BullMQ.
