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
      calls.push(init !== undefined ? { url, init } : { url });
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
