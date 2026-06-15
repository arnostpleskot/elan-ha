# AGENTS.md

## Project Overview

This repository is for an iNELS RF-003 to MQTT to Home Assistant bridge.

The goal is to integrate an existing iNELS RF installation into Home Assistant without replacing hardware. The bridge communicates with the RF-003 gateway through its HTTP/XML API and exposes devices to Home Assistant through MQTT Discovery, MQTT state topics, and MQTT command topics.

The bridge must stay independent from Home Assistant. Home Assistant should only consume MQTT entities through MQTT Discovery. Do not add a Home Assistant custom integration, HACS integration, or direct Home Assistant API integration for the MVP.

Current target environment:

- RF-003 gateway
- 4x RFSA-66M relay modules
- 24 controllable relay outputs
- Existing Home Assistant deployment
- Existing MQTT infrastructure
- Existing proof of concept: https://github.com/arnostpleskot/homebridge-inels

Use the proof-of-concept implementation as the RF-003 behavior reference. In particular, take the RF-003 HTTP/XML endpoints, authentication flow, session-cookie handling, and command payload details from `src/api/index.ts` in that repository.

## Current Repository State

This repository is currently bootstrapped but does not yet contain the Bun/TypeScript application source tree. Treat the sections below as the implementation target.

When adding project files, prefer minimal, incremental changes that establish the documented architecture without inventing unrelated features.

## Architecture

```text
RF-003
    -> HTTP/XML API
iNELS Bridge (Bun + TypeScript)
    -> MQTT Discovery + State + Commands
Mosquitto
    -> Home Assistant
```

Core rule: RF-003 is the source of truth. MQTT mirrors RF-003 state and accepts commands that are serialized back to RF-003.

All RF-003 communication must go through BullMQ with concurrency `1`.

```text
MQTT Commands
Poll Jobs
Discovery Jobs
        -> BullMQ
        -> Concurrency = 1
        -> RF-003
```

This avoids session corruption, cookie races, RF transmission collisions, and gateway overload.

## Technology Stack

- Runtime: Bun
- Language: TypeScript
- HTTP layer: Elysia
- MQTT client: MQTT.js
- Queue: BullMQ
- Storage/cache: Valkey, Redis-compatible
- Logging: Pino
- Development log formatting: pino-pretty

Valkey is mandatory for the MVP. It is required for BullMQ and for storing device configuration and bridge metadata.

Elysia is used for health checks, readiness checks, metrics, debugging, and OpenAPI generation. Do not make Elysia the application core.

## Expected Source Layout

Create and preserve this structure unless there is a strong reason to change it:

```text
src/
|-- app/
|-- config/
|-- gateway/
|   |-- client.ts
|   |-- session.ts
|   |-- parser.ts
|   `-- types.ts
|-- mqtt/
|   |-- client.ts
|   |-- discovery.ts
|   `-- topics.ts
|-- devices/
|   |-- registry.ts
|   |-- rfsa66m.ts
|   `-- types.ts
|-- queue/
|   |-- worker.ts
|   |-- jobs.ts
|   `-- scheduler.ts
|-- storage/
|   `-- valkey.ts
|-- observability/
|   |-- logger.ts
|   |-- health.ts
|   |-- readiness.ts
|   `-- metrics.ts
`-- http/
    `-- server.ts
```

Keep modules small and purpose-specific. Avoid central files that mix gateway access, MQTT behavior, device modeling, queueing, and HTTP concerns.

## Development Commands

Expected commands once `package.json` exists:

- Install dependencies: `bun install`
- Start development server: `bun run dev`
- Run tests: `bun test`
- Type-check: `bun run typecheck`
- Lint: `bun run lint`
- Format: `bun run format`
- Build: `bun run build`
- Create local environment file: `cp .env.example .env`
- Start Docker development runtime: `docker compose up --build`
- Stop Docker development runtime: `docker compose down`

For Docker Compose, `APP_HTTP_PORT` controls the host port exposed by Compose while the app container listens on port `3000` internally.

If these scripts do not exist yet, add them when creating the Bun project. Do not document commands that cannot be run unless they are clearly marked as target commands.

## Configuration

Use environment variables for deployment-specific configuration. Do not hard-code credentials, hostnames, MQTT passwords, RF-003 credentials, Valkey credentials, or Home Assistant details.

Expected configuration areas:

- RF-003 base URL
- RF-003 username/password or session credentials
- MQTT broker URL
- MQTT credentials, if needed
- MQTT base topics
- Valkey connection URL
- Poll intervals
- Log level
- HTTP listen host and port

Prefer typed config parsing in `src/config/`. Fail fast on invalid required config.

Polling intervals must be configurable. Start with environment variables and sane defaults. A later stage may allow these settings to be managed from the Home Assistant UI, but do not add direct Home Assistant API coupling for the MVP.

## Gateway Rules

- Treat RF-003 as a single-threaded resource.
- Route every RF-003 request through BullMQ.
- Keep BullMQ worker concurrency at `1` for gateway jobs.
- Preserve session-cookie handling in a dedicated gateway session module.
- Parse XML in `gateway/parser.ts`; do not scatter XML parsing through MQTT, queue, or device modules.
- Model RF-003 request and response types in `gateway/types.ts`.
- Use `https://github.com/arnostpleskot/homebridge-inels/blob/master/src/api/index.ts` as the behavior reference for RF-003 endpoints, authentication, session cookies, and command payloads.
- Do not copy the Homebridge architecture; translate the RF-003 API behavior into this bridge's gateway/session/parser modules.

## MQTT Rules

