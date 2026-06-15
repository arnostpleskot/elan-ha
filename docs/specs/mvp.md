# MVP Specification: iNELS RF-003 to MQTT Bridge

## Purpose

Build a standalone Bun/TypeScript bridge that exposes an existing iNELS RF installation to Home Assistant through MQTT Discovery, MQTT state topics, and MQTT command topics.

The bridge replaces Homebridge-specific logic from `https://github.com/arnostpleskot/homebridge-inels` with an independent MQTT service. Home Assistant is only an MQTT consumer. The MVP must not depend on Home Assistant APIs, custom integrations, HACS, or PM2.

## MVP Outcome

The MVP is complete when the bridge can:

- Start as a Bun application with typed configuration.
- Connect to Valkey/Redis for BullMQ and bridge storage.
- Connect to MQTT using MQTT.js.
- Authenticate to RF-003 and preserve session cookies.
- Serialize all RF-003 communication through BullMQ with worker concurrency `1`.
- Publish retained MQTT Discovery payloads for 24 RFSA-66M switch entities.
- Subscribe to MQTT command topics for those switches.
- Send switch commands to RF-003 and publish state only after confirmed RF-003 success or read-back.
- Poll RF-003 state on configurable intervals.
- Expose `GET /healthz` and `GET /readyz` through Elysia.
- Provide a way to force device discovery or rediscovery, at minimum as an HTTP endpoint once discovery is implemented.

## Non-Goals

- Home Assistant custom integration.
- HACS integration.
- Direct Home Assistant API usage.
- Multiple RF-003 gateways.
- Multiple concurrent RF-003 workers.
- Device diagnostics UI.
- WebSocket live updates.
- PM2 support.
- Optional Valkey mode.

## System Architecture

```text
RF-003
    -> HTTP/XML API
iNELS Bridge (Bun + TypeScript)
    -> MQTT Discovery + State + Commands
Mosquitto
    -> Home Assistant
```

RF-003 is the source of truth. MQTT mirrors RF-003 state and accepts commands. Commands, polling, and discovery jobs all enter BullMQ and are executed by a single RF-003 worker.

```text
MQTT Commands
Poll Jobs
Discovery Jobs
        -> BullMQ
        -> concurrency 1
        -> RF-003
```

## Technology Choices

- Runtime: Bun.
- Language: TypeScript.
- HTTP server: Elysia.
- MQTT client: MQTT.js.
- Queue: BullMQ.
- Queue/storage backend: Valkey/Redis.
- Logging: Pino.
- Development log formatting: pino-pretty.

Valkey is mandatory because it backs BullMQ and stores device configuration, cached state, and bridge metadata.

## RF-003 Gateway Reference

The RF-003 HTTP/session behavior must be translated from `src/api/index.ts` in `https://github.com/arnostpleskot/homebridge-inels`.

Observed behavior from that file:

- Requests target `http://<rf003-address>/api/<path>`.
- Login targets `http://<rf003-address>/login`.
- Authentication is `POST /login` with form fields:
- `name`: configured username.
- `key`: SHA-1 hash of the configured password.
- Session cookies are preserved in a cookie jar.
- If an API request returns HTTP 401, the client authenticates and retries the original request once.
- Responses with `content-type` are parsed as JSON by the proof-of-concept wrapper.

Implementation must preserve the behavior above while separating concerns into:

- `gateway/session.ts`: login, cookie handling, session renewal.
- `gateway/client.ts`: request construction, retry-on-401 behavior, RF-003 calls.
- `gateway/parser.ts`: XML parsing and response normalization.
- `gateway/types.ts`: request/response types and gateway errors.

Endpoint inventory and command payload details should be sourced from the proof-of-concept repository during gateway implementation. If those details are outside `src/api/index.ts`, inspect the call sites and fixtures in that repository rather than guessing.

## Device Model

The MVP target is four RFSA-66M relay modules with 24 controllable outputs total.

Each output maps to one Home Assistant switch entity. Device modeling should make this explicit:

