# Phase 1 Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the Bun/TypeScript bridge with project scripts, typed configuration, structured logging, and a working health endpoint.

**Architecture:** Phase 1 creates the application skeleton without RF-003, MQTT, BullMQ, or Valkey behavior. Runtime composition lives in `src/app/`, pure configuration parsing lives in `src/config/`, logging lives in `src/observability/`, and Elysia HTTP routes live in `src/http/`.

**Tech Stack:** Bun, TypeScript, Elysia, Pino, pino-pretty, Bun test runner.

---

## File Structure

- Create `package.json`: package metadata, scripts, runtime dependencies, dev dependencies.
- Create `tsconfig.json`: strict TypeScript config for Bun.
- Create `src/index.ts`: process entrypoint that starts the app.
- Create `src/app/app.ts`: app composition and startup/shutdown wiring.
- Create `src/config/env.ts`: typed environment parsing with defaults.
- Create `src/config/env.test.ts`: config parser tests.
- Create `src/observability/logger.ts`: root Pino logger factory.
- Create `src/http/server.ts`: Elysia server creation with `/healthz`.
- Create `src/http/server.test.ts`: health endpoint test.
- Create empty `.gitkeep` files for planned directories not populated in Phase 1.

Planned directories to create now:

```text
src/
|-- app/
|-- config/
|-- devices/
|-- gateway/
|-- http/
|-- mqtt/
|-- observability/
|-- queue/
`-- storage/
```

## Task 1: Package And TypeScript Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "elan-ha",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit",
    "format": "bunx prettier --write .",
    "build": "bun build src/index.ts --outdir dist --target bun"
  },
  "dependencies": {
    "elysia": "latest",
    "pino": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "pino-pretty": "latest",
    "prettier": "latest",
    "typescript": "latest"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `bun install`

Expected: dependencies install and `bun.lock` is created.

- [ ] **Step 4: Verify Bun can run the empty test suite**

Run: `bun test`

Expected: Bun test runner exits successfully with no test files found.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json bun.lock
git commit -m "chore: bootstrap bun typescript project"
```

## Task 2: Typed Environment Parsing

**Files:**
- Create: `src/config/env.ts`
- Create: `src/config/env.test.ts`

- [ ] **Step 1: Write failing config tests**

```ts
import { describe, expect, test } from "bun:test";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  test("parses required settings and applies defaults", () => {
    const config = parseEnv({
      RF003_BASE_URL: "http://rf003.local",
      RF003_USERNAME: "admin",
      RF003_PASSWORD: "secret",
      MQTT_URL: "mqtt://mosquitto.local:1883",
      VALKEY_URL: "redis://valkey.local:6379",
    });

    expect(config.rf003.baseUrl).toBe("http://rf003.local");
    expect(config.rf003.username).toBe("admin");
    expect(config.rf003.password).toBe("secret");
    expect(config.mqtt.url).toBe("mqtt://mosquitto.local:1883");
    expect(config.mqtt.discoveryPrefix).toBe("homeassistant");
    expect(config.mqtt.baseTopic).toBe("inels");
    expect(config.valkey.url).toBe("redis://valkey.local:6379");
    expect(config.poll.fullStateIntervalMs).toBe(60_000);
    expect(config.poll.deviceStateIntervalMs).toBe(300_000);
    expect(config.http.host).toBe("0.0.0.0");
    expect(config.http.port).toBe(3000);
    expect(config.logLevel).toBe("info");
  });

  test("throws when a required setting is missing", () => {
    expect(() => parseEnv({})).toThrow("Missing required environment variable RF003_BASE_URL");
  });

  test("throws when a numeric setting is invalid", () => {
    expect(() =>
      parseEnv({
        RF003_BASE_URL: "http://rf003.local",
        RF003_USERNAME: "admin",
        RF003_PASSWORD: "secret",
        MQTT_URL: "mqtt://mosquitto.local:1883",
        VALKEY_URL: "redis://valkey.local:6379",
        HTTP_PORT: "invalid",
      }),
    ).toThrow("HTTP_PORT must be a valid integer");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/config/env.test.ts`

