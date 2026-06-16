# elan-ha

> iNELS RF-003 to MQTT bridge for Home Assistant

`elan-ha` connects an existing iNELS RF installation to Home Assistant without replacing hardware or installing a custom Home Assistant integration. It talks to the RF-003 gateway over its HTTP API, serializes all gateway operations through BullMQ, and exposes supported devices through Home Assistant MQTT Discovery.

## Features

- Discovers supported devices from the RF-003 gateway
- Publishes Home Assistant MQTT Discovery entities for switches and dimmable lights
- Mirrors RF-003 state to MQTT state topics
- Accepts MQTT commands and writes them back to RF-003
- Serializes all RF-003 access through a BullMQ worker with concurrency `1`
- Stores discovered device registry and bridge metadata in Valkey
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

## Supported Entities

| RF-003 capability | Home Assistant entity | MQTT payload |
| --- | --- | --- |
| Boolean `on` state/action | Switch | `ON` / `OFF` |
| Integer `brightness` state/action | Dimmable light | JSON state with HA brightness scale `0-255` |

Unsupported RF-003 devices are ignored until support is implemented.

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

3. Start the production-like runtime:

   ```bash
   docker compose up --build
   ```

   For local development with ephemeral Valkey storage, use:

   ```bash
   docker compose -f docker-compose.dev.yml up --build
   ```

4. Check the bridge:

   ```bash
   curl http://localhost:3000/healthz
   curl http://localhost:3000/readyz
   ```

Home Assistant should discover supported RF-003 devices through MQTT Discovery after the bridge starts and completes discovery.

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

The default `docker-compose.yml` is production-like:

- app container built from the hardened multi-stage `Dockerfile`
- Valkey service with append-only persistence enabled
- named `valkey-data` volume for registry, queue metadata, and cached bridge metadata
- `restart: unless-stopped` for app and Valkey

Start it with:

```bash
docker compose up --build
```

For development, use `docker-compose.dev.yml`:

```bash
docker compose -f docker-compose.dev.yml up --build
```

The development Compose file uses ephemeral Valkey storage. If Valkey is recreated, the bridge queues forced discovery on startup and rebuilds the device registry from RF-003. Home Assistant remapping should not be required as long as RF-003 device IDs and MQTT Discovery identifiers remain stable, but discovery and state updates may be delayed until RF-003 rediscovery succeeds.

Mosquitto or another MQTT broker, and Home Assistant, are intentionally external to this repository. Point `MQTT_URL` at the broker you want the bridge to use.

## MQTT Topics

The bridge centralizes MQTT topic construction and uses retained messages where Home Assistant expects them.

Examples with the default topic settings:

```text
homeassistant/switch/<object_id>/config
homeassistant/light/<object_id>/config
inels/switch/<object_id>/state
inels/switch/<object_id>/set
inels/light/<object_id>/state
inels/light/<object_id>/set
inels/status
```

Discovery messages are retained. State is published after successful RF-003 reads or confirmed writes.

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