- RFSA-66M device identity.
- Channel number.
- Human-readable name.
- RF-003 address or identifier needed to read/write the channel.
- Last known state metadata.

Device configuration is stored in Valkey/Redis. Runtime state must still come from RF-003 reads or confirmed writes. Cached state can speed startup but must not override fresh RF-003 state.

## MQTT Contract

MQTT Discovery is the only Home Assistant integration surface.

Discovery messages must be retained and follow Home Assistant MQTT Discovery specifications for:

- Discovery topic shape.
- Entity payload fields.
- Stable `unique_id` values.
- Device identifiers.
- Availability topics.
- State and command payload conventions.

Initial discovery topic pattern:

```text
homeassistant/switch/inels_rfsa66m_<device>_ch<channel>/config
```

Topic construction belongs in `src/mqtt/topics.ts`. Discovery payload generation belongs in `src/mqtt/discovery.ts`.

State must be published after:

- Successful RF-003 polling.
- Successful RF-003 command execution confirmed by response or read-back.

The bridge must not optimistically publish command success before RF-003 confirms the command.

## Queue Contract

All RF-003 communication goes through BullMQ. The RF-003 worker must use concurrency `1`.

Required job categories:

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

Command jobs must take priority over polling and discovery. Polling should be implemented with BullMQ repeatable jobs or an equivalent BullMQ-native scheduling mechanism.

## Storage Contract

Suggested Valkey keys:

```text
inels:devices
inels:state:<device>:<channel>
inels:meta:last_poll
inels:meta:last_success
```

Storage responsibilities:

- Persist configured RFSA-66M devices/channels.
- Cache last known states.
- Store bridge metadata such as last successful poll.
- Support forced rediscovery by replacing or refreshing stored device configuration.

## Configuration

Configuration must be loaded from environment variables and validated at startup.

Required or expected settings:

- `RF003_BASE_URL` or equivalent gateway address.
- `RF003_USERNAME`.
- `RF003_PASSWORD`.
- `MQTT_URL`.
- `MQTT_USERNAME`, optional.
- `MQTT_PASSWORD`, optional.
- `MQTT_DISCOVERY_PREFIX`, default `homeassistant`.
- `MQTT_BASE_TOPIC`, default such as `inels`.
- `VALKEY_URL`.
- `POLL_FULL_STATE_INTERVAL_MS`, sane default required.
- `POLL_DEVICE_STATE_INTERVAL_MS`, sane default required if per-device polling is used.
- `LOG_LEVEL`, default `info`.
- `HTTP_HOST`, default `0.0.0.0`.
- `HTTP_PORT`, default `3000`.

Do not hard-code credentials, hostnames, passwords, or site-specific identifiers.

## HTTP API

Elysia provides operational endpoints only.

Required MVP endpoints:

```http
GET /healthz
GET /readyz
```

`GET /healthz` returns HTTP 200 with:

```json
{
  "status": "ok"
}
```

`GET /readyz` returns HTTP 200 only when:

- MQTT is connected.
- Valkey is connected.
- RF-003 session is valid or can be renewed.

If any dependency is unavailable, `/readyz` returns HTTP 503 with dependency status details.

Planned operational endpoints after the core MVP path exists:

```http
GET  /devices
GET  /devices/:id
GET  /jobs
GET  /stats
POST /poll
POST /discovery/republish
POST /discovery/force
```

`POST /discovery/force` should trigger rediscovery or refresh of RFSA-66M device configuration stored in Valkey.

## Logging

Use Pino everywhere. Do not use `console.log` in application code.

Create a root logger and child loggers for modules:

```ts
logger.child({ module: "gateway" })
logger.child({ module: "mqtt" })
logger.child({ module: "queue" })
logger.child({ module: "http" })
```

Use structured metadata for device IDs, channels, job IDs, retry counts, and dependency status.

Log level guidance:

