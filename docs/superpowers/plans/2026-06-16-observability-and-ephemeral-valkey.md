# Observability And Ephemeral Valkey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce expected log noise, add safe debug visibility for RF-003/MQTT boundaries, and make Valkey ephemeral with reduced write churn.

**Architecture:** Keep behavior changes localized: logger redaction in `observability/logger.ts`, RF-003 HTTP trace logging in `gateway/client.ts`, MQTT publish tracing through a small wrapper in `mqtt/client.ts`, and compare-before-set storage helpers in `storage/registry.ts` plus app composition. Docker Compose becomes a single ephemeral stack and docs stop referencing the dev override.

**Tech Stack:** Bun, TypeScript, Pino, MQTT.js, Docker Compose, Valkey.

---

## File Structure

- Modify `src/observability/logger.ts`: central Pino redaction config for production and development transports.
- Add `src/observability/logger.test.ts`: verify redaction paths and logger option shape.
- Modify `src/gateway/client.ts`: lower retryable 401 log to `info` and add RF-003 debug request/response metadata.
- Modify `src/gateway/client.test.ts`: verify 401 log level and debug metadata.
- Modify `src/mqtt/client.ts`: wrap MQTT publish calls to log outbound publishes at debug.
- Modify `src/mqtt/client.test.ts`: verify outbound publish debug logs.
- Modify `src/storage/registry.ts`: add compare-before-set helper and use it for registry saves.
- Modify `src/storage/registry.test.ts`: verify unchanged registry save skips `set` and changed save writes.
- Modify `src/app/app.ts`: use compare-before-set helper for state and metadata keys.
- Modify `src/app/app.test.ts`: update persistence tests for compare-before-set behavior.
- Modify `docker-compose.yml`: make Valkey ephemeral with no data volume.
- Delete `docker-compose.dev.yml`: remove redundant dev-only stack.
- Modify `README.md`: document one default ephemeral Compose stack and remove dev Compose references.
- Modify `.env.example` only if needed for docs consistency; no new env vars are required.

## Task 1: Logger Redaction And RF-003 Logging

**Files:**
- Modify: `src/observability/logger.ts`
- Create: `src/observability/logger.test.ts`
- Modify: `src/gateway/client.ts`
- Modify: `src/gateway/client.test.ts`

- [ ] **Step 1: Add failing logger redaction tests**

Create `src/observability/logger.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { loggerRedactPaths } from "./logger";

describe("logger configuration", () => {
  test("redacts known sensitive fields and nested variants", () => {
    expect(loggerRedactPaths).toEqual(expect.arrayContaining([
      "rf003.password",
      "mqtt.password",
      "password",
      "*.password",
      "*.headers.cookie",
      "*.headers.authorization",
      "*.body.key",
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers.set-cookie",
    ]));
  });
});
```

- [ ] **Step 2: Run logger test to verify it fails**

Run: `bun test src/observability/logger.test.ts`

Expected: FAIL because `loggerRedactPaths` is not exported.

- [ ] **Step 3: Export shared redaction config and apply it to Pino**

Update `src/observability/logger.ts` to export redaction paths and pass them into both production and development Pino options:

```ts
import pino, { type Logger } from "pino";
import type { AppConfig } from "../config/env";

export const loggerRedactPaths = [
  "rf003.password",
  "mqtt.password",
  "password",
  "key",
  "cookie",
  "authorization",
  "*.password",
  "*.key",
  "*.cookie",
  "*.authorization",
  "*.headers.cookie",
  "*.headers.authorization",
  "*.headers.set-cookie",
  "*.body.password",
  "*.body.key",
  "req.headers.cookie",
  "req.headers.authorization",
  "res.headers.set-cookie",
];

const baseOptions = (config: Pick<AppConfig, "logLevel">) => ({
  level: config.logLevel,
  redact: {
    paths: loggerRedactPaths,
    censor: "[Redacted]",
  },
});

export const createLogger = (config: Pick<AppConfig, "logLevel">): Logger => {
  const isDevelopment = Bun.env.NODE_ENV === "development";

  if (isDevelopment) {
    return pino({
      ...baseOptions(config),
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    });
  }

  return pino(baseOptions(config));
};
```

- [ ] **Step 4: Add failing RF-003 logging tests**

In `src/gateway/client.test.ts`, replace `fakeLogger` with captured logger calls:

```ts
const makeLogger = () => {
  const calls: Array<{ level: "info" | "warn" | "error" | "debug"; obj: unknown; msg?: string }> = [];
  const child = {
    info: (obj: unknown, msg?: string) => calls.push({ level: "info", obj, msg }),
    warn: (obj: unknown, msg?: string) => calls.push({ level: "warn", obj, msg }),
    error: (obj: unknown, msg?: string) => calls.push({ level: "error", obj, msg }),
    debug: (obj: unknown, msg?: string) => calls.push({ level: "debug", obj, msg }),
  };
  return { calls, logger: { child: () => child } as unknown as Logger };
};

const fakeLogger = makeLogger().logger;
```

Add tests:

```ts
test("logs retryable 401 at info instead of warn", async () => {
  const { logger, calls } = makeLogger();
  const { session } = makeSession([emptyResponse(401), jsonResponse(200, { ok: true })]);
  const client = createGatewayClient(config, session, logger);

  await client.call(gatewayPaths.devices);

  expect(calls).toContainEqual({ level: "info", obj: { path: gatewayPaths.devices }, msg: "received 401, re-authenticating" });
  expect(calls.some((call) => call.level === "warn" && call.msg === "received 401, re-authenticating")).toBe(false);
});

test("logs RF-003 request and response metadata at debug", async () => {
  const { logger, calls } = makeLogger();
  const { session } = makeSession([jsonResponse(200, { ok: true })]);
  const client = createGatewayClient(config, session, logger);

  await client.call(gatewayPaths.devices);

  expect(calls).toContainEqual({ level: "debug", obj: { path: gatewayPaths.devices, method: "GET" }, msg: "rf-003 request" });
  expect(calls).toContainEqual({
    level: "debug",
    obj: { path: gatewayPaths.devices, status: 200, contentType: "application/json", body: { ok: true } },
    msg: "rf-003 response",
  });
});
```

- [ ] **Step 5: Run gateway tests to verify they fail**

Run: `bun test src/gateway/client.test.ts`

Expected: FAIL because 401 still logs at warn and debug traces are missing.

- [ ] **Step 6: Implement RF-003 info/debug logging**

Update `src/gateway/client.ts` so request debug logging happens before fetch, retryable 401 uses `info`, and response debug logging happens after parsing:

```ts
const methodFor = (init: RequestInit): string => init.method ?? "GET";

// inside call
clientLogger.debug({ path, method: methodFor(init) }, "rf-003 request");
let response = await session.fetch(url, init);

if (response.status === 401) {
  clientLogger.info({ path }, "received 401, re-authenticating");
  await session.authenticate();
  clientLogger.debug({ path, method: methodFor(init), retry: true }, "rf-003 request");
  response = await session.fetch(url, init);
}

// after ok checks
const body = await parseGatewayResponse(response);
clientLogger.debug({ path, status: response.status, contentType: response.headers.get("content-type") ?? "", body }, "rf-003 response");
return body;
```

- [ ] **Step 7: Run focused tests**

