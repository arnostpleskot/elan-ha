# Phase 4 Infrastructure Connections — Design

**Date:** 2026-06-15
**Phase:** 4 of 7 (MVP spec)
**Goal:** Wire Valkey, MQTT, and BullMQ clients into the running app and add `/readyz`.

---

## Scope

This phase adds real external connections. It does not implement RF-003 gateway calls, job handlers, repeatable poll scheduling, or MQTT command processing — those belong to Phase 5 and Phase 6. The only observable behaviors added are:

- The app connects to Valkey and MQTT on startup.
- A BullMQ worker is running with concurrency 1 and a placeholder handler.
- `GET /readyz` returns dependency status.

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `ioredis` | Valkey/Redis client for direct storage ops |
| `bullmq` | Queue, Worker |
| `mqtt` | MQTT.js client |

---

## File Responsibilities

### `src/storage/valkey.ts`

Two exports:

- `createValkeyClient(url: string): Redis` — creates an ioredis instance for direct key reads/writes (`inels:devices`, `inels:state:*`, etc.).
- `parseValkeyConnectionOptions(url: string): ConnectionOptions` — parses the Valkey URL into `{ host, port, password? }` for BullMQ Queue and Worker. BullMQ requires separate connections per instance; passing options (not a shared client) lets BullMQ manage its own connections.

### `src/mqtt/client.ts`

- `createMqttClient(config: AppConfig["mqtt"], logger: Logger): MqttClient` — connects to the broker and subscribes to `{baseTopic}/switch/+/set`.
- On `connect`: logs at `info`.
- On `message`: logs topic and payload at `debug`. No command dispatch yet (Phase 6).
- On `error`: logs at `error`.
- Returns the raw `MqttClient` so the app can check `.connected` for readiness.

### `src/queue/scheduler.ts`

- `createGatewayQueue(connection: ConnectionOptions): Queue` — creates a BullMQ `Queue` named `"gateway"`.
- Repeatable poll job registration is deferred to Phase 6 when the gateway handler exists.

### `src/queue/worker.ts`

- `createGatewayWorker(connection: ConnectionOptions, logger: Logger): Worker` — creates a BullMQ `Worker` for the `"gateway"` queue with **concurrency 1**.
- Placeholder processor: logs `{ jobName }` at `warn` and throws `new Error("not implemented")`. BullMQ marks the job failed; it will not block the queue from accepting future jobs.

### `src/observability/readiness.ts`

```ts
type ReadinessResult = {
  ready: boolean;
  mqtt: boolean;
  valkey: boolean;
};

checkReadiness(mqtt: MqttClient, valkey: Redis): Promise<ReadinessResult>
```

- MQTT check: `mqtt.connected`.
- Valkey check: `await valkey.ping()` — resolves to `"PONG"` when healthy, throws on error.
- `ready` is `true` only when both pass.

### `src/http/server.ts` (modified)

`createHttpServer` gains a `deps` argument:

```ts
createHttpServer(deps: { getReadiness: () => Promise<ReadinessResult> })
```

- `GET /healthz` — unchanged, always returns `{ status: "ok" }`.
- `GET /readyz` — calls `getReadiness()`. Returns `200` with the result on success, `503` with the result on failure.

### `src/app/app.ts` (modified)

`createApp` becomes `async`. Startup order:

1. Create Valkey client (ioredis connects automatically).
2. Parse Valkey connection options for BullMQ.
3. Create MQTT client (connects automatically).
4. Create BullMQ Queue and Worker.
5. Create HTTP server with readiness closure.
6. Start HTTP server.

---

## Readiness Semantics

`/readyz` returns `HTTP 200` only when:

- `mqtt.connected === true`
- `valkey.ping()` resolves without error

Otherwise returns `HTTP 503` with:

```json
{ "ready": false, "mqtt": false, "valkey": true }
```

RF-003 session check is deferred to Phase 6 when the gateway client exists.

---

## Tests

| File | What is tested |
|------|---------------|
| `src/queue/worker.test.ts` | Worker constructed with `concurrency: 1`; uses a BullMQ `Worker` stub |
| `src/observability/readiness.test.ts` | All four states: both ready, MQTT down, Valkey down, both down; uses fake client objects |
| `src/http/server.test.ts` (extended) | `/readyz` returns 200 when ready, 503 when not; mock `getReadiness` injected |

No tests for `valkey.ts` (pure construction), `mqtt/client.ts` (integration — smoke-tested via Docker), or `scheduler.ts` (trivial factory).

---

## Out of Scope

- Repeatable poll job scheduling (Phase 6)
- MQTT command dispatch (Phase 6)
- RF-003 session readiness check (Phase 6)
- Retry logic on startup connection failure (future hardening)