Expected: FAIL because `src/config/env.ts` does not exist.

- [ ] **Step 3: Implement config parser**

```ts
export type AppConfig = {
  rf003: {
    baseUrl: string;
    username: string;
    password: string;
  };
  mqtt: {
    url: string;
    username?: string;
    password?: string;
    discoveryPrefix: string;
    baseTopic: string;
  };
  valkey: {
    url: string;
  };
  poll: {
    fullStateIntervalMs: number;
    deviceStateIntervalMs: number;
  };
  http: {
    host: string;
    port: number;
  };
  logLevel: "debug" | "info" | "warn" | "error";
};

type EnvInput = Record<string, string | undefined>;

const requireEnv = (env: EnvInput, name: string): string => {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

const parseInteger = (env: EnvInput, name: string, defaultValue: number): number => {
  const rawValue = env[name];
  if (!rawValue) {
    return defaultValue;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a valid integer`);
  }
  return value;
};

const parseLogLevel = (value: string | undefined): AppConfig["logLevel"] => {
  if (!value) {
    return "info";
  }

  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  throw new Error("LOG_LEVEL must be one of debug, info, warn, error");
};

export const parseEnv = (env: EnvInput): AppConfig => {
  const mqtt: AppConfig["mqtt"] = {
    url: requireEnv(env, "MQTT_URL"),
    discoveryPrefix: env.MQTT_DISCOVERY_PREFIX ?? "homeassistant",
    baseTopic: env.MQTT_BASE_TOPIC ?? "inels",
  };

  if (env.MQTT_USERNAME) {
    mqtt.username = env.MQTT_USERNAME;
  }

  if (env.MQTT_PASSWORD) {
    mqtt.password = env.MQTT_PASSWORD;
  }

  return {
    rf003: {
      baseUrl: requireEnv(env, "RF003_BASE_URL"),
      username: requireEnv(env, "RF003_USERNAME"),
      password: requireEnv(env, "RF003_PASSWORD"),
    },
    mqtt,
    valkey: {
      url: requireEnv(env, "VALKEY_URL"),
    },
    poll: {
      fullStateIntervalMs: parseInteger(env, "POLL_FULL_STATE_INTERVAL_MS", 60_000),
      deviceStateIntervalMs: parseInteger(env, "POLL_DEVICE_STATE_INTERVAL_MS", 300_000),
    },
    http: {
      host: env.HTTP_HOST ?? "0.0.0.0",
      port: parseInteger(env, "HTTP_PORT", 3000),
    },
    logLevel: parseLogLevel(env.LOG_LEVEL),
  };
};

export const loadConfig = (): AppConfig => parseEnv(Bun.env);
```

- [ ] **Step 4: Run config tests**

Run: `bun test src/config/env.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts
git commit -m "feat: add typed environment config"
```

## Task 3: Structured Logger

**Files:**
- Create: `src/observability/logger.ts`

- [ ] **Step 1: Create logger factory**

```ts
import pino, { type Logger } from "pino";
import type { AppConfig } from "../config/env";

export const createLogger = (config: Pick<AppConfig, "logLevel">): Logger => {
  const isDevelopment = Bun.env.NODE_ENV === "development";

  return pino({
    level: config.logLevel,
    transport: isDevelopment
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  });
};
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/observability/logger.ts
git commit -m "feat: add structured logger"
```

## Task 4: Health HTTP Server

**Files:**
- Create: `src/http/server.ts`
- Create: `src/http/server.test.ts`

- [ ] **Step 1: Write failing health endpoint test**

```ts
import { describe, expect, test } from "bun:test";
import { createHttpServer } from "./server";

