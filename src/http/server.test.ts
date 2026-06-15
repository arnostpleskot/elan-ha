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
