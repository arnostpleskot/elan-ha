# Phase 5 RF-003 Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build typed, tested gateway primitives that authenticate against an iNELS RF-003 unit and issue cookie-aware HTTP calls with retry-on-401.

**Architecture:** Factory-function modules following the project's existing pattern. `createGatewaySession` owns cookies and authentication; `createGatewayClient` owns retry-on-401 and URL construction. Typed `GatewayPath` literal type prevents arbitrary path strings. JSON-only response parser matching the proof-of-concept; no worker wiring (deferred to Phase 6).

**Tech Stack:** Bun test runner, TypeScript, fetch-cookie, tough-cookie, native fetch, Bun.CryptoHasher for SHA-1.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/gateway/types.ts` | Create | `GatewaySession`, `GatewayClient`, `GatewayError`, `GatewayErrorKind` |
| `src/gateway/paths.ts` | Create | `GatewayPath` literal type + `gatewayPaths` helper object |
| `src/gateway/paths.test.ts` | Create | Verify helper functions produce correct paths |
| `src/gateway/parser.ts` | Create | `parseGatewayResponse` — JSON or text |
| `src/gateway/parser.test.ts` | Create | JSON, text, missing content-type |
| `src/gateway/session.ts` | Create | `createGatewaySession` — cookie jar + authenticate + fetch |
| `src/gateway/session.test.ts` | Create | Login posts correct form; non-2xx throws GatewayError |
| `src/gateway/client.ts` | Create | `createGatewayClient` — typed call with retry-on-401 |
| `src/gateway/client.test.ts` | Create | URL construction, 200 path, 401 retry, persistent 401, 500 error |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

Run: `bun add fetch-cookie tough-cookie`

Expected: both packages added to `dependencies`.

- [ ] **Step 2: Verify typecheck still passes**

Run: `bun run typecheck`

Expected: no errors.

- [ ] **Step 3: Commit**

Run:
```bash
git add package.json bun.lock && git commit -m "chore: add fetch-cookie and tough-cookie dependencies"
```

Expected: signed commit succeeds. If signing fails, STOP and report BLOCKED — do not bypass signing.

---

## Task 2: Gateway Paths, Types, and Errors

`paths.ts` and `types.ts` are split by domain responsibility (paths own the URL shape; types own the contracts and error model) but they are interdependent (`types.ts` references `GatewayPath` from `paths.ts`). They are implemented and committed together to avoid a broken intermediate state.

**Files:**
- Create: `src/gateway/paths.ts`
- Create: `src/gateway/paths.test.ts`
- Create: `src/gateway/types.ts`

- [ ] **Step 1: Write failing test for paths**

Create `src/gateway/paths.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { gatewayPaths } from "./paths";