describe("createHttpServer", () => {
  test("GET /healthz returns ok", async () => {
    const app = createHttpServer();
    const response = await app.handle(new Request("http://localhost/healthz"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/http/server.test.ts`

Expected: FAIL because `src/http/server.ts` does not exist.

- [ ] **Step 3: Implement HTTP server factory**

```ts
import { Elysia } from "elysia";

export const createHttpServer = () =>
  new Elysia().get("/healthz", () => ({
    status: "ok" as const,
  }));

export type HttpServer = ReturnType<typeof createHttpServer>;
```

- [ ] **Step 4: Run HTTP test**

Run: `bun test src/http/server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/http/server.ts src/http/server.test.ts
git commit -m "feat: add health endpoint"
```

## Task 5: App Composition And Entrypoint

**Files:**
- Create: `src/app/app.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create app composition**

```ts
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { createHttpServer } from "../http/server";

export type App = {
  start: () => void;
};

export const createApp = (config: AppConfig, logger: Logger): App => ({
  start: () => {
    const httpLogger = logger.child({ module: "http" });
    const server = createHttpServer();

    server.listen({
      hostname: config.http.host,
      port: config.http.port,
    });

    httpLogger.info({ host: config.http.host, port: config.http.port }, "http server started");
  },
});
```

- [ ] **Step 2: Create process entrypoint**

```ts
import { createApp } from "./app/app";
import { loadConfig } from "./config/env";
import { createLogger } from "./observability/logger";

const config = loadConfig();
const logger = createLogger(config);

createApp(config, logger).start();
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.ts src/index.ts
git commit -m "feat: compose bridge application"
```

## Task 6: Preserve Target Source Layout

**Files:**
- Create: `src/devices/.gitkeep`
- Create: `src/gateway/.gitkeep`
- Create: `src/mqtt/.gitkeep`
- Create: `src/queue/.gitkeep`
- Create: `src/storage/.gitkeep`

- [ ] **Step 1: Add placeholder files for planned directories**

Create empty files:

```text
src/devices/.gitkeep
src/gateway/.gitkeep
src/mqtt/.gitkeep
src/queue/.gitkeep
src/storage/.gitkeep
```

- [ ] **Step 2: Confirm source tree exists**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/devices/.gitkeep src/gateway/.gitkeep src/mqtt/.gitkeep src/queue/.gitkeep src/storage/.gitkeep
git commit -m "chore: add planned source directories"
```

## Task 7: Phase 1 Verification

**Files:**
- Verify all Phase 1 files.

- [ ] **Step 1: Run test suite**

Run: `bun test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `bun run build`

Expected: PASS and `dist/index.js` is created.

- [ ] **Step 4: Start app manually for health check**

Run:

```bash
RF003_BASE_URL=http://rf003.local RF003_USERNAME=admin RF003_PASSWORD=secret MQTT_URL=mqtt://mosquitto.local:1883 VALKEY_URL=redis://valkey.local:6379 bun src/index.ts
```

Expected: process starts and logs `http server started`.

- [ ] **Step 5: Request health endpoint from another shell**

Run: `curl http://127.0.0.1:3000/healthz`

Expected: `{"status":"ok"}`.

- [ ] **Step 6: Stop the manual app process**

Press `Ctrl+C` in the shell running `bun src/index.ts`.

- [ ] **Step 7: Commit verification fixes if any were needed**

```bash
git status --short
```

Expected: only intentional files are modified or untracked.
If fixes were needed, stage only those files and commit with a concise message describing the fix.

## Phase 1 Completion Criteria

- `bun install` has created `bun.lock`.
- `bun test` passes.
- `bun run typecheck` passes.
- `bun run build` passes.
- `GET /healthz` returns `{ "status": "ok" }`.
- Application code uses Pino, not `console.log`.
- No RF-003, MQTT, BullMQ, or Valkey runtime behavior is implemented beyond configuration placeholders.