Run: `bun test src/observability/logger.test.ts src/gateway/client.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

Run: `git add src/observability/logger.ts src/observability/logger.test.ts src/gateway/client.ts src/gateway/client.test.ts && git commit -m "feat: add redacted gateway debug logging"`

Expected: commit succeeds, or use `--no-gpg-sign` if local signing is unavailable and the user will re-sign.

## Task 2: MQTT Outbound Debug Logging

**Files:**
- Modify: `src/mqtt/client.ts`
- Modify: `src/mqtt/client.test.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.test.ts`

- [ ] **Step 1: Add failing MQTT publish logging tests**

In `src/mqtt/client.test.ts`, update the mock client type so tests can access its `publish` method after `createMqttClient`. Add captured logger calls:

```ts
const makeLogger = () => {
  const calls: Array<{ level: "info" | "warn" | "error" | "debug"; obj: unknown; msg?: string }> = [];
  const child = {
    info: (obj: unknown, msg?: string) => calls.push({ level: "info", obj, msg }),
    warn: (obj: unknown, msg?: string) => calls.push({ level: "warn", obj, msg }),
    error: (obj: unknown, msg?: string) => calls.push({ level: "error", obj, msg }),
    debug: (obj: unknown, msg?: string) => calls.push({ level: "debug", obj, msg }),
  };
  return { calls, logger: { child: () => child } as unknown as Logger };
};
```

Add test:

```ts
test("logs outbound MQTT publishes at debug", () => {
  const { logger, calls } = makeLogger();
  const client = createMqttClient(config, logger);

  client.publish("inels/test", "payload", { retain: true });

  expect(calls).toContainEqual({
    level: "debug",
    obj: { topic: "inels/test", payload: "payload", retain: true },
    msg: "mqtt message published",
  });
});
```

- [ ] **Step 2: Run MQTT client test to verify it fails**

Run: `bun test src/mqtt/client.test.ts`

Expected: FAIL because outbound publishes are not logged.

- [ ] **Step 3: Wrap MQTT publish method**

In `src/mqtt/client.ts`, after `const client = mqtt.connect(...)`, wrap `client.publish` once:

```ts
const rawPublish = client.publish.bind(client);
client.publish = ((topic: string, payload: Parameters<MqttClient["publish"]>[1], opts?: Parameters<MqttClient["publish"]>[2], callback?: Parameters<MqttClient["publish"]>[3]) => {
  const loggedPayload = Buffer.isBuffer(payload) ? payload.toString() : String(payload);
  const retain = typeof opts === "object" && opts !== null && "retain" in opts ? opts.retain === true : false;
  mqttLogger.debug({ topic, payload: loggedPayload, retain }, "mqtt message published");
  return rawPublish(topic, payload, opts as never, callback as never);
}) as MqttClient["publish"];
```

If TypeScript overloads are awkward, use a small local type assertion rather than changing the public function signature.

- [ ] **Step 4: Run focused tests**

Run: `bun test src/mqtt/client.test.ts src/app/app.test.ts`

Expected: PASS. Existing app tests should still observe publishes normally.

- [ ] **Step 5: Commit**

Run: `git add src/mqtt/client.ts src/mqtt/client.test.ts src/app/app.ts src/app/app.test.ts && git commit -m "feat: log mqtt publishes at debug"`

Expected: commit succeeds, or use `--no-gpg-sign` if needed.

## Task 3: Compare-Before-Set Storage Writes

**Files:**
- Modify: `src/storage/registry.ts`
- Modify: `src/storage/registry.test.ts`
- Modify: `src/app/app.ts`
- Modify: `src/app/app.test.ts`

- [ ] **Step 1: Add failing registry compare-before-set tests**

In `src/storage/registry.test.ts`, add:

```ts
test("skips saving the registry when serialized value is unchanged", async () => {
  const serialized = JSON.stringify([entity]);
  const sets: string[] = [];
  const redis = {
    get: async () => serialized,
    set: async (_key: string, value: string) => {
      sets.push(value);
      return "OK";
    },
  };

  await saveDeviceRegistry(redis, [entity]);

  expect(sets).toEqual([]);
});

test("writes the registry when serialized value changed", async () => {
  const sets: string[] = [];
  const redis = {
    get: async () => null,
    set: async (_key: string, value: string) => {
      sets.push(value);
      return "OK";
    },
  };

  await saveDeviceRegistry(redis, [entity]);

  expect(sets).toEqual([JSON.stringify([entity])]);
});
```

- [ ] **Step 2: Run storage test to verify it fails**

Run: `bun test src/storage/registry.test.ts`

Expected: FAIL because `saveDeviceRegistry` always calls `set` and its Redis type lacks `get`.

- [ ] **Step 3: Implement write-if-changed helper**

In `src/storage/registry.ts`, update `RegistryRedis` and add helper:

```ts
type RegistryRedis = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

export const setJsonIfChanged = async (redis: RegistryRedis, key: string, value: unknown): Promise<void> => {
  const serialized = JSON.stringify(value);
  if ((await redis.get(key)) === serialized) {
    return;
  }
  await redis.set(key, serialized);
};
```

Update `saveDeviceRegistry`:

```ts
export const saveDeviceRegistry = async (redis: RegistryRedis, entities: DiscoveredEntity[]): Promise<void> => {
  await setJsonIfChanged(redis, deviceRegistryKey(), entities);
};
```

- [ ] **Step 4: Add failing app metadata/state compare-before-set test**

In `src/app/app.test.ts`, change `persists registry, states, and timestamps in Valkey` to initialize `get` from a map and assert unchanged values skip sets:

```ts
test("skips unchanged registry and state writes in Valkey", async () => {
  const values = new Map<string, string>([
    ["inels:devices", JSON.stringify([switchEntity])],
    ["inels:state:09354", JSON.stringify({ on: true })],
  ]);
  const sets: Array<[string, string]> = [];
  const valkey = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      sets.push([key, value]);
      values.set(key, value);
    },
  };
  const deps = createGatewayWorkerDeps({ config, valkey, mqttClient: { publish: () => undefined }, operations, logger });

  await deps.saveRegistry([switchEntity]);
  await deps.saveState("09354", { on: true });

  expect(sets).toEqual([]);
});
```

- [ ] **Step 5: Run app test to verify it fails**

Run: `bun test src/app/app.test.ts`

Expected: FAIL because app state writes still call `set` unconditionally.

- [ ] **Step 6: Use helper for app state and metadata writes**

In `src/app/app.ts`, import `setJsonIfChanged` from `../storage/registry`. Update worker deps:

```ts
saveState: async (deviceId, state) => {
  await setJsonIfChanged(valkey, stateKey(deviceId), state);
},
updateLastPoll: async () => {
  await setJsonIfChanged(valkey, lastPollKey(), new Date().toISOString());
},
updateLastSuccess: async () => {
  const timestampMs = Date.now();
  await setJsonIfChanged(valkey, lastSuccessKey(), new Date(timestampMs).toISOString());
  gatewaySuccessTracker?.recordSuccess(timestampMs);
},
```

Keep `updateLastPoll`/`updateLastSuccess` using current timestamps; they will usually write, but they share the same helper and skip only exact duplicates.

- [ ] **Step 7: Run focused tests**

Run: `bun test src/storage/registry.test.ts src/app/app.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

