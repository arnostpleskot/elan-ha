# Phase 4 Infrastructure Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Valkey, MQTT, and BullMQ clients into the running app and expose `GET /readyz` that returns dependency health.

**Architecture:** Each infrastructure client is a thin factory function; BullMQ Queue and Worker receive parsed connection options (not a shared ioredis instance) so each manages its own Redis connection. The MQTT client and Valkey client are created in `createApp`, passed into a readiness closure, and injected into the HTTP server. The BullMQ worker runs a placeholder handler (logs + throws "not implemented") with concurrency 1 — no real jobs are dispatched in this phase.

**Tech Stack:** Bun test runner, TypeScript, ioredis, bullmq, mqtt (MQTT.js v5), Elysia, pino.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/storage/valkey.ts` | Create | ioredis factory + BullMQ connection option parser |
| `src/mqtt/client.ts` | Create | MQTT.js factory — connects, subscribes to command topic, logs |
| `src/queue/scheduler.ts` | Create | BullMQ Queue factory named `"gateway"` |
| `src/queue/worker.ts` | Create | BullMQ Worker with concurrency 1 and placeholder handler |
| `src/queue/worker.test.ts` | Create | Verify Worker constructed with concurrency 1 |
| `src/observability/readiness.ts` | Create | `checkReadiness` — pings Valkey, checks MQTT connected flag |
| `src/observability/readiness.test.ts` | Create | All four ready/down combinations |
| `src/http/server.ts` | Modify | Accept `deps` arg; add `GET /readyz` returning 200/503 |
| `src/http/server.test.ts` | Modify | Extend existing test; add `/readyz` cases with mock readiness |
| `src/app/app.ts` | Modify | Wire all clients and pass readiness closure to HTTP server |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

Run: `bun add ioredis bullmq mqtt`

Expected output (versions may differ):
```
bun add v1.x
+ ioredis@x.x.x
+ bullmq@x.x.x
+ mqtt@x.x.x
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add package.json bun.lock && git commit -m "chore: add ioredis, bullmq, mqtt dependencies"
```

Expected: signed commit succeeds. If signing fails, stop and ask; do not bypass signing.

---

## Task 2: Valkey Client

**Files:**
- Create: `src/storage/valkey.ts`

- [ ] **Step 1: Implement Valkey client factory**

Create `src/storage/valkey.ts`:

```ts
import { Redis } from "ioredis";

export type ValkeyConnectionOptions = {
  host: string;
  port: number;
  password?: string;
};

export const createValkeyClient = (url: string): Redis => new Redis(url);

export const parseValkeyConnectionOptions = (url: string): ValkeyConnectionOptions => {
  const parsed = new URL(url);
  const options: ValkeyConnectionOptions = {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
  };
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }
  return options;
};
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/storage/valkey.ts && git commit -m "feat: add valkey client factory"
```

Expected: signed commit succeeds.

---

## Task 3: MQTT Client

**Files:**
- Create: `src/mqtt/client.ts`

- [ ] **Step 1: Implement MQTT client factory**

Create `src/mqtt/client.ts`:

```ts
import mqtt, { type MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";

export const createMqttClient = (config: AppConfig["mqtt"], logger: Logger): MqttClient => {
  const mqttLogger = logger.child({ module: "mqtt" });
  const commandTopic = `${config.baseTopic}/switch/+/set`;

  const client = mqtt.connect(config.url, {
    username: config.username,
    password: config.password,
  });

  client.on("connect", () => {
    mqttLogger.info({ url: config.url }, "mqtt connected");
    client.subscribe(commandTopic, (err) => {
      if (err) {
        mqttLogger.error({ err, topic: commandTopic }, "failed to subscribe to command topic");
      } else {
        mqttLogger.info({ topic: commandTopic }, "subscribed to command topic");
      }
    });
  });

  client.on("message", (topic, payload) => {
    mqttLogger.debug({ topic, payload: payload.toString() }, "mqtt message received");
  });

  client.on("error", (err) => {
    mqttLogger.error({ err }, "mqtt error");
  });

  return client;
};
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/mqtt/client.ts && git commit -m "feat: add mqtt client factory"
```

Expected: signed commit succeeds.

---

## Task 4: BullMQ Queue

**Files:**
- Create: `src/queue/scheduler.ts`

- [ ] **Step 1: Implement queue factory**

Create `src/queue/scheduler.ts`:

```ts
import { Queue } from "bullmq";
import type { ValkeyConnectionOptions } from "../storage/valkey";

const QUEUE_NAME = "gateway";

export const createGatewayQueue = (connection: ValkeyConnectionOptions): Queue =>
  new Queue(QUEUE_NAME, { connection });
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/queue/scheduler.ts && git commit -m "feat: add bullmq gateway queue"
```

Expected: signed commit succeeds.

---

## Task 5: BullMQ Worker

**Files:**
- Create: `src/queue/worker.ts`
- Create: `src/queue/worker.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/queue/worker.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";

const capturedOpts: { concurrency?: number } = {};

mock.module("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, _processor: unknown, opts: { concurrency?: number } = {}) {
      capturedOpts.concurrency = opts.concurrency;
    }
  },
}));