- `debug`: RF-003 requests, parsed XML payloads, MQTT payloads.
- `info`: MQTT connected, RF-003 session established, discovery published.
- `warn`: retries, session expiry, temporary connectivity issues.
- `error`: failed jobs, gateway unavailable, startup failures.

Production logs should be JSON. `pino-pretty` is development-only.

## Source Layout

Target layout:

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

## Testing Strategy

Start with pure modules before integration wiring.

Initial tests:

- Config validation accepts valid env and rejects missing required values.
- MQTT topic generation matches Home Assistant discovery topic expectations.
- MQTT discovery payloads contain stable identifiers and switch entity fields.
- RFSA-66M device/channel mapping produces 24 switch channels for the target setup.
- Gateway session retries once after HTTP 401 and preserves cookies.
- Gateway XML parser handles representative RF-003 responses.
- Queue worker configuration uses concurrency `1`.
- Readiness returns 503 when MQTT, Valkey, or RF-003 is unavailable.

Use Bun's test runner. Use fakes or mocks for RF-003, MQTT, and Valkey where practical.

## Implementation Phases

### Phase 1: Project Bootstrap

- Add `package.json`, `bun.lock`, `tsconfig.json`, and standard scripts.
- Create the source layout.
- Add Pino logger.
- Add typed config parsing.
- Add Elysia `GET /healthz`.

### Phase 2: Docker Development Runtime

- Add Dockerfile for the Bun app.
- Add `.dockerignore`.
- Add `docker-compose.yml` with app and Valkey services.
- Wire Compose to `.env` values and document `.env.example` usage.
- Verify `docker compose up` starts the app and `GET /healthz` works.
- Keep Valkey running in Compose even before the app connects to it; later phases will use it for BullMQ and storage.

### Phase 3: Pure Domain Modules

- Add MQTT topic helpers.
- Add MQTT Discovery payload generation.
- Add RFSA-66M device/channel modeling.
- Add queue job names and payload types.
- Add storage key helpers if useful.

### Phase 4: Infrastructure Connections

- Add Valkey client.
- Add BullMQ queue, scheduler, and worker with concurrency `1`.
- Add MQTT client with command subscriptions.
- Add readiness checks for MQTT and Valkey.

### Phase 5: RF-003 Gateway

- Translate authentication/session behavior from the Homebridge proof of concept.
- Inventory required RF-003 endpoints and payloads from proof-of-concept call sites.
- Implement gateway client and XML parser.
- Route all gateway calls through BullMQ.

### Phase 6: End-to-End MVP Flow

- Publish retained discovery for 24 switches.
- Load device configuration from Valkey.
- Execute MQTT commands through BullMQ to RF-003.
- Publish state after confirmed command success or read-back.
- Add polling jobs and metadata updates.
- Add `/readyz` and force discovery endpoint.

### Phase 7: Production Docker Packaging

- Harden Docker image for production.
- Add Compose example for production-like deployment if useful.
- Keep Home Assistant Supervisor packaging for a later stage.

## Acceptance Criteria

- `bun install` installs dependencies.
- `bun run typecheck` passes.
- `bun test` passes for implemented tests.
- `bun run build` passes.
- Health endpoint returns `{ "status": "ok" }`.
- Readiness reports dependency failures with HTTP 503.
- MQTT Discovery publishes 24 retained switch configs for the target RFSA-66M setup.
- User switch commands are serialized through BullMQ before reaching RF-003.
- RF-003 worker concurrency is `1`.
- No credentials or site-specific secrets are committed.

## Risks And Follow-Ups

- The proof-of-concept `src/api/index.ts` contains the auth/session wrapper, but endpoint and payload usage may live in other files. Gateway implementation must inspect those call sites before coding endpoint-specific behavior.
- RF-003 response formats may include XML despite the proof-of-concept wrapper parsing JSON when `content-type` is present. Parser tests should be based on real RF-003 responses or captured fixtures.
- Home Assistant MQTT Discovery details should be checked against current Home Assistant documentation during implementation.
- Polling intervals should be conservative by default to avoid RF-003 overload.
