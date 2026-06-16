import { describe, expect, test } from "bun:test";
import type { ReadinessResult } from "../observability/readiness";
import { createHttpServer } from "./server";

const readyResult: ReadinessResult = { ready: true, mqtt: true, valkey: true, rf003: true };
const notReadyResult: ReadinessResult = { ready: false, mqtt: false, valkey: true, rf003: true };

const makeDeps = (overrides: Partial<Parameters<typeof createHttpServer>[0]> = {}) => ({
  getReadiness: async () => readyResult,
  forceDiscovery: async () => {},
  getDevices: async () => [],
  ...overrides,
});

describe("createHttpServer", () => {
  test("GET /healthz returns ok", async () => {
    const app = createHttpServer(makeDeps());
    const response = await app.handle(new Request("http://localhost/healthz"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("GET /readyz returns 200 when all dependencies are ready", async () => {
    const app = createHttpServer(makeDeps());
    const response = await app.handle(new Request("http://localhost/readyz"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true, mqtt: true, valkey: true, rf003: true });
  });

  test("GET /readyz returns 503 when a dependency is down", async () => {
    const app = createHttpServer(makeDeps({ getReadiness: async () => notReadyResult }));
    const response = await app.handle(new Request("http://localhost/readyz"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: false, mqtt: false, valkey: true, rf003: true });
  });

  test("GET /devices returns devices from dependency", async () => {
    const devices = [{ id: "09354", kind: "switch" }];
    const app = createHttpServer(makeDeps({ getDevices: async () => devices }));
    const response = await app.handle(new Request("http://localhost/devices"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(devices);
  });

  test("POST /discovery/force queues discovery and returns accepted", async () => {
    let called = false;
    const app = createHttpServer(
      makeDeps({
        forceDiscovery: async () => {
          called = true;
        },
      }),
    );
    const response = await app.handle(new Request("http://localhost/discovery/force", { method: "POST" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "queued" });
    expect(called).toBe(true);
  });
});
