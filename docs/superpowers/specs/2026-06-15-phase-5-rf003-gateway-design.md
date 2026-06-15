# Phase 5 RF-003 Gateway — Design

**Date:** 2026-06-15
**Phase:** 5 of 7 (MVP spec)
**Goal:** Build typed, tested gateway primitives that authenticate against an iNELS RF-003 unit and issue cookie-aware HTTP calls with retry-on-401.

---

## Scope

This phase delivers gateway primitives only:

- Session management (login + cookie jar).
- Generic HTTP client with retry-on-401.
- Typed path catalog for known RF-003 endpoints.
- Response normalization (JSON-first).

**Out of scope (deferred to Phase 6):**

- Wiring the BullMQ worker to dispatch jobs through the gateway.
- Channel-level addressing for RFSA-66M (proof-of-concept treats devices as monolithic — real channel addressing requires hardware access to confirm).
- XML response parsing — the proof-of-concept uses JSON. If a real RF-003 returns XML, add support then.
- Endpoint-specific helpers (e.g. `getDevices`, `setDeviceState`) — `call(path)` is the only API surface for now.
- Network error wrapping — `fetch` rejections propagate as-is; the caller (worker) decides retry policy.

---

## Reference: Proof-of-Concept Protocol

Translated from [`arnostpleskot/homebridge-inels` `src/api/index.ts`](https://github.com/arnostpleskot/homebridge-inels/blob/main/src/api/index.ts) and `src/api/devices.ts`:

- Base URL: `http://<address>`. Login at `/login`; all other endpoints under `/api/<path>`.
- Authentication: `POST /login` with `application/x-www-form-urlencoded` body containing `name=<username>` and `key=<sha1(password)>` (hex digest).
- Session: cookies persisted in a jar; sent with every subsequent request.
- On HTTP 401: re-authenticate, retry the original request once.
- Response: `await res.json()` when `content-type` is set, else the raw response.
- Endpoints observed: `GET /api/devices`, `GET /api/devices/:id`, `GET /api/devices/:id/state`, `PUT /api/devices/:id` with JSON body `{ on: boolean }`.

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `fetch-cookie` | Wraps Bun's global `fetch` so cookies persist across calls |
| `tough-cookie` | Cookie jar implementation backing `fetch-cookie` |

SHA-1 is computed via `Bun.CryptoHasher` — no extra dependency.

---

## File Responsibilities

### `src/gateway/types.ts`

```ts
export type GatewaySession = {
  authenticate: () => Promise<void>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

export type GatewayClient = {
  call: (path: GatewayPath, init?: RequestInit) => Promise<unknown>;
};

export type GatewayErrorKind = "unauthorized" | "protocol";

export class GatewayError extends Error {
  constructor(
    public readonly kind: GatewayErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
```

### `src/gateway/paths.ts`

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

### `src/gateway/parser.ts`

```ts
export const parseGatewayResponse = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
};
```

### `src/gateway/session.ts`

`createGatewaySession(config: AppConfig["rf003"], logger: Logger): GatewaySession`

- Creates `new CookieJar()` from `tough-cookie`.
- Wraps `globalThis.fetch` with `fetch-cookie` so cookies persist across both the authenticate call and subsequent requests.
- `authenticate()`: POSTs to `${config.baseUrl}/login` with body `URLSearchParams` containing `name=<username>`, `key=<sha1Hex(password)>`. Non-2xx throws `GatewayError("unauthorized", "Login failed: HTTP <status>")`. Logs info on success.
- `fetch(url, init)`: delegates to the cookie-aware wrapped fetch.
- SHA-1: `new Bun.CryptoHasher("sha1").update(password).digest("hex")`.

### `src/gateway/client.ts`

`createGatewayClient(config: AppConfig["rf003"], session: GatewaySession, logger: Logger): GatewayClient`

`call(path, init = { method: "GET" })`:

1. Build URL: `${config.baseUrl}/api/${path}`.
2. First request: `session.fetch(url, init)`.
3. If status is 401: log `warn`, `await session.authenticate()`, retry once.
4. If retry is still 401: throw `GatewayError("unauthorized", "Still 401 after re-auth: <path>")`.
5. If response is non-ok (and not 401): throw `GatewayError("protocol", "HTTP <status> for <path>")`.
6. On success: return `parseGatewayResponse(response)`.

Network failures (DNS, connection refused, timeouts) propagate as the original `TypeError`/`Error` from `fetch`. The worker handles retry policy.

---

## Tests

| File | What is tested |
|------|---------------|
| `src/gateway/paths.test.ts` | Helper functions return expected strings |
| `src/gateway/parser.test.ts` | JSON content-type → parsed object; text content-type → string; missing content-type → string |
| `src/gateway/session.test.ts` | `authenticate()` POSTs correct URL + form body (`name`, `key=sha1hex`); non-2xx throws `GatewayError("unauthorized")`. Stubs `globalThis.fetch` |
| `src/gateway/client.test.ts` | URL constructed as `<baseUrl>/api/<path>`; 200 returns parsed response; 401 triggers `session.authenticate()` and retries; persistent 401 throws `GatewayError("unauthorized")`; 500 throws `GatewayError("protocol")`. Uses a fake `GatewaySession` |

No test for `types.ts` (types only). `session.test.ts` stubs `globalThis.fetch` directly because `fetch-cookie` operates on the global; `client.test.ts` works with a fake `GatewaySession` object so the cookie jar plumbing is not exercised twice.

---

## Architectural Decisions

**Why factories rather than classes?** Existing modules (`createMqttClient`, `createValkeyClient`, `createGatewayQueue`, `createGatewayWorker`, `createHttpServer`, `createApp`) all use factory functions. Consistency over personal preference.

**Why typed `GatewayPath` rather than raw strings?** Catches path-prefix typos at compile time. Helpers like `gatewayPaths.device(id)` localize ID interpolation in one place, making it trivial to add `encodeURIComponent` later if needed.

**Why JSON-only parser?** Proof-of-concept uses JSON exclusively. Defer XML support until we observe a real RF-003 response that requires it. Adding XML now would be speculation.

**Why split session and client?** The session owns auth/cookies. The client owns retry policy and URL construction. Keeping them separate means each is small and independently testable; the cookie jar plumbing is exercised in one place only.

**Why no operation helpers (`getDevices`, etc.)?** Phase 6 will need them and will know the real shapes. Building them now without RF-003 hardware would lock in proof-of-concept assumptions that may be wrong (especially around RFSA-66M channels).

---

## Out of Scope

- BullMQ worker job dispatch (Phase 6).
- Channel-level endpoint inventory for RFSA-66M (Phase 6, with hardware).
- XML response support (defer until needed).
- Endpoint-specific operation helpers (Phase 6).
- Connection pooling, retry/backoff beyond the single 401 retry (Phase 6 or hardening).
- Readiness check integration — RF-003 session readiness probe is already planned for Phase 6 per the Phase 4 design doc.