Run: `git add src/storage/registry.ts src/storage/registry.test.ts src/app/app.ts src/app/app.test.ts && git commit -m "fix: skip unchanged valkey writes"`

Expected: commit succeeds, or use `--no-gpg-sign` if needed.

## Task 4: Ephemeral Default Docker Compose And Docs

**Files:**
- Modify: `docker-compose.yml`
- Delete: `docker-compose.dev.yml`
- Modify: `README.md`

- [ ] **Step 1: Add failing Compose expectations**

There is no existing Compose parser test. Use manual verification for this task after editing:

Run: `docker compose config`

Expected before editing: output still includes `appendonly yes` and `valkey-data` volume.

- [ ] **Step 2: Make default Compose Valkey ephemeral**

Update `docker-compose.yml` Valkey service:

```yaml
  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped
    command: ["valkey-server", "--save", "", "--appendonly", "no"]
```

Remove the `volumes:` entry under `valkey` and remove the top-level `volumes:` block.

- [ ] **Step 3: Delete redundant dev Compose file**

Delete `docker-compose.dev.yml`.

- [ ] **Step 4: Update README Docker instructions**

In `README.md`, remove the Quick Start block that says to use `docker-compose.dev.yml`. Update Docker Runtime section to say:

```md
The default `docker-compose.yml` runs the app and ephemeral Valkey:

- app container built from the hardened multi-stage `Dockerfile`
- Valkey service with RDB snapshots and append-only persistence disabled
- no Valkey data volume; RF-003 discovery rebuilds the registry after restart
- `restart: unless-stopped` for app and Valkey

Start it with:

```bash
docker compose up --build
```

Stop it with:

```bash
docker compose down
```
```

Also update feature text that says Valkey stores registry/metadata so it clarifies this is runtime/cache data, not durable source of truth.

- [ ] **Step 5: Validate Compose**

Run: `docker compose config`

Expected: command succeeds, Valkey command is `valkey-server --save "" --appendonly no`, and there is no `valkey-data` volume.

- [ ] **Step 6: Search for stale dev Compose references**

Run: `rg "docker-compose\.dev|compose.dev|valkey-data|append-only persistence" README.md docs AGENTS.md package.json docker-compose.yml`

Expected: no stale references claiming developers should use `docker-compose.dev.yml` or that default Compose persists Valkey.

- [ ] **Step 7: Commit**

Run: `git add docker-compose.yml README.md && git rm docker-compose.dev.yml && git commit -m "chore: make valkey ephemeral by default"`

Expected: commit succeeds, or use `--no-gpg-sign` if needed.

## Task 5: Final Verification

**Files:**
- Modify only if verification exposes a concrete issue.

- [ ] **Step 1: Run full unit test suite**

Run: `bun test`

Expected: PASS.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `bun run build`

Expected: PASS.

- [ ] **Step 4: Validate Docker Compose**

Run: `docker compose config`

Expected: PASS and no persistent Valkey volume.

- [ ] **Step 5: Inspect final diff**

Run: `git diff --stat HEAD~4..HEAD`

Expected: changes are limited to observability logging, Valkey write reduction, Docker Compose consolidation, and docs.

## Self-Review

- Spec coverage: covers RF-003 401 level, redaction, RF-003/MQTT debug logs, ephemeral Valkey default, removal of dev Compose, compare-before-set writes, timestamp policy, and verification.
- Incomplete-marker scan: no deferred implementation text remains inside task steps.
- Type consistency: storage helper type includes both `get` and `set`; app `WorkerDepsValkey` already has both methods; logger redaction is exported as `loggerRedactPaths` and used by tests.