const { createGatewayWorker } = await import("./worker");

const fakeLogger = {
  child: () => ({ warn: () => {}, error: () => {}, info: () => {} }),
} as unknown as Logger;

const fakeConnection = { host: "localhost", port: 6379 };

describe("gateway worker", () => {
  test("is created with concurrency 1", () => {
    createGatewayWorker(fakeConnection, fakeLogger);
    expect(capturedOpts.concurrency).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/queue/worker.test.ts`

Expected: FAIL because `./worker` does not exist.

- [ ] **Step 3: Implement worker**

Create `src/queue/worker.ts`:

```ts
import { Worker } from "bullmq";
import type { Logger } from "pino";
import type { ValkeyConnectionOptions } from "../storage/valkey";

const QUEUE_NAME = "gateway";
const CONCURRENCY = 1;

export const createGatewayWorker = (connection: ValkeyConnectionOptions, logger: Logger): Worker => {
  const workerLogger = logger.child({ module: "queue" });

  return new Worker(
    QUEUE_NAME,
    async (job) => {
      workerLogger.warn({ jobName: job.name }, "job handler not implemented");
      throw new Error("not implemented");
    },
    { connection, concurrency: CONCURRENCY },
  );
};
```

- [ ] **Step 4: Run checks**

Run: `bun test src/queue/worker.test.ts && bun run typecheck`

Expected: 1 test passes, typecheck clean.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/queue/worker.ts src/queue/worker.test.ts && git commit -m "feat: add bullmq gateway worker with concurrency 1"
```

Expected: signed commit succeeds.

---

## Task 6: Readiness Check

**Files:**
- Create: `src/observability/readiness.ts`
- Create: `src/observability/readiness.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/observability/readiness.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import type { MqttClient } from "mqtt";
import { checkReadiness } from "./readiness";

const makeMqtt = (connected: boolean) => ({ connected }) as unknown as MqttClient;

const makeValkey = (healthy: boolean) =>
  ({
    ping: healthy
      ? async () => "PONG"
      : async () => {
          throw new Error("connection refused");
        },
  }) as unknown as Redis;

describe("checkReadiness", () => {
  test("ready when both mqtt and valkey are healthy", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(true));
    expect(result).toEqual({ ready: true, mqtt: true, valkey: true });
  });

  test("not ready when mqtt is disconnected", async () => {
    const result = await checkReadiness(makeMqtt(false), makeValkey(true));
    expect(result).toEqual({ ready: false, mqtt: false, valkey: true });
  });

  test("not ready when valkey is down", async () => {
    const result = await checkReadiness(makeMqtt(true), makeValkey(false));
    expect(result).toEqual({ ready: false, mqtt: true, valkey: false });
  });

  test("not ready when both are down", async () => {
    const result = await checkReadiness(makeMqtt(false), makeValkey(false));
    expect(result).toEqual({ ready: false, mqtt: false, valkey: false });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/observability/readiness.test.ts`

Expected: FAIL because `./readiness` does not exist.

- [ ] **Step 3: Implement readiness check**

Create `src/observability/readiness.ts`:

```ts
import type { Redis } from "ioredis";
import type { MqttClient } from "mqtt";

export type ReadinessResult = {
  ready: boolean;
  mqtt: boolean;
  valkey: boolean;
};

export const checkReadiness = async (mqtt: MqttClient, valkey: Redis): Promise<ReadinessResult> => {
  const mqttReady = mqtt.connected;

  let valkeyReady = false;
  try {
    await valkey.ping();
    valkeyReady = true;
  } catch {
    valkeyReady = false;
  }

  return {
    ready: mqttReady && valkeyReady,
    mqtt: mqttReady,
    valkey: valkeyReady,
  };
};
```

- [ ] **Step 4: Run checks**

Run: `bun test src/observability/readiness.test.ts && bun run typecheck`

Expected: 4 tests pass, typecheck clean.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/observability/readiness.ts src/observability/readiness.test.ts && git commit -m "feat: add readiness check for mqtt and valkey"
```

Expected: signed commit succeeds.

---

## Task 7: HTTP `/readyz` Endpoint

**Files:**
- Modify: `src/http/server.ts`
- Modify: `src/http/server.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the entire contents of `src/http/server.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import type { ReadinessResult } from "../observability/readiness";
import { createHttpServer } from "./server";

const readyResult: ReadinessResult = { ready: true, mqtt: true, valkey: true };
const notReadyResult: ReadinessResult = { ready: false, mqtt: false, valkey: true };

describe("createHttpServer", () => {
  test("GET /healthz returns ok", async () => {
    const app = createHttpServer({ getReadiness: async () => readyResult });
    const response = await app.handle(new Request("http://localhost/healthz"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("GET /readyz returns 200 when all dependencies are ready", async () => {
    const app = createHttpServer({ getReadiness: async () => readyResult });
    const response = await app.handle(new Request("http://localhost/readyz"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true, mqtt: true, valkey: true });
  });

  test("GET /readyz returns 503 when a dependency is down", async () => {
    const app = createHttpServer({ getReadiness: async () => notReadyResult });
    const response = await app.handle(new Request("http://localhost/readyz"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: false, mqtt: false, valkey: true });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/http/server.test.ts`

Expected: FAIL — `createHttpServer` currently takes no arguments, so the existing `/healthz` test also fails.

- [ ] **Step 3: Implement `/readyz` in server**

Replace the entire contents of `src/http/server.ts` with:

```ts
import { Elysia } from "elysia";
import type { ReadinessResult } from "../observability/readiness";

type HttpServerDeps = {
  getReadiness: () => Promise<ReadinessResult>;
};

export const createHttpServer = ({ getReadiness }: HttpServerDeps) =>
  new Elysia()
    .get("/healthz", () => ({ status: "ok" as const }))
    .get("/readyz", async ({ set }) => {
      const result = await getReadiness();
      if (!result.ready) {
        set.status = 503;
      }
      return result;
    });

export type HttpServer = ReturnType<typeof createHttpServer>;
```

- [ ] **Step 4: Run checks**

Run: `bun test src/http/server.test.ts && bun run typecheck`

Expected: 3 tests pass, typecheck clean.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/http/server.ts src/http/server.test.ts && git commit -m "feat: add /readyz endpoint"
```

Expected: signed commit succeeds.

---

## Task 8: Wire App

**Files:**
- Modify: `src/app/app.ts`

- [ ] **Step 1: Update app to wire all clients**

Replace the entire contents of `src/app/app.ts` with:

```ts
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { createMqttClient } from "../mqtt/client";
import { checkReadiness } from "../observability/readiness";
import { createGatewayQueue } from "../queue/scheduler";
import { createGatewayWorker } from "../queue/worker";
import { createValkeyClient, parseValkeyConnectionOptions } from "../storage/valkey";
import { createHttpServer } from "../http/server";

export type App = {
  start: () => void;
};

export const createApp = (config: AppConfig, logger: Logger): App => ({
  start: () => {
    const valkey = createValkeyClient(config.valkey.url);
    const connection = parseValkeyConnectionOptions(config.valkey.url);
    const mqttClient = createMqttClient(config.mqtt, logger);
    createGatewayQueue(connection);
    createGatewayWorker(connection, logger);

    const httpLogger = logger.child({ module: "http" });
    const server = createHttpServer({
      getReadiness: () => checkReadiness(mqttClient, valkey),
    });

    server.listen({
      hostname: config.http.host,
      port: config.http.port,
    });

    httpLogger.info({ host: config.http.host, port: config.http.port }, "http server started");
  },
});
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add src/app/app.ts && git commit -m "feat: wire valkey, mqtt, and bullmq into app"
```

Expected: signed commit succeeds.

---

## Task 9: Phase 4 Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`

Expected: all tests pass (prior 24 + new 8 = 32 total).

- [ ] **Step 2: Run typecheck and build**

Run: `bun run typecheck && bun run build`

Expected: both pass.

- [ ] **Step 3: Verify no scope creep**

Run: `git diff --name-only main...HEAD`

Expected: only files under `src/storage`, `src/mqtt`, `src/queue`, `src/observability`, `src/http`, `src/app`, `package.json`, `bun.lock`, and plan/spec docs.

- [ ] **Step 4: Check clean status**

Run: `git status --short`

Expected: clean working tree.

---

## Phase 4 Completion Criteria

- `bun test`, `bun run typecheck`, `bun run build` all pass.
- `GET /readyz` returns 200 with `{ ready, mqtt, valkey }` when both services are up; 503 when either is down.
- BullMQ worker runs with concurrency 1.
- MQTT client subscribes to `{baseTopic}/switch/+/set` on connect.
- No RF-003 gateway calls, no job dispatch, no repeatable poll scheduling introduced.