describe("gatewayPaths", () => {
  test("devices is the collection path", () => {
    expect(gatewayPaths.devices).toBe("devices");
  });

  test("device(id) interpolates id", () => {
    expect(gatewayPaths.device("rfsa66m_1")).toBe("devices/rfsa66m_1");
  });

  test("deviceState(id) appends /state", () => {
    expect(gatewayPaths.deviceState("rfsa66m_1")).toBe("devices/rfsa66m_1/state");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/gateway/paths.test.ts`

Expected: FAIL because `./paths` does not exist.

- [ ] **Step 3: Implement paths**

Create `src/gateway/paths.ts`:

```ts
export type GatewayPath =
  | "devices"
  | `devices/${string}`
  | `devices/${string}/state`;

export const gatewayPaths = {
  devices: "devices" as const,
  device: (id: string): GatewayPath => `devices/${id}`,
  deviceState: (id: string): GatewayPath => `devices/${id}/state`,
};
```

- [ ] **Step 4: Implement types and errors**

Create `src/gateway/types.ts`:

```ts
import type { GatewayPath } from "./paths";

export type GatewaySession = {
  authenticate: () => Promise<void>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

export type GatewayClient = {
  call: (path: GatewayPath, init?: RequestInit) => Promise<unknown>;
};

export type GatewayErrorKind = "unauthorized" | "protocol";

export class GatewayError extends Error {
  public readonly kind: GatewayErrorKind;

  constructor(kind: GatewayErrorKind, message: string) {
    super(message);
    this.name = "GatewayError";
    this.kind = kind;
  }
}
```

- [ ] **Step 5: Run checks**

Run: `bun test src/gateway/paths.test.ts && bun run typecheck`

Expected: 3 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

Run:
```bash
git add src/gateway/paths.ts src/gateway/paths.test.ts src/gateway/types.ts && git commit -m "feat: add gateway paths, types, and error model"
```

Expected: signed commit succeeds.

---

## Task 3: Response Parser

**Files:**
- Create: `src/gateway/parser.ts`
- Create: `src/gateway/parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/gateway/parser.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseGatewayResponse } from "./parser";

const makeResponse = (body: string, contentType?: string): Response => {
  const headers = new Headers();
  if (contentType !== undefined) {
    headers.set("content-type", contentType);
  }
  return new Response(body, { headers });
};

describe("parseGatewayResponse", () => {
  test("parses JSON when content-type is application/json", async () => {
    const response = makeResponse(JSON.stringify({ ok: true, count: 3 }), "application/json");
    const result = await parseGatewayResponse(response);
    expect(result).toEqual({ ok: true, count: 3 });
  });

  test("parses JSON when content-type includes charset", async () => {
    const response = makeResponse(JSON.stringify({ ok: true }), "application/json; charset=utf-8");
    const result = await parseGatewayResponse(response);
    expect(result).toEqual({ ok: true });
  });

  test("returns text when content-type is not JSON", async () => {
    const response = makeResponse("plain body", "text/plain");
    const result = await parseGatewayResponse(response);
    expect(result).toBe("plain body");
  });

  test("returns text when content-type is missing", async () => {
    const response = makeResponse("no content type body");
    const result = await parseGatewayResponse(response);
    expect(result).toBe("no content type body");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/gateway/parser.test.ts`

Expected: FAIL because `./parser` does not exist.

- [ ] **Step 3: Implement parser**

Create `src/gateway/parser.ts`:

```ts
export const parseGatewayResponse = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
};
```

- [ ] **Step 4: Run checks**

Run: `bun test src/gateway/parser.test.ts && bun run typecheck`

Expected: 4 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/gateway/parser.ts src/gateway/parser.test.ts && git commit -m "feat: add gateway response parser"
```

Expected: signed commit succeeds.

---

## Task 4: Session

**Files:**
- Create: `src/gateway/session.ts`
- Create: `src/gateway/session.test.ts`

**Note on Bun mocking:** `mock.module("fetch-cookie", ...)` and `mock.module("tough-cookie", ...)` should be set up at module level BEFORE the dynamic `await import("./session")` of the module under test.

- [ ] **Step 1: Write failing tests**

Create `src/gateway/session.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { GatewayError } from "./types";

type CapturedRequest = {
  url: string;
  init?: RequestInit;
};

let captured: CapturedRequest | null = null;
let fetchResponse: Response;
const originalFetch = globalThis.fetch;

const sha1Hex = (input: string): string =>
  new Bun.CryptoHasher("sha1").update(input).digest("hex");

beforeEach(() => {
  captured = null;
  fetchResponse = new Response(null, { status: 200 });
  globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
    captured = { url, init };
    return fetchResponse;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const { createGatewaySession } = await import("./session");

const fakeLogger = {
  child: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
} as unknown as Logger;

const config: AppConfig["rf003"] = {
  baseUrl: "http://10.0.0.5",
  username: "admin",
  password: "secret",
};

describe("createGatewaySession", () => {
  test("authenticate posts form body to /login", async () => {
    const session = createGatewaySession(config, fakeLogger);
    await session.authenticate();

    expect(captured?.url).toBe("http://10.0.0.5/login");
    expect(captured?.init?.method).toBe("POST");

    const body = captured?.init?.body as URLSearchParams;
    expect(body.get("name")).toBe("admin");
    expect(body.get("key")).toBe(sha1Hex("secret"));
  });

  test("authenticate throws GatewayError on non-2xx", async () => {
    fetchResponse = new Response(null, { status: 403 });
    const session = createGatewaySession(config, fakeLogger);

    let thrown: unknown = null;
    try {
      await session.authenticate();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GatewayError);
    expect((thrown as GatewayError).kind).toBe("unauthorized");
  });

  test("session.fetch delegates to wrapped fetch", async () => {
    const session = createGatewaySession(config, fakeLogger);
    await session.fetch("http://10.0.0.5/api/devices");

    expect(captured?.url).toBe("http://10.0.0.5/api/devices");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/gateway/session.test.ts`

Expected: FAIL because `./session` does not exist.

- [ ] **Step 3: Implement session**

Create `src/gateway/session.ts`:

```ts
import makeFetchCookie from "fetch-cookie";
import type { Logger } from "pino";
import { CookieJar } from "tough-cookie";
import type { AppConfig } from "../config/env";
import { GatewayError, type GatewaySession } from "./types";

const sha1Hex = (input: string): string =>
  new Bun.CryptoHasher("sha1").update(input).digest("hex");

export const createGatewaySession = (
  config: AppConfig["rf003"],
  logger: Logger,
): GatewaySession => {
  const sessionLogger = logger.child({ module: "gateway" });
  const jar = new CookieJar();
  const fetchWithCookies = makeFetchCookie(fetch, jar);

  return {
    fetch: (url, init) => fetchWithCookies(url, init),
    authenticate: async () => {
      const body = new URLSearchParams();
      body.append("name", config.username);
      body.append("key", sha1Hex(config.password));

      const response = await fetchWithCookies(`${config.baseUrl}/login`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        throw new GatewayError("unauthorized", `Login failed: HTTP ${response.status}`);
      }

      sessionLogger.info("rf-003 authenticated");
    },
  };
};
```

- [ ] **Step 4: Run checks**

Run: `bun test src/gateway/session.test.ts && bun run typecheck`

Expected: 3 tests pass; typecheck clean.

If a type error appears because `makeFetchCookie(fetch, jar)`'s return type does not match the expected `RequestInit` shape, the smallest fix is to add an explicit cast or `as unknown as typeof fetch` in `session.ts`. Do not change behavior.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/gateway/session.ts src/gateway/session.test.ts && git commit -m "feat: add gateway session with cookie jar"
```

Expected: signed commit succeeds.

---

## Task 5: Client

**Files:**
- Create: `src/gateway/client.ts`
- Create: `src/gateway/client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/gateway/client.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { createGatewayClient } from "./client";
import { gatewayPaths } from "./paths";
import { GatewayError, type GatewaySession } from "./types";

const fakeLogger = {
  child: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
} as unknown as Logger;

const config: AppConfig["rf003"] = {
  baseUrl: "http://10.0.0.5",
  username: "admin",
  password: "secret",
};

type CapturedCall = {
  url: string;
  init?: RequestInit;
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const emptyResponse = (status: number): Response => new Response(null, { status });

const makeSession = (responses: Response[]): { session: GatewaySession; calls: CapturedCall[]; authCount: () => number } => {
  const calls: CapturedCall[] = [];
  let authCalls = 0;
  let index = 0;

  const session: GatewaySession = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses[index];
      index += 1;
      if (next === undefined) {
        throw new Error(`No response queued for call ${index}`);
      }
      return next;
    },
    authenticate: mock(async () => {
      authCalls += 1;
    }),
  };

  return { session, calls, authCount: () => authCalls };
};

describe("createGatewayClient", () => {
  test("builds URL as <baseUrl>/api/<path>", async () => {
    const { session, calls } = makeSession([jsonResponse(200, { ok: true })]);
    const client = createGatewayClient(config, session, fakeLogger);

    await client.call(gatewayPaths.devices);

    expect(calls[0]?.url).toBe("http://10.0.0.5/api/devices");
  });

  test("defaults to GET when no init is provided", async () => {
    const { session, calls } = makeSession([jsonResponse(200, {})]);
    const client = createGatewayClient(config, session, fakeLogger);

    await client.call(gatewayPaths.devices);

    expect(calls[0]?.init?.method).toBe("GET");
  });

  test("returns parsed JSON on success", async () => {
    const { session } = makeSession([jsonResponse(200, { devices: ["a", "b"] })]);
    const client = createGatewayClient(config, session, fakeLogger);

    const result = await client.call(gatewayPaths.devices);

    expect(result).toEqual({ devices: ["a", "b"] });
  });

  test("re-authenticates and retries once on 401", async () => {
    const { session, calls, authCount } = makeSession([
      emptyResponse(401),
      jsonResponse(200, { ok: true }),
    ]);
    const client = createGatewayClient(config, session, fakeLogger);

    const result = await client.call(gatewayPaths.devices);

    expect(authCount()).toBe(1);
    expect(calls).toHaveLength(2);
    expect(result).toEqual({ ok: true });
  });

  test("throws unauthorized when 401 persists after re-auth", async () => {
    const { session } = makeSession([emptyResponse(401), emptyResponse(401)]);
    const client = createGatewayClient(config, session, fakeLogger);

    let thrown: unknown = null;
    try {
      await client.call(gatewayPaths.devices);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GatewayError);
    expect((thrown as GatewayError).kind).toBe("unauthorized");
  });

  test("throws protocol error on non-401 failure", async () => {
    const { session } = makeSession([emptyResponse(500)]);
    const client = createGatewayClient(config, session, fakeLogger);

    let thrown: unknown = null;
    try {
      await client.call(gatewayPaths.devices);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(GatewayError);
    expect((thrown as GatewayError).kind).toBe("protocol");
    expect((thrown as GatewayError).message).toContain("500");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/gateway/client.test.ts`

Expected: FAIL because `./client` does not exist.

- [ ] **Step 3: Implement client**

Create `src/gateway/client.ts`:

```ts
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import { parseGatewayResponse } from "./parser";
import type { GatewayPath } from "./paths";
import { GatewayError, type GatewayClient, type GatewaySession } from "./types";

const DEFAULT_INIT: RequestInit = { method: "GET" };

export const createGatewayClient = (
  config: AppConfig["rf003"],
  session: GatewaySession,
  logger: Logger,
): GatewayClient => {
  const clientLogger = logger.child({ module: "gateway" });

  const buildUrl = (path: GatewayPath): string => `${config.baseUrl}/api/${path}`;

  return {
    call: async (path, init = DEFAULT_INIT) => {
      const url = buildUrl(path);

      let response = await session.fetch(url, init);

      if (response.status === 401) {
        clientLogger.warn({ path }, "received 401, re-authenticating");
        await session.authenticate();
        response = await session.fetch(url, init);
      }

      if (response.status === 401) {
        throw new GatewayError("unauthorized", `Still 401 after re-auth: ${path}`);
      }

      if (!response.ok) {
        throw new GatewayError("protocol", `HTTP ${response.status} for ${path}`);
      }

      return parseGatewayResponse(response);
    },
  };
};
```

- [ ] **Step 4: Run checks**

Run: `bun test src/gateway/client.test.ts && bun run typecheck`

Expected: 6 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/gateway/client.ts src/gateway/client.test.ts && git commit -m "feat: add gateway client with retry-on-401"
```

Expected: signed commit succeeds.

---

## Task 6: Remove gateway placeholder

**Files:**
- Delete: `src/gateway/.gitkeep`

- [ ] **Step 1: Remove .gitkeep**

Run: `rm src/gateway/.gitkeep`

- [ ] **Step 2: Commit**

Run:
```bash
git add src/gateway/.gitkeep && git commit -m "chore: remove gateway placeholder"
```

Expected: signed commit succeeds.

---

## Task 7: Phase 5 Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`

Expected: all tests pass. Prior count was 31; this phase adds 3 (paths) + 4 (parser) + 3 (session) + 6 (client) = 16 new tests, for 47 total.

- [ ] **Step 2: Run typecheck and build**

Run: `bun run typecheck && bun run build`

Expected: both pass.

- [ ] **Step 3: Verify no scope creep**

Run: `git diff --name-only main...HEAD`

Expected: only files under `src/gateway`, `package.json`, `bun.lock`, and the plan/spec docs. No changes to `src/app`, `src/http`, `src/queue`, `src/mqtt`, `src/storage` — Phase 5 is gateway-only.

- [ ] **Step 4: Check clean status**

Run: `git status --short`

Expected: empty (clean tree).

---

## Phase 5 Completion Criteria

- `bun test`, `bun run typecheck`, `bun run build` all pass.
- `createGatewaySession` and `createGatewayClient` factories present and tested.
- `GatewayPath` is a literal-union type; `gatewayPaths` helpers cover devices/device/deviceState.
- `parseGatewayResponse` handles JSON and text content types.
- Retry-on-401 logic verified by client tests.
- No worker wiring, no MQTT command dispatch, no operation-specific helpers (those belong to Phase 6).
- No XML support added.