- Use MQTT.js.
- Publish Home Assistant MQTT Discovery messages as retained messages.
- Each RFSA-66M channel maps to one Home Assistant switch entity.
- The expected MVP result is 24 switch entities.
- Separate topic construction into `mqtt/topics.ts`.
- Separate discovery payload generation into `mqtt/discovery.ts`.
- Follow Home Assistant MQTT Discovery specifications for discovery topics, entity payloads, identifiers, and availability/state conventions because Home Assistant is the only intended consumer.
- Publish state after successful RF-003 reads or writes.
- Do not report command success until RF-003 confirms or state is read back.

Example discovery topic:

```text
homeassistant/switch/inels_rfsa66m_1_ch1/config
```

## Queue Rules

Use BullMQ for command serialization, retries, stalled job recovery, polling, and scheduling.

Suggested job names:

```text
command.set_output
poll.full_state
poll.device_state
discovery.publish
```

Suggested priorities:

```text
command.*      priority 1
poll.*         priority 10
discovery.*    priority 20
```

User commands should take precedence over polling and discovery jobs.

## Storage Rules

Use Valkey for BullMQ and bridge metadata/cache.

Valkey also stores device configuration. The bridge should be able to load configured RFSA-66M devices/channels from Valkey and provide a way to force rediscovery.

Suggested keys:

```text
inels:devices
inels:state:<device>:<channel>
inels:meta:last_poll
inels:meta:last_success
```

The cache may speed startup, but RF-003 remains the source of truth. Do not let cached state override fresh gateway state.

Device configuration may be persisted in Valkey, but runtime state still comes from RF-003 reads or confirmed writes.

## HTTP API

Use Elysia for operational endpoints.

Required MVP endpoints:

```http
GET /healthz
GET /readyz
```

`GET /healthz` returns:

```json
{
  "status": "ok"
}
```

`GET /readyz` checks:

- MQTT connected
- Valkey connected
- RF-003 session valid

Return HTTP 503 from `/readyz` when any dependency is unavailable.

Possible future endpoints:

```http
GET  /devices
GET  /devices/:id
GET  /jobs
GET  /stats
POST /poll
POST /discovery/republish
POST /discovery/force
```

Include a force-discovery endpoint when device discovery support is implemented so stored device configuration can be refreshed on demand.

## Logging

Use Pino. Do not use `console.log` in application code.

Create a root logger and derive child loggers by module:

```ts
logger.child({ module: "gateway" })
logger.child({ module: "mqtt" })
logger.child({ module: "queue" })
logger.child({ module: "http" })
```

Use optional components for narrower context:

```ts
logger.child({ module: "gateway", component: "session" })
```

Log level guidance:

- `debug`: HTTP requests to RF-003, parsed XML payloads, MQTT payloads
- `info`: MQTT connected, session established, discovery published
- `warn`: retries, session expiry, temporary connectivity issues
- `error`: failed jobs, gateway unavailable, startup failures

Use `pino-pretty` only for development output. Production logs should be JSON suitable for Docker logs, Loki, Grafana, or Home Assistant Supervisor logs.

## Testing Instructions

Use `bun test` once tests exist.

Expected testing focus:

- Gateway XML parser fixtures
- RF-003 session behavior and cookie renewal
- MQTT topic generation
- MQTT Discovery payload generation
- RFSA-66M device/channel mapping
- Queue priority and serialization behavior
- Readiness endpoint dependency reporting
- Config validation failures

Prefer unit tests around pure modules first: parser, topics, discovery payloads, config parsing, and device mapping. Use mocks or fakes for RF-003, MQTT, and Valkey integration tests.

## Code Style

- Use TypeScript with explicit exported types at module boundaries.
- Keep side effects in startup/composition code, not in pure helpers.
- Keep XML parsing isolated to gateway parser code.
- Keep MQTT topic strings centralized.
- Keep queue job names and payload types centralized.
- Prefer small modules with clear dependencies.
- Avoid speculative abstractions for multi-gateway support in the MVP.
- Do not add PM2 support.

## Build And Deployment

The deployment target is Docker. In later stages the container is expected to run under Home Assistant Supervisor.

Next deployment work should include:

- Docker image
- Docker Compose development runtime with app and Valkey services

Future deployment work may include:

- Production Docker hardening
- Home Assistant Add-on packaging
- Prometheus metrics
- OpenTelemetry tracing

These are not MVP requirements unless explicitly requested.

## Explicit Non-Goals For MVP

- Home Assistant custom integration
- HACS integration
- PM2
- Multiple workers against RF-003
- Direct Home Assistant API integration
- Multiple RF-003 gateways
- Device diagnostics UI
- WebSocket live updates

Everything goes through MQTT.

## Agent Workflow Rules

- Start by inspecting the current workspace before making changes.
- Prefer minimal, targeted edits that solve the request directly.
- Preserve user changes and never revert or overwrite them unless explicitly asked.
- Add or update tests for behavior changes when feasible.
- Verify changes with the smallest relevant command.
- If a documented command does not exist yet, either add it as part of the change or clearly state that verification was not available.
- Do not introduce credentials, tokens, passwords, or host-specific secrets into the repository.

## Confirmed Decisions

- RF-003 API details come from `src/api/index.ts` in `https://github.com/arnostpleskot/homebridge-inels`.
- MQTT Discovery topics, payloads, and unique IDs should follow Home Assistant specifications because Home Assistant is the only intended consumer.
- Device configuration is stored in Valkey/Redis.
- The bridge should support forced discovery, for example through an HTTP endpoint.
- Polling intervals are configurable, initially through environment variables with sane defaults.
- Docker is the target deployment format, with Home Assistant Supervisor support planned for later stages.
- Valkey is mandatory for the MVP because BullMQ and device configuration depend on it.
